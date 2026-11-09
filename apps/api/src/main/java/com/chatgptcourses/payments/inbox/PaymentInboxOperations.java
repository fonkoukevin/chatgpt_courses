package com.chatgptcourses.payments.inbox;

import static com.chatgptcourses.payments.inbox.PaymentInboxTypes.*;
import com.chatgptcourses.commerce.service.CommerceAuthorization;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentInboxOperations {
    private static final String VIEW="""
        SELECT e.id,'STRIPE_EVENT' AS kind,e.event_id,e.event_type,e.object_id,e.livemode,e.account_id,e.api_version,e.state,e.attempts,e.next_attempt_at,e.last_error_code,e.created_at,e.updated_at,e.processed_at,e.order_id,e.operation_id FROM stripe_event_inbox e
        UNION ALL SELECT j.id,'RECONCILIATION_JOB',NULL,NULL,NULL,p.livemode,p.account_id,'2026-10-28.endive',j.state,j.attempts,j.next_attempt_at,coalesce(j.last_error_code,p.last_error_code),j.created_at,j.updated_at,j.processed_at,j.order_id,j.operation_id FROM payment_reconciliation_jobs j JOIN checkout_operations p ON p.id=j.operation_id
        """;
    private static final Set<String> STATES=Set.of("PENDING","PROCESSING","RETRY","WAITING","PROCESSED","IGNORED","DEAD");
    private final JdbcTemplate jdbc;private final CommerceAuthorization auth;
    public PaymentInboxOperations(JdbcTemplate jdbc,CommerceAuthorization auth){this.jdbc=jdbc;this.auth=auth;}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public PaymentEventPage list(UUID actor,String state,int page,int pageSize){
        auth.require(actor,"payments.events.read");if(state!=null&&!STATES.contains(state)||page<0||page>1_000_000||pageSize<1||pageSize>100)throw new ApiException(ApiError.VALIDATION_FAILED);
        String filter=state==null?"":" WHERE state=?";Object[] countArgs=state==null?new Object[]{}:new Object[]{state};long total=jdbc.queryForObject("SELECT count(*) FROM("+VIEW+") work"+filter,Long.class,countArgs);
        var args=new java.util.ArrayList<Object>(List.of(countArgs));args.add(pageSize);args.add((long)page*pageSize);
        var values=jdbc.query("SELECT * FROM("+VIEW+") work"+filter+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",this::row,args.toArray());return new PaymentEventPage(values,page,pageSize,total);
    }
    @Transactional
    public PaymentEventSummary retry(UUID actor,UUID context,UUID id,String reason){
        auth.mutation(actor,context,"payments.events.retry");if(id==null||reason==null||!Set.of("PROVIDER_RECOVERED","MANUAL_RECONCILIATION").contains(reason))throw new ApiException(ApiError.VALIDATION_FAILED);
        var original=jdbc.query("SELECT * FROM("+VIEW+") work WHERE id=?",this::row,id);if(original.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);if(original.size()!=1)throw new ApiException(ApiError.CONFLICT);String table="STRIPE_EVENT".equals(original.getFirst().kind())?"stripe_event_inbox":"payment_reconciliation_jobs";
        var rows=jdbc.query("SELECT state,lease_until FROM "+table+" WHERE id=? FOR UPDATE",(rs,n)->new State(rs.getString(1),instant(rs,"lease_until")),id);if(rows.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
        auth.mutation(actor,context,"payments.events.retry");var current=rows.getFirst();
        boolean abandoned="PROCESSING".equals(current.state())&&Boolean.TRUE.equals(jdbc.queryForObject("SELECT lease_until<=clock_timestamp() FROM "+table+" WHERE id=?",Boolean.class,id));
        if(!Set.of("RETRY","DEAD","WAITING").contains(current.state())&&!abandoned)throw new ApiException(ApiError.CONFLICT);
        jdbc.update("UPDATE "+table+" SET state='RETRY',attempts=0,next_attempt_at=clock_timestamp(),lease_id=NULL,lease_until=NULL,last_error_code=NULL,processed_at=NULL,updated_at=greatest(updated_at,created_at,clock_timestamp()) WHERE id=?",id);
        jdbc.update("INSERT INTO payment_work_retries(id,inbox_id,reconciliation_id,actor_id,reason) VALUES(?,?,?,?,?)",UUID.randomUUID(),"stripe_event_inbox".equals(table)?id:null,"payment_reconciliation_jobs".equals(table)?id:null,actor,reason);
        return jdbc.queryForObject("SELECT * FROM("+VIEW+") work WHERE id=?",this::row,id);
    }
    private PaymentEventSummary row(ResultSet rs,int n)throws SQLException{return new PaymentEventSummary(rs.getObject("id",UUID.class),rs.getString("kind"),rs.getString("event_id"),rs.getString("event_type"),rs.getString("object_id"),rs.getBoolean("livemode"),rs.getString("account_id"),rs.getString("api_version"),rs.getString("state"),rs.getInt("attempts"),instant(rs,"next_attempt_at"),rs.getString("last_error_code"),instant(rs,"created_at"),instant(rs,"updated_at"),instant(rs,"processed_at"),rs.getObject("order_id",UUID.class),rs.getObject("operation_id",UUID.class));}
    /** An explicit operational request only schedules the existing P12 treatment. */
    @Transactional
    public UUID reconcileOrder(UUID actor,UUID context,UUID order,Long expectedRevision){
        auth.mutation(actor,context,"payments.events.retry");var owners=jdbc.query("SELECT owner_id FROM orders WHERE id=?",(r,n)->r.getObject(1,UUID.class),order);if(owners.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
        jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(r,n)->r.getObject(1,UUID.class),owners.getFirst());
        var rows=jdbc.query("SELECT revision,payment_operation_id FROM orders WHERE id=? FOR UPDATE",(r,n)->new Object[]{r.getLong(1),r.getObject(2,UUID.class)},order);auth.mutation(actor,context,"payments.events.retry");
        if(expectedRevision!=null&&!expectedRevision.equals(rows.getFirst()[0]))throw new ApiException(ApiError.REVISION_CONFLICT);UUID operation=(UUID)rows.getFirst()[1];if(operation==null)throw new ApiException(ApiError.RECONCILIATION_UNAVAILABLE);
        jdbc.update("INSERT INTO payment_reconciliation_jobs(id,operation_id,order_id,state,next_attempt_at) VALUES(?,?,?,'PENDING',clock_timestamp()) ON CONFLICT(operation_id) DO UPDATE SET state=CASE WHEN payment_reconciliation_jobs.state='PROCESSING' THEN 'PROCESSING' ELSE 'RETRY' END,attempts=CASE WHEN payment_reconciliation_jobs.state='PROCESSING' THEN payment_reconciliation_jobs.attempts ELSE 0 END,next_attempt_at=CASE WHEN payment_reconciliation_jobs.state='PROCESSING' THEN NULL ELSE clock_timestamp() END,processed_at=CASE WHEN payment_reconciliation_jobs.state='PROCESSING' THEN payment_reconciliation_jobs.processed_at ELSE NULL END,last_error_code=CASE WHEN payment_reconciliation_jobs.state='PROCESSING' THEN payment_reconciliation_jobs.last_error_code ELSE NULL END,updated_at=greatest(payment_reconciliation_jobs.updated_at,payment_reconciliation_jobs.created_at,clock_timestamp())",UUID.randomUUID(),operation,order);
        return jdbc.queryForObject("SELECT id FROM payment_reconciliation_jobs WHERE operation_id=?",UUID.class,operation);
    }
    private static Instant instant(ResultSet rs,String column)throws SQLException{Timestamp value=rs.getTimestamp(column);return value==null?null:value.toInstant();}
    private record State(String state,Instant leaseUntil){ }
}

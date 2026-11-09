package com.chatgptcourses.notifications;

import static com.chatgptcourses.notifications.NotificationTypes.*;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Operational metadata only. Callers cannot choose a recipient or supply an arbitrary message. */
@Service
public class NotificationOperations {
    private final JdbcTemplate jdbc;
    public NotificationOperations(JdbcTemplate jdbc){this.jdbc=jdbc;}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public NotificationPage list(UUID actor,String status,int page,int pageSize){
        require(actor,"notifications.read");if(page<0||page>1000000||pageSize<1||pageSize>100)throw invalid();
        if(status!=null&&!Set.of("PENDING","PROCESSING","RETRY","SENT","DEAD","INDETERMINATE").contains(status))throw invalid();
        var args=new ArrayList<Object>();String where=status==null?"":" WHERE status=?";if(status!=null)args.add(status);
        long total=jdbc.queryForObject("SELECT count(*) FROM notification_outbox"+where,Long.class,args.toArray());args.add(pageSize);args.add((long)page*pageSize);
        var items=jdbc.query("SELECT * FROM notification_outbox"+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",(rs,n)->view(rs),args.toArray());
        return new NotificationPage(items,page,pageSize,total);
    }
    @Transactional
    public NotificationSummary retry(UUID actor,UUID accountContext,UUID id,String reason,boolean ackDuplicate){
        require(actor,"notifications.manage");if(accountContext==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);if(!actor.equals(accountContext))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);
        if(reason==null||!Set.of("CONFIGURATION_FIXED","MANUAL_RECONCILIATION").contains(reason)||id==null)throw invalid();
        var rows=jdbc.query("SELECT * FROM notification_outbox WHERE id=? FOR UPDATE",(rs,n)->view(rs),id);if(rows.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);var old=rows.getFirst();require(actor,"notifications.manage");
        if(!Set.of("RETRY","DEAD","INDETERMINATE").contains(old.status())||!old.payloadAvailable()||!old.expiresAt().isAfter(Instant.now())||!Boolean.TRUE.equals(jdbc.queryForObject("SELECT expires_at>clock_timestamp() FROM notification_outbox WHERE id=?",Boolean.class,id))||old.status().equals("INDETERMINATE")&&!ackDuplicate)throw new ApiException(ApiError.CONFLICT);
        jdbc.update("UPDATE notification_outbox SET status='RETRY',cycle_attempts=0,requeue_count=requeue_count+1,next_attempt_at=clock_timestamp(),last_error_code=NULL,updated_at=greatest(updated_at,created_at,clock_timestamp()) WHERE id=?",id);
        jdbc.update("INSERT INTO notification_outbox_requeues(id,notification_id,actor_id,previous_status,reason,duplicate_acknowledged) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),id,actor,old.status(),reason,ackDuplicate);
        return jdbc.queryForObject("SELECT * FROM notification_outbox WHERE id=?",(rs,n)->view(rs),id);
    }
    private void require(UUID actor,String permission){if(actor==null||!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code=?)",Boolean.class,actor,permission)))throw new AccessDeniedException("Notification operation unavailable");}
    private static NotificationSummary view(ResultSet rs)throws SQLException{return new NotificationSummary(rs.getObject("id",UUID.class),rs.getString("event_type"),rs.getString("status"),rs.getInt("attempts"),rs.getInt("cycle_attempts"),rs.getInt("requeue_count"),instant(rs,"next_attempt_at"),instant(rs,"lease_until"),rs.getString("last_error_code"),instant(rs,"created_at"),instant(rs,"updated_at"),instant(rs,"expires_at"),instant(rs,"sent_at"),instant(rs,"purged_at"),rs.getBytes("payload_ciphertext")!=null);}
    private static Instant instant(ResultSet rs,String name)throws SQLException{Timestamp value=rs.getTimestamp(name);return value==null?null:value.toInstant();}
    private static ApiException invalid(){return new ApiException(ApiError.VALIDATION_FAILED);}
}

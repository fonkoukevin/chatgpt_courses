package com.chatgptcourses.payments.refunds;

import static com.chatgptcourses.payments.refunds.RefundTypes.*;
import com.chatgptcourses.commerce.service.CommerceTypes.OrderSnapshot;
import com.chatgptcourses.commerce.service.PaymentGateway;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** Transaction-local projections; no provider reference or personal reason is logged. */
@Component
class RefundStore {
    final JdbcTemplate jdbc;final ObjectMapper mapper;private final PaymentGateway gateway;
    RefundStore(JdbcTemplate jdbc,ObjectMapper mapper,PaymentGateway gateway){this.jdbc=jdbc;this.mapper=mapper;this.gateway=gateway;}
    Order order(UUID id,boolean lock){var rows=jdbc.query("SELECT o.*,p.session_id,p.payment_intent_id FROM orders o LEFT JOIN checkout_operations p ON p.id=o.payment_operation_id WHERE o.id=?"+(lock?" FOR UPDATE OF o":""),(rs,n)->new Order(id,uuid(rs,"owner_id"),rs.getLong("revision"),rs.getString("payment_status"),rs.getString("fulfillment_status"),rs.getLong("total_amount"),rs.getString("currency"),mapper.readValue(rs.getString("snapshot_json"),OrderSnapshot.class),uuid(rs,"payment_operation_id"),rs.getString("session_id"),rs.getString("payment_intent_id"),rs.getBoolean("refund_review_required"),rs.getBoolean("refund_full"),instant(rs,"refund_reconciled_at")),id);if(rows.isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();}
    void lockOwner(UUID owner){if(jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->uuid(rs,"id"),owner).isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);}
    Request request(UUID id,boolean lock){var rows=jdbc.query("SELECT * FROM refund_requests WHERE id=?"+(lock?" FOR UPDATE":""),(rs,n)->new Request(id,uuid(rs,"owner_id"),uuid(rs,"order_id"),rs.getLong("revision"),rs.getString("state"),rs.getString("reason"),uuid(rs,"decision_id"),instant(rs,"created_at"),instant(rs,"updated_at")),id);if(rows.isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();}
    Operation operation(UUID id,boolean lock){var rows=jdbc.query("SELECT * FROM refund_operations WHERE id=?"+(lock?" FOR UPDATE":""),this::operation,id);if(rows.isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();}
    Operation operation(ResultSet r,int n)throws SQLException{return new Operation(uuid(r,"id"),uuid(r,"owner_id"),uuid(r,"order_id"),uuid(r,"request_id"),r.getLong("revision"),r.getString("origin"),r.getString("state"),r.getLong("amount_minor"),r.getString("currency"),r.getString("account_id"),r.getString("provider_refund_id"),r.getString("payment_intent_id"),r.getString("provider_idempotency_key"),r.getString("request_json"),allocations(r.getString("allocations_json")),r.getString("access_state"),r.getString("last_error_code"),uuid(r,"lease_id"),instant(r,"lease_until"),instant(r,"created_at"),instant(r,"updated_at"),instant(r,"confirmed_at"));}
    RefundRequestView requestView(Request r){RefundDecisionView decision=null;if(r.decision()!=null)decision=jdbc.queryForObject("SELECT d.*,p.id AS operation_id FROM refund_decisions d LEFT JOIN refund_operations p ON p.decision_id=d.id WHERE d.id=?",(rs,n)->new RefundDecisionView(r.decision(),rs.getString("outcome"),rs.getString("reason"),(Long)rs.getObject("amount_minor"),allocations(rs.getString("allocations_json")),uuid(rs,"operation_id"),instant(rs,"created_at")),r.decision());return new RefundRequestView(r.id(),r.revision(),r.order(),r.state(),r.reason(),decision,r.created(),r.updated());}
    RefundOperationView operationView(UUID actor,Operation p){
        var overridden=jdbc.query("SELECT allocations_json::text FROM refund_access_decisions WHERE operation_id=?",(rs,n)->allocations(rs.getString(1)),p.id());var allocations=overridden.isEmpty()?p.allocations():overridden.getFirst();
        boolean execute=permission(actor,"refunds.execute"),reconcile=permission(actor,"refunds.reconcile"),decide=permission(actor,"refunds.decide");
        return new RefundOperationView(p.id(),p.revision(),p.order(),p.request(),p.origin(),p.state(),p.amount(),p.currency(),allocations,p.access(),p.error(),p.created(),p.updated(),p.confirmed(),notification(p.id()),execute&&gateway.configured()&&"PREPARED".equals(p.state()),execute&&"PREPARED".equals(p.state())&&p.requestJson()==null,reconcile&&!Set.of("PREPARED","CANCELED").contains(p.state()),decide&&"STRIPE_DASHBOARD".equals(p.origin())&&"SUCCEEDED".equals(p.state())&&"NEEDS_REVIEW".equals(p.access()));
    }
    boolean permission(UUID actor,String code){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code=?)",Boolean.class,actor,code));}
    String notification(UUID operation){var rows=jdbc.query("SELECT status FROM notification_outbox WHERE business_key=?",(rs,n)->rs.getString(1),"refund:confirmed:"+operation);if(rows.isEmpty())return "NONE";return switch(rows.getFirst()){case "SENT"->"SENT";case "DEAD","RETRY","INDETERMINATE"->"ISSUE";default->"PENDING";};}
    Totals totals(Order o){long confirmed=Objects.requireNonNull(jdbc.queryForObject("SELECT coalesce(sum(amount_minor),0) FROM refund_operations WHERE order_id=? AND confirmed_at IS NOT NULL",Long.class,o.id()));long reserved=Objects.requireNonNull(jdbc.queryForObject("SELECT coalesce(sum(amount_minor),0) FROM refund_reservations WHERE order_id=? AND released_at IS NULL",Long.class,o.id()));return new Totals(confirmed,reserved,"PAID".equals(o.payment())?Math.max(0,o.amount()-confirmed-reserved):0);}
    List<RefundLine> lines(Order o){return o.snapshot().resources().stream().map(r->new RefundLine(r.id(),r.resourceId(),r.versionId(),r.versionNumber(),r.title(),r.locales(),Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM access_grants WHERE order_resource_id=? AND revoked_at IS NOT NULL) OR EXISTS(SELECT 1 FROM refund_access_blocks WHERE order_resource_id=?)",Boolean.class,r.id(),r.id())))).toList();}
    UUID replay(UUID actor,String scope,UUID key,byte[] hash,boolean operation){var rows=jdbc.query("SELECT request_hash,request_id,operation_id FROM refund_idempotency_keys WHERE actor_id=? AND scope=? AND idempotency_key=?",(rs,n)->{if(!MessageDigest.isEqual(hash,rs.getBytes(1)))throw error(ApiError.CONFLICT);return rs.getObject(operation?3:2,UUID.class);},actor,scope,key);return rows.isEmpty()?null:rows.getFirst();}
    void remember(UUID actor,String scope,UUID key,byte[] hash,UUID request,UUID operation){int count=jdbc.update("INSERT INTO refund_idempotency_keys(actor_id,scope,idempotency_key,request_hash,request_id,operation_id) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING",actor,scope,key,hash,request,operation);if(count==0){UUID existing=replay(actor,scope,key,hash,operation!=null);if(!Objects.equals(existing,operation!=null?operation:request))throw error(ApiError.CONFLICT);}}
    void audit(UUID actor,UUID order,UUID request,UUID operation,String action,String result,String reason){jdbc.update("INSERT INTO refund_audit(id,actor_id,order_id,request_id,operation_id,action,result,reason) VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID(),actor,order,request,operation,action,result,reason);}
    void enqueue(UUID order){jdbc.update("INSERT INTO refund_reconciliation_jobs(id,order_id,state,next_attempt_at) VALUES(?,?,'PENDING',clock_timestamp()) ON CONFLICT(order_id) DO UPDATE SET state=CASE WHEN refund_reconciliation_jobs.state='PROCESSING' THEN 'PROCESSING' ELSE 'PENDING' END,next_attempt_at=CASE WHEN refund_reconciliation_jobs.state='PROCESSING' THEN NULL ELSE clock_timestamp() END,attempts=0,last_error_code=NULL,updated_at=clock_timestamp()",UUID.randomUUID(),order);}
    void state(UUID id,String state,String code){jdbc.update("UPDATE refund_operations SET state=?,last_error_code=?,lease_id=NULL,lease_until=NULL,updated_at=greatest(created_at,updated_at,clock_timestamp()),revision=revision+1 WHERE id=?",state,code,id);}
    void release(UUID id,String reason){jdbc.update("UPDATE refund_reservations SET released_at=greatest(created_at,clock_timestamp()),release_reason=? WHERE operation_id=? AND released_at IS NULL",reason,id);}
    List<RefundAllocation> allocations(String json){return json==null?List.of():List.copyOf(Arrays.asList(mapper.readValue(json,RefundAllocation[].class)));}
    String json(Object value){return mapper.writeValueAsString(value);}
    byte[] hash(Object value){try{return MessageDigest.getInstance("SHA-256").digest(json(value).getBytes(StandardCharsets.UTF_8));}catch(java.security.NoSuchAlgorithmException unavailable){throw new IllegalStateException("SHA-256 unavailable");}}
    String fingerprint(Object value){return HexFormat.of().formatHex(hash(value));}
    static UUID key(String value){if(value==null||value.isBlank())throw error(ApiError.IDEMPOTENCY_KEY_REQUIRED);try{if(!value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"))throw new IllegalArgumentException();return UUID.fromString(value);}catch(IllegalArgumentException invalid){throw error(ApiError.VALIDATION_FAILED);}}
    static void reason(String value){check(value!=null&&!value.isBlank()&&value.length()<=2000&&value.indexOf('\0')<0);}
    static void page(int page,int size){check(page>=0&&page<=1_000_000&&size>=1&&size<=100);}
    static void check(boolean good){if(!good)throw error(ApiError.VALIDATION_FAILED);}
    static ApiException error(ApiError value){return new ApiException(value);}
    static UUID uuid(ResultSet r,String name)throws SQLException{return r.getObject(name,UUID.class);}
    static Instant instant(ResultSet r,String name)throws SQLException{Timestamp t=r.getTimestamp(name);return t==null?null:t.toInstant();}
    record Order(UUID id,UUID owner,long revision,String payment,String fulfillment,long amount,String currency,OrderSnapshot snapshot,UUID checkout,String session,String intent,boolean review,boolean full,Instant reconciled){ }
    record Request(UUID id,UUID owner,UUID order,long revision,String state,String reason,UUID decision,Instant created,Instant updated){@Override public String toString(){return "RefundRequest[redacted]";}}
    record Operation(UUID id,UUID owner,UUID order,UUID request,long revision,String origin,String state,long amount,String currency,String account,String providerRefund,String intent,String providerKey,String requestJson,List<RefundAllocation> allocations,String access,String error,UUID lease,Instant leaseUntil,Instant created,Instant updated,Instant confirmed){@Override public String toString(){return "RefundOperation[redacted]";}}
    record Totals(long confirmed,long reserved,long available){ }
}

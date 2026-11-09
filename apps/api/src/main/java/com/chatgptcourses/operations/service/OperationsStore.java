package com.chatgptcourses.operations.service;

import static com.chatgptcourses.account.service.AccountOperations.*;
import com.chatgptcourses.account.service.AccountOperations;
import com.chatgptcourses.commerce.service.CommerceAuthorization;
import com.chatgptcourses.shared.http.ApiError;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class OperationsStore {
    public final JdbcTemplate jdbc;public final ObjectMapper mapper;public final CommerceAuthorization auth;private final AccountOperations accounts;
    public OperationsStore(AccountOperations accounts){this.accounts=accounts;jdbc=accounts.jdbc;mapper=accounts.mapper;auth=accounts.authorization;}
    public static void period(Instant from,Instant to){check(from!=null&&to!=null&&from.isBefore(to)&&Duration.between(from,to).compareTo(Duration.ofDays(366))<=0);}
    public static void currency(String currency){if(currency!=null)check(Set.of("EUR","USD","GBP").contains(currency));}
    public void lockParticipants(UUID actor,UUID owner){java.util.stream.Stream.of(actor,owner).filter(Objects::nonNull).distinct().sorted().forEach(accounts::lock);}
    public UUID lockTicket(UUID actor,UUID id){var owners=jdbc.query("SELECT owner_id FROM support_tickets WHERE id=?",(r,n)->r.getObject(1,UUID.class),id);if(owners.isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);lockParticipants(actor,owners.getFirst());jdbc.query("SELECT id FROM support_tickets WHERE id=? FOR UPDATE",(r,n)->r.getObject(1,UUID.class),id);return owners.getFirst();}
    public boolean permitted(UUID actor,String permission){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code=?)",Boolean.class,actor,permission));}
    public void assignee(UUID id,String permission){if(id!=null&&!permitted(id,permission))throw error(ApiError.ASSIGNEE_UNAVAILABLE);}
    public byte[] hash(Object value){return accounts.hash(value);}
    public String json(Object value){return accounts.json(value);}
    public Replay replay(UUID actor,String scope,UUID key,byte[] hash){var rows=jdbc.query("SELECT request_fingerprint,result_kind,result_id FROM operations_action_keys WHERE actor_id=? AND scope=? AND idempotency_key=?",(r,n)->{if(!java.security.MessageDigest.isEqual(hash,r.getBytes(1)))throw error(ApiError.CONFLICT);return new Replay(r.getString(2),r.getObject(3,UUID.class));},actor,scope,key);return rows.isEmpty()?null:rows.getFirst();}
    public void remember(UUID actor,String scope,UUID key,byte[] hash,String kind,UUID result){jdbc.update("INSERT INTO operations_action_keys(actor_id,scope,idempotency_key,request_fingerprint,result_kind,result_id) VALUES(?,?,?,?,?,?)",actor,scope,key,hash,kind,result);}
    public UUID audit(UUID actor,String action,String kind,UUID object,String reason,String result){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO operations_audit(id,actor_id,action,object_type,object_id,reason_code,result) VALUES(?,?,?,?,?,?,?)",id,actor,action,kind,object,reason,result);return id;}
    public Timestamp now(){return jdbc.queryForObject("SELECT clock_timestamp()",Timestamp.class);}
    public Timestamp ticketStamp(UUID ticket){return jdbc.queryForObject("""
      SELECT greatest(clock_timestamp(),t.updated_at+interval '1 microsecond',coalesce((SELECT max(h.at)+interval '1 microsecond' FROM(
       SELECT created_at AS at FROM support_messages WHERE ticket_id=t.id UNION ALL SELECT created_at FROM support_ticket_events WHERE ticket_id=t.id
       UNION ALL SELECT created_at FROM support_internal_notes WHERE ticket_id=t.id UNION ALL SELECT created_at FROM support_time_entries WHERE ticket_id=t.id
       UNION ALL SELECT updated_at FROM support_reply_drafts WHERE ticket_id=t.id UNION ALL SELECT updated_at FROM support_workspaces WHERE ticket_id=t.id
       UNION ALL SELECT published_at FROM support_reply_publications WHERE ticket_id=t.id) h),t.created_at)) FROM support_tickets t WHERE t.id=?
      """,Timestamp.class,ticket);}
    public record Replay(String kind,UUID id) { }
}

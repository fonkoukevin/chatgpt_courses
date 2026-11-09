package com.chatgptcourses.account.service;

import com.chatgptcourses.commerce.service.CommerceAuthorization;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** Shared transaction utilities; identity itself remains owned by IdentityService. */
@Component
public class AccountOperations {
    public final JdbcTemplate jdbc;
    public final ObjectMapper mapper;
    public final CommerceAuthorization authorization;
    public AccountOperations(JdbcTemplate jdbc,ObjectMapper mapper,CommerceAuthorization authorization){this.jdbc=jdbc;this.mapper=mapper;this.authorization=authorization;}
    public void lock(UUID owner){if(jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(r,n)->r.getObject(1,UUID.class),owner).isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);}
    public UUID replay(UUID actor,String scope,UUID key,byte[] hash){var rows=jdbc.query("SELECT request_fingerprint,coalesce(ticket_id,message_id,data_request_id,attestation_id) FROM account_action_keys WHERE actor_id=? AND scope=? AND idempotency_key=?",(r,n)->{if(!MessageDigest.isEqual(hash,r.getBytes(1)))throw error(ApiError.CONFLICT);return r.getObject(2,UUID.class);},actor,scope,key);return rows.isEmpty()?null:rows.getFirst();}
    public void remember(UUID actor,String scope,UUID key,byte[] hash,String kind,UUID result){check(Set.of("ticket_id","message_id","data_request_id","attestation_id").contains(kind));jdbc.update("INSERT INTO account_action_keys(actor_id,scope,idempotency_key,request_fingerprint,"+kind+") VALUES(?,?,?,?,?)",actor,scope,key,hash,result);}
    public String json(Object value){return mapper.writeValueAsString(value);}
    public byte[] hash(Object value){return digest(json(value).getBytes(StandardCharsets.UTF_8));}
    public static byte[] digest(byte[] bytes){try{return MessageDigest.getInstance("SHA-256").digest(bytes);}catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException("SHA-256 unavailable");}}
    public static String hex(byte[] bytes){return HexFormat.of().formatHex(bytes);}
    public void bound(Object value,int max){check(json(value).getBytes(StandardCharsets.UTF_8).length<=max);}
    public static UUID key(String value){if(value==null||value.isBlank())throw error(ApiError.IDEMPOTENCY_KEY_REQUIRED);return uuidHeader(value);}
    public static UUID context(String value){return value==null?null:uuidHeader(value);}
    private static UUID uuidHeader(String value){if(!value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"))throw error(ApiError.VALIDATION_FAILED);return UUID.fromString(value);}
    public static void text(String value,int max){check(value!=null&&!value.isBlank()&&value.length()<=max&&value.indexOf('\0')<0);}
    public static void locale(String value){check("fr".equals(value)||"en".equals(value));}
    public static void page(int page,int size){check(page>=0&&page<=1_000_000&&size>=1&&size<=100);}
    public static void check(boolean good){if(!good)throw error(ApiError.VALIDATION_FAILED);}
    public static ApiException error(ApiError error){return new ApiException(error);}
    public static Instant instant(ResultSet r,String column)throws SQLException{var t=r.getTimestamp(column);return t==null?null:t.toInstant();}
}

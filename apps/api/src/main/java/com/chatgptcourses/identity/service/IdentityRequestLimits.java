package com.chatgptcourses.identity.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Short-lived cadence limits for an existing CSRF session, never an account or shared proxy IP lock. */
@Service
public class IdentityRequestLimits {
    public enum Action {
        LOGIN(20,300),REGISTER(5,900);
        final int limit,seconds;
        Action(int limit,int seconds){this.limit=limit;this.seconds=seconds;}
    }
    public record Decision(boolean allowed,int retryAfterSeconds) { }
    private final JdbcTemplate jdbc;
    public IdentityRequestLimits(JdbcTemplate jdbc){this.jdbc=jdbc;}

    /** A rejected password/registration must not roll back its already counted attempt. */
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public Decision attempt(String sessionId,Action action){
        if(sessionId==null||sessionId.isBlank()||action==null)throw new IllegalArgumentException("A CSRF session is required");
        String key=digest("identity-cadence:"+action.name()+":"+sessionId);
        return jdbc.queryForObject("""
            INSERT INTO identity_rate_limits(bucket_key,window_started_at,request_count) VALUES(?,clock_timestamp(),1)
            ON CONFLICT(bucket_key) DO UPDATE SET
              request_count=CASE WHEN identity_rate_limits.window_started_at<=EXCLUDED.window_started_at-(?*interval '1 second') THEN 1 ELSE least(identity_rate_limits.request_count+1,1000000) END,
              window_started_at=CASE WHEN identity_rate_limits.window_started_at<=EXCLUDED.window_started_at-(?*interval '1 second') THEN EXCLUDED.window_started_at ELSE identity_rate_limits.window_started_at END
            RETURNING request_count,greatest(1,least(?,ceil(extract(epoch FROM(window_started_at+(?*interval '1 second')-clock_timestamp())))))::integer AS retry_after
            """,(r,n)->new Decision(r.getInt("request_count")<=action.limit,r.getInt("retry_after")),key,action.seconds,action.seconds,action.seconds,action.seconds);
    }
    private static String digest(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException unavailable){throw new IllegalStateException("SHA-256 unavailable");}}
}

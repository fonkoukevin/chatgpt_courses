package com.chatgptcourses.commerce.service;

import com.chatgptcourses.access.AccessPolicy;
import com.chatgptcourses.access.AccessResource;
import com.chatgptcourses.access.AccessSubject;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

/** Account/permissions are read from the database, never from a client declaration. */
@Component
public class CommerceAuthorization {
    private final JdbcTemplate jdbc;
    private final AccessPolicy policy;
    public CommerceAuthorization(JdbcTemplate jdbc,AccessPolicy policy){this.jdbc=jdbc;this.policy=policy;}
    public void require(UUID actor,String permission){
        if(actor==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);
        var active=jdbc.query("SELECT status FROM user_accounts WHERE id=?",(rs,n)->rs.getString(1),actor);
        if(active.isEmpty()||!"ACTIVE".equals(active.getFirst()))throw new ApiException(ApiError.ACCOUNT_UNAVAILABLE);
        var codes=jdbc.query("SELECT DISTINCT p.code FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=? AND ur.revoked_at IS NULL",(rs,n)->rs.getString(1),actor);
        var action=permission.endsWith(".read")?AccessPolicy.Action.READ:AccessPolicy.Action.UPDATE;
        if(!policy.decide(new AccessSubject(actor,true,true,new HashSet<>(codes)),new AccessResource.AdministrativeResource(actor,Map.of(action,permission)),action).allowed())throw new AccessDeniedException("Commerce action unavailable");
    }
    public void mutation(UUID actor,UUID accountContext,String permission){
        require(actor,permission);
        if(accountContext==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);
        if(!actor.equals(accountContext))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);
    }
}

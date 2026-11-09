package com.chatgptcourses.shared.security;

import com.chatgptcourses.account.service.AccountOperations;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.ApiProblems;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** Runs after CSRF/authoritative refresh and before LogoutFilter can invalidate another account. */
final class LogoutAccountContextFilter extends OncePerRequestFilter {
    private final ObjectMapper mapper;
    LogoutAccountContextFilter(ObjectMapper mapper){this.mapper=mapper;}
    @Override protected boolean shouldNotFilter(HttpServletRequest request){return !"POST".equals(request.getMethod())||!"/api/v1/auth/logout".equals(request.getServletPath());}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
        var auth=SecurityContextHolder.getContext().getAuthentication();
        if(auth!=null&&auth.getPrincipal() instanceof IdentityUserDetails principal){
            try{var context=AccountOperations.context(request.getHeader("X-Account-Context"));if(context==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);if(!principal.getUserId().equals(context))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);}
            catch(ApiException invalid){var error=invalid.error();ApiProblems.write(mapper,request,response,error.status(),error.name(),error.detail());return;}
        }
        chain.doFilter(request,response);
    }
}

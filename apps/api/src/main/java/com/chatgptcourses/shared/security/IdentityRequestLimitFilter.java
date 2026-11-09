package com.chatgptcourses.shared.security;

import com.chatgptcourses.identity.service.IdentityRequestLimits;
import com.chatgptcourses.shared.http.ApiProblems;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** Installed after CSRF, so rejected cross-site requests never consume an anonymous session's quota. */
final class IdentityRequestLimitFilter extends OncePerRequestFilter {
    private final IdentityRequestLimits limits;private final ObjectMapper mapper;
    IdentityRequestLimitFilter(IdentityRequestLimits limits,ObjectMapper mapper){this.limits=limits;this.mapper=mapper;}
    @Override protected boolean shouldNotFilter(HttpServletRequest request){return !"POST".equals(request.getMethod())||!("/api/v1/auth/login".equals(request.getServletPath())||"/api/v1/auth/register".equals(request.getServletPath()));}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
        var session=request.getSession(false);
        if(session==null){ApiProblems.write(mapper,request,response,HttpStatus.FORBIDDEN,"CSRF_INVALID","La protection de cette requête est invalide.");return;}
        try{
            var action="/api/v1/auth/login".equals(request.getServletPath())?IdentityRequestLimits.Action.LOGIN:IdentityRequestLimits.Action.REGISTER;
            var decision=limits.attempt(session.getId(),action);
            if(!decision.allowed()){response.setHeader("Retry-After",Integer.toString(decision.retryAfterSeconds()));ApiProblems.write(mapper,request,response,HttpStatus.TOO_MANY_REQUESTS,"RATE_LIMITED","Trop de demandes. Réessayez plus tard.");return;}
        }catch(DataAccessException|org.springframework.transaction.TransactionException unavailable){ApiProblems.write(mapper,request,response,HttpStatus.SERVICE_UNAVAILABLE,"SERVICE_UNAVAILABLE","Le service de connexion est temporairement indisponible.");return;}
        chain.doFilter(request,response);
    }
}

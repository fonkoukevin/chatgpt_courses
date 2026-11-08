package com.chatgptcourses.identity.security;

import com.chatgptcourses.identity.service.IdentityService;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AuthUserDetailsService implements UserDetailsService {
    private final IdentityService identity;
    public AuthUserDetailsService(IdentityService identity) { this.identity = identity; }
    @Override public UserDetails loadUserByUsername(String email) {
        return IdentityUserDetails.fromCredentials(identity.findForAuthentication(email)
                .orElseThrow(() -> new UsernameNotFoundException("Account unavailable")));
    }
}

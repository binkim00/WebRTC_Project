package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.auth.exception.InvalidAccessTokenException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/** Bearer Access Token을 검증하고 사용자 역할을 SecurityContext에 등록하는 필터다. */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;
    private final RevokedAccessTokenStore revokedAccessTokenStore;
    private final JwtAuthenticationEntryPoint authenticationEntryPoint;

    /**
     * 토큰 검증기, 폐기 토큰 저장소와 인증 실패 응답 처리기를 주입받는다.
     *
     * @param jwtTokenProvider Access Token 검증기
     * @param revokedAccessTokenStore 로그아웃된 Access Token 저장소
     * @param authenticationEntryPoint 인증 실패 응답 처리기
     */
    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider,
                                   RevokedAccessTokenStore revokedAccessTokenStore,
                                   JwtAuthenticationEntryPoint authenticationEntryPoint) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.revokedAccessTokenStore = revokedAccessTokenStore;
        this.authenticationEntryPoint = authenticationEntryPoint;
    }

    /** Bearer Token이 있으면 검증·인증하고, 없으면 기존 필터 체인을 그대로 진행한다. */
    @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authorization = request.getHeader(AUTHORIZATION_HEADER);
        if (!StringUtils.hasText(authorization) || !authorization.startsWith(BEARER_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authorization.substring(BEARER_PREFIX.length()).trim();
        try {
            if (!StringUtils.hasText(token) || revokedAccessTokenStore.isRevoked(token)) {
                throw new InvalidAccessTokenException();
            }
            AuthenticatedUser principal = jwtTokenProvider.parseAccessToken(token);
            SimpleGrantedAuthority authority = new SimpleGrantedAuthority("ROLE_" + principal.role().name());
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(principal, null, List.of(authority));

            // 현재 요청에서만 사용할 빈 컨텍스트에 인증 정보를 등록한다.
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
            filterChain.doFilter(request, response);
        } catch (InvalidAccessTokenException exception) {
            SecurityContextHolder.clearContext();
            authenticationEntryPoint.commence(
                    request,
                    response,
                    new BadCredentialsException("Invalid access token")
            );
        } finally {
            // 스레드가 재사용될 때 이전 요청의 인증 정보가 다음 요청으로 전파되지 않도록 정리한다.
            SecurityContextHolder.clearContext();
        }
    }
}

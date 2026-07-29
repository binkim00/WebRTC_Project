package com.ssafy.backend.config;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SecurityConfigTest {

    /** 허용 출처 설정이 비어 있으면 임의의 교차 출처 요청을 허용하지 않는지 확인한다. */
    @Test
    void keepsCrossOriginAccessClosedWhenNoOriginIsConfigured() {
        CorsConfiguration configuration = securityConfig("")
                .corsConfigurationSource()
                .getCorsConfiguration(new MockHttpServletRequest());

        assertThat(configuration).isNotNull();
        assertThat(configuration.getAllowedOrigins()).isNullOrEmpty();
        assertThat(configuration.getAllowedMethods()).contains("OPTIONS");
    }

    /** 설정에 명시된 출처만 CORS 허용 목록에 포함되는지 확인한다. */
    @Test
    void allowsOnlyExplicitlyConfiguredOrigins() {
        CorsConfiguration configuration = securityConfig(
                "http://localhost:5173, https://rtc.example.com"
        ).corsConfigurationSource().getCorsConfiguration(new MockHttpServletRequest());

        assertThat(configuration).isNotNull();
        assertThat(configuration.getAllowedOrigins())
                .containsExactly("http://localhost:5173", "https://rtc.example.com")
                .doesNotContain("*");
    }

    /**
     * 지정한 허용 출처와 mock JWT 구성 요소로 테스트용 보안 설정을 생성한다.
     *
     * @param allowedOrigins 쉼표로 구분한 허용 출처 설정
     * @return 테스트에 사용할 보안 설정
     */
    private SecurityConfig securityConfig(String allowedOrigins) {
        return new SecurityConfig(
                allowedOrigins,
                mock(JwtAuthenticationFilter.class),
                mock(JwtAuthenticationEntryPoint.class),
                mock(RestAccessDeniedHandler.class)
        );
    }
}

package com.ssafy.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityConfigTest {

    /** 허용 출처 설정이 비어 있으면 임의의 교차 출처 요청을 허용하지 않는지 확인한다. */
    @Test
    void keepsCrossOriginAccessClosedWhenNoOriginIsConfigured() {
        CorsConfiguration configuration = new SecurityConfig("")
                .corsConfigurationSource()
                .getCorsConfiguration(new MockHttpServletRequest());

        assertThat(configuration).isNotNull();
        assertThat(configuration.getAllowedOrigins()).isNullOrEmpty();
        assertThat(configuration.getAllowedMethods()).contains("OPTIONS");
    }

    /** 설정에 명시된 출처만 CORS 허용 목록에 포함되는지 확인한다. */
    @Test
    void allowsOnlyExplicitlyConfiguredOrigins() {
        CorsConfiguration configuration = new SecurityConfig(
                "http://localhost:5173, https://rtc.example.com"
        ).corsConfigurationSource().getCorsConfiguration(new MockHttpServletRequest());

        assertThat(configuration).isNotNull();
        assertThat(configuration.getAllowedOrigins())
                .containsExactly("http://localhost:5173", "https://rtc.example.com")
                .doesNotContain("*");
    }
}

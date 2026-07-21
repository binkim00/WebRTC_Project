package com.ssafy.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityConfigTest {

    @Test
    void keepsCrossOriginAccessClosedWhenNoOriginIsConfigured() {
        CorsConfiguration configuration = new SecurityConfig("")
                .corsConfigurationSource()
                .getCorsConfiguration(new MockHttpServletRequest());

        assertThat(configuration).isNotNull();
        assertThat(configuration.getAllowedOrigins()).isNullOrEmpty();
        assertThat(configuration.getAllowedMethods()).contains("OPTIONS");
    }

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

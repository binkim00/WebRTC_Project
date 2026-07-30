package com.ssafy.backend.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Swagger UI에서 JWT Access Token을 사용할 수 있도록 OpenAPI 문서를 구성한다. */
@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "bearerAuth";

    /**
     * API 기본 정보와 Bearer 토큰 인증 스키마를 등록한다.
     *
     * @return Swagger UI가 사용할 OpenAPI 문서 정의
     */
    @Bean
    public OpenAPI openAPI() {
        // 대부분의 API가 인증을 요구하므로 Bearer 스키마를 전역 기본값으로 적용한다.
        SecurityScheme bearerScheme = new SecurityScheme()
                .name(BEARER_SCHEME)
                .type(SecurityScheme.Type.HTTP)
                .scheme("bearer")
                .bearerFormat("JWT");

        return new OpenAPI()
                .info(new Info()
                        .title("Melly API")
                        .version("v1")
                        .description("팬미팅 운영·대기열·영상통화 API"))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME))
                .components(new Components().addSecuritySchemes(BEARER_SCHEME, bearerScheme));
    }
}

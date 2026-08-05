package com.ssafy.backend.config.oauth;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/** 소셜 공급자 통신에 사용할 HTTP 클라이언트와 설정 바인딩을 구성한다. */
@Configuration
@EnableConfigurationProperties(OAuthProperties.class)
public class OAuthConfig {

    /** 공급자 서버 연결을 기다릴 최대 시간이다. */
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);

    /** 공급자 응답을 기다릴 최대 시간이다. */
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    /**
     * 소셜 공급자 호출 전용 RestClient를 생성한다.
     *
     * <p>타임아웃을 반드시 지정한다. 로그인 요청 스레드가 공급자 응답을 무한정 기다리면
     * 공급자 장애가 그대로 우리 서비스의 스레드 고갈로 번진다.
     *
     * @return 연결·읽기 타임아웃이 설정된 RestClient
     */
    @Bean
    public RestClient socialRestClient() {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .requestFactory(requestFactory)
                .build();
    }
}

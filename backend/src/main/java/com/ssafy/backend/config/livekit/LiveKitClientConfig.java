package com.ssafy.backend.config.livekit;

import io.livekit.server.RoomServiceClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** LiveKit 서버 관리 API 클라이언트를 애플리케이션 빈으로 구성한다. */
@Configuration
public class LiveKitClientConfig {

    /**
     * WebSocket 접속 URL을 HTTP 관리 API URL로 변환해 Room 클라이언트를 생성한다.
     *
     * @param properties LiveKit 서버 접속 및 인증 설정
     * @return 참가자 조회와 제거에 사용하는 Room API 클라이언트
     */
    @Bean
    public RoomServiceClient roomServiceClient(LiveKitProperties properties) {
        return RoomServiceClient.createClient(
                toHttpUrl(properties.getUrl()),
                properties.getApiKey(),
                properties.getApiSecret()
        );
    }

    /**
     * LiveKit WebSocket 스킴을 관리 API에서 사용하는 HTTP 스킴으로 변환한다.
     *
     * @param liveKitUrl 설정된 LiveKit 접속 URL
     * @return HTTP 또는 HTTPS 관리 API URL
     */
    private String toHttpUrl(String liveKitUrl) {
        if (liveKitUrl.startsWith("wss://")) {
            return "https://" + liveKitUrl.substring("wss://".length());
        }
        if (liveKitUrl.startsWith("ws://")) {
            return "http://" + liveKitUrl.substring("ws://".length());
        }
        return liveKitUrl;
    }
}

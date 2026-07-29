package com.ssafy.backend.livekit.service;

import com.ssafy.backend.config.livekit.LiveKitProperties;
import com.ssafy.backend.livekit.dto.LiveKitTokenResponse;
import io.livekit.server.AccessToken;
import io.livekit.server.CanPublish;
import io.livekit.server.CanSubscribe;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.Map;

@Service
public class LiveKitTokenService {

    static final String TEST_ROOM_NAME = "test-room";
    private static final long TEST_TOKEN_TTL_MILLIS = Duration.ofMinutes(10).toMillis();

    private final LiveKitProperties properties;

    /** 토큰 발급에 필요한 LiveKit 연결 및 인증 설정을 주입받는다. */
    public LiveKitTokenService(LiveKitProperties properties) {
        this.properties = properties;
    }

    /**
     * 지정한 사용자가 공용 테스트 방에 참여할 수 있는 10분짜리 토큰을 생성한다.
     *
     * @param identity LiveKit 참가자 식별자
     * @param displayName LiveKit에 표시할 참가자 이름
     * @param attributes AI Agent가 읽을 참가자별 속성
     * @return 공용 테스트 방의 연결 URL과 입장 토큰
     */
    public LiveKitTokenResponse createTestToken(
            String identity,
            String displayName,
            Map<String, String> attributes
    ) {
        if (!StringUtils.hasText(identity)) {
            throw new IllegalArgumentException("identity는 필수입니다.");
        }

        String normalizedIdentity = identity.trim();
        // 서버 API 키와 비밀값으로 서명할 토큰을 만들고 사용자와 유효 시간을 지정한다.
        AccessToken token = new AccessToken(properties.getApiKey(), properties.getApiSecret());
        token.setIdentity(normalizedIdentity);
        token.setTtl(TEST_TOKEN_TTL_MILLIS);

        if (StringUtils.hasText(displayName)) {
            token.setName(displayName.trim());
        }

        // 테스트 방 입장과 미디어 발행·구독 권한만 토큰 클레임에 포함한다.
        token.addGrants(
                new RoomJoin(true),
                new RoomName(TEST_ROOM_NAME),
                new CanPublish(true),
                new CanSubscribe(true)
        );

        if (attributes != null && !attributes.isEmpty()) {
            token.getAttributes().putAll(attributes);
        }

        // toJwt() 호출 시 위의 사용자 정보와 권한을 실제 서명된 JWT 문자열로 변환한다.
        return new LiveKitTokenResponse(
                properties.getUrl(),
                token.toJwt(),
                TEST_ROOM_NAME,
                normalizedIdentity
        );
    }
}

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

@Service
public class LiveKitTokenService {

    static final String TEST_ROOM_NAME = "test-room";
    private static final long TEST_TOKEN_TTL_MILLIS = Duration.ofMinutes(10).toMillis();

    private final LiveKitProperties properties;

    public LiveKitTokenService(LiveKitProperties properties) {
        this.properties = properties;
    }

    public LiveKitTokenResponse createTestToken(String identity, String displayName) {
        if (!StringUtils.hasText(identity)) {
            throw new IllegalArgumentException("identity는 필수입니다.");
        }

        String normalizedIdentity = identity.trim();
        AccessToken token = new AccessToken(properties.getApiKey(), properties.getApiSecret());
        token.setIdentity(normalizedIdentity);
        token.setTtl(TEST_TOKEN_TTL_MILLIS);

        if (StringUtils.hasText(displayName)) {
            token.setName(displayName.trim());
        }

        token.addGrants(
                new RoomJoin(true),
                new RoomName(TEST_ROOM_NAME),
                new CanPublish(true),
                new CanSubscribe(true)
        );

        return new LiveKitTokenResponse(
                properties.getUrl(),
                token.toJwt(),
                TEST_ROOM_NAME,
                normalizedIdentity
        );
    }
}

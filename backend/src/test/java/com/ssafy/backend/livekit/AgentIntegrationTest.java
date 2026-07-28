package com.ssafy.backend.livekit;

import io.livekit.server.*;

public class AgentIntegrationTest {

    private static final String API_KEY = "devkey";
    private static final String API_SECRET = "melly-local-dev-secret-1234567890abcdef";
    private static final String ROOM_NAME = "test-room";

    public static void main(String[] args) {
        String hostToken = createToken("host-1", "host",
                "{\"role\":\"INFLUENCER\"}");
        System.out.println("=== HOST TOKEN ===");
        System.out.println(hostToken);

        String fanToken = createToken("fan-1", "fan",
                "{\"role\":\"FAN\",\"call_session_id\":\"1\",\"fan_lang\":\"en\"}");
        System.out.println("\n=== FAN TOKEN ===");
        System.out.println(fanToken);

        System.out.println("\n=== 사용법 ===");
        System.out.println("1. python agent.py dev 실행");
        System.out.println("2. 브라우저 콘솔(F12)에서:");
        System.out.println("   const room = new LivekitClient.Room();");
        System.out.println("   await room.connect('ws://localhost:7880', '위 토큰');");
    }

    private static String createToken(String identity, String name, String metadata) {
        AccessToken token = new AccessToken(API_KEY, API_SECRET);
        token.setIdentity(identity);
        token.setName(name);
        token.setTtl(600_000);
        token.setMetadata(metadata);

        token.addGrants(
                new RoomJoin(true),
                new RoomName(ROOM_NAME),
                new CanPublish(true),
                new CanSubscribe(true)
        );

        return token.toJwt();
    }
}
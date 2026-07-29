package com.ssafy.backend.livekit;

import io.livekit.server.*;

import java.util.Map;

public class AgentIntegrationTest {

    private static final String API_KEY = "devkey";
    private static final String API_SECRET = "melly-local-dev-secret-1234567890abcdef";
    private static final String ROOM_NAME = "test-room";

    /**
     * 인플루언서와 팬의 attributes가 포함된 로컬 테스트 토큰을 출력한다.
     *
     * @param args 사용하지 않는 실행 인자
     */
    public static void main(String[] args) {
        String hostToken = createToken("host-1", "host",
                Map.of(
                        "user_id", "12",
                        "role", "INFLUENCER",
                        "influencer_lang", "ko"
                ));
        System.out.println("=== HOST TOKEN ===");
        System.out.println(hostToken);

        String fanToken = createToken("fan-1", "fan",
                Map.of(
                        "user_id", "11",
                        "role", "FAN",
                        "call_session_id", "1",
                        "fan_lang", "en"
                ));
        System.out.println("\n=== FAN TOKEN ===");
        System.out.println(fanToken);

        System.out.println("\n=== 사용법 ===");
        System.out.println("1. python agent.py dev 실행");
        System.out.println("2. 브라우저 콘솔(F12)에서:");
        System.out.println("   const room = new LivekitClient.Room();");
        System.out.println("   await room.connect('ws://localhost:7880', '위 토큰');");
    }

    /**
     * 지정한 참가자 attributes가 포함된 테스트 방 입장 토큰을 생성한다.
     *
     * @param identity LiveKit 참가자 식별자
     * @param name LiveKit에 표시할 참가자 이름
     * @param attributes AI Agent가 읽을 참가자별 속성
     * @return 서명된 LiveKit 입장 JWT
     */
    private static String createToken(
            String identity,
            String name,
            Map<String, String> attributes
    ) {
        AccessToken token = new AccessToken(API_KEY, API_SECRET);
        token.setIdentity(identity);
        token.setName(name);
        token.setTtl(600_000);
        token.getAttributes().putAll(attributes);

        token.addGrants(
                new RoomJoin(true),
                new RoomName(ROOM_NAME),
                new CanPublish(true),
                new CanSubscribe(true)
        );

        return token.toJwt();
    }
}

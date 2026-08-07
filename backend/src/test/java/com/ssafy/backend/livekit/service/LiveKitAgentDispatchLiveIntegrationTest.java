package com.ssafy.backend.livekit.service;

import io.livekit.server.AgentDispatchServiceClient;
import io.livekit.server.RoomServiceClient;
import livekit.LivekitAgentDispatch.AgentDispatch;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import retrofit2.Response;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 실제 LiveKit 서버에 자막 Agent Dispatch를 만들고 목록 조회로 중복 여부를 확인한다.
 *
 * <p>로컬 LiveKit 없이도 전체 빌드가 통과하도록 접속 정보 환경 변수가 모두 있을 때만 실행한다.
 * {@code MELLY_LIVEKIT_IT_URL}에는 관리 API용 HTTP URL을, {@code MELLY_LIVEKIT_IT_API_KEY}와
 * {@code MELLY_LIVEKIT_IT_API_SECRET}에는 해당 LiveKit 서버의 자격증명을 넣는다.
 */
@EnabledIfEnvironmentVariable(named = "MELLY_LIVEKIT_IT_URL", matches = ".+")
@EnabledIfEnvironmentVariable(named = "MELLY_LIVEKIT_IT_API_KEY", matches = ".+")
@EnabledIfEnvironmentVariable(named = "MELLY_LIVEKIT_IT_API_SECRET", matches = ".+")
class LiveKitAgentDispatchLiveIntegrationTest {

    private static final Long CALL_SESSION_ID = 4242L;
    private static final String HOST_LANGUAGE = "ko";

    private AgentDispatchServiceClient dispatchClient;
    private RoomServiceClient roomClient;
    private LiveKitAgentDispatchStore dispatchStore;
    private LiveKitAgentDispatchService service;
    private String roomName;

    /** 환경 변수의 접속 정보로 실제 LiveKit 클라이언트와 검사 대상 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        String url = System.getenv("MELLY_LIVEKIT_IT_URL");
        String apiKey = System.getenv("MELLY_LIVEKIT_IT_API_KEY");
        String apiSecret = System.getenv("MELLY_LIVEKIT_IT_API_SECRET");
        dispatchClient = AgentDispatchServiceClient.createClient(url, apiKey, apiSecret);
        roomClient = RoomServiceClient.createClient(url, apiKey, apiSecret);
        // Redis 선점은 항상 성공한 것으로 두고 LiveKit 외부 상태만으로 중복이 막히는지 확인한다.
        dispatchStore = mock(LiveKitAgentDispatchStore.class);
        when(dispatchStore.claim(anyString())).thenReturn(true);
        service = new LiveKitAgentDispatchService(
                dispatchClient, roomClient, dispatchStore, new ObjectMapper());
        roomName = "meeting-room-it-" + System.currentTimeMillis();
    }

    /** 테스트가 만든 Room과 Dispatch만 삭제해 다른 세션 Room에 영향을 주지 않는다. */
    @AfterEach
    void tearDown() throws IOException {
        Response<List<AgentDispatch>> response = dispatchClient.listDispatch(roomName).execute();
        List<AgentDispatch> dispatches = response.isSuccessful() && response.body() != null
                ? response.body()
                : List.of();
        for (AgentDispatch dispatch : dispatches) {
            dispatchClient.deleteDispatch(roomName, dispatch.getId()).execute();
        }
        roomClient.deleteRoom(roomName).execute();
    }

    /** 실제 LiveKit 서버에 metadata를 담은 자막 Agent Dispatch가 1건 생성되는지 검증한다. */
    @Test
    void createsSingleSubtitleAgentDispatchOnLiveServer() throws IOException {
        service.ensureDispatched(roomName, CALL_SESSION_ID, HOST_LANGUAGE);

        List<AgentDispatch> dispatches = listSubtitleAgentDispatches();
        assertThat(dispatches).hasSize(1);
        assertThat(dispatches.get(0).getRoom()).isEqualTo(roomName);
        assertThat(dispatches.get(0).getMetadata())
                .isEqualTo("{\"callSessionId\":4242,\"host_lang\":\"ko\"}");
    }

    /**
     * 선점이 항상 성공하는 상황에서 같은 Room을 다시 호출해도 실제 서버의 자막 Agent Dispatch가
     * 1건으로 유지되는지 검증한다.
     */
    @Test
    void doesNotDuplicateDispatchOnRetryAgainstLiveServer() throws IOException {
        service.ensureDispatched(roomName, CALL_SESSION_ID, HOST_LANGUAGE);
        service.ensureDispatched(roomName, CALL_SESSION_ID, HOST_LANGUAGE);
        service.ensureDispatched(roomName, 9999L, "en");

        List<AgentDispatch> dispatches = listSubtitleAgentDispatches();
        assertThat(dispatches).hasSize(1);
        assertThat(dispatches.get(0).getMetadata())
                .isEqualTo("{\"callSessionId\":4242,\"host_lang\":\"ko\"}");
    }

    /**
     * 테스트 Room에 등록된 자막 Agent Dispatch만 조회한다.
     *
     * <p>LiveKit은 Room 생성 시 이름이 빈 자동 배치 항목도 함께 남기므로 이름으로 걸러낸다.
     *
     * @return 해당 Room의 자막 Agent Dispatch 목록
     * @throws IOException LiveKit 목록 조회 통신에 실패한 경우
     */
    private List<AgentDispatch> listSubtitleAgentDispatches() throws IOException {
        Response<List<AgentDispatch>> response = dispatchClient.listDispatch(roomName).execute();
        assertThat(response.isSuccessful()).isTrue();
        List<AgentDispatch> body = response.body();
        return body == null ? List.of() : body.stream()
                .filter(dispatch -> LiveKitAgentDispatchService.AGENT_NAME
                        .equals(dispatch.getAgentName()))
                .toList();
    }
}

package com.ssafy.backend.livekit.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import io.livekit.server.AgentDispatchServiceClient;
import livekit.LivekitAgentDispatch.AgentDispatch;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import retrofit2.Call;
import retrofit2.Response;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LiveKitAgentDispatchServiceTest {

    private static final String ROOM_NAME = "meeting-room-7";

    private AgentDispatchServiceClient dispatchClient;
    private LiveKitAgentDispatchStore dispatchStore;
    private LiveKitAgentDispatchService service;

    /** LiveKit Dispatch 클라이언트와 Redis 저장소를 mock으로 구성한다. */
    @BeforeEach
    void setUp() {
        dispatchClient = mock(AgentDispatchServiceClient.class);
        dispatchStore = mock(LiveKitAgentDispatchStore.class);
        service = new LiveKitAgentDispatchService(dispatchClient, dispatchStore);
    }

    /** Room 최초 요청이면 기존 배치를 조회한 뒤 자막 Agent를 생성하는지 검증한다. */
    @Test
    void createsSubtitleAgentForFirstRoomRequest() throws IOException {
        Call<List<AgentDispatch>> listCall = mock(Call.class);
        Call<AgentDispatch> createCall = mock(Call.class);
        AgentDispatch created = dispatch();
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);
        when(dispatchClient.listDispatch(ROOM_NAME)).thenReturn(listCall);
        when(listCall.execute()).thenReturn(Response.success(List.of()));
        when(dispatchClient.createDispatch(
                ROOM_NAME, LiveKitAgentDispatchService.AGENT_NAME)).thenReturn(createCall);
        when(createCall.execute()).thenReturn(Response.success(created));

        service.ensureDispatched(ROOM_NAME);

        verify(dispatchClient).createDispatch(
                ROOM_NAME, LiveKitAgentDispatchService.AGENT_NAME);
        verify(dispatchStore).release(ROOM_NAME);
    }

    /** 다른 요청이 선점한 Room에도 실제 Agent가 있으면 중복 생성하지 않는지 검증한다. */
    @Test
    void acceptsExistingAgentWhileAnotherRequestOwnsClaim() throws IOException {
        Call<List<AgentDispatch>> listCall = mock(Call.class);
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(false);
        when(dispatchClient.listDispatch(ROOM_NAME)).thenReturn(listCall);
        when(listCall.execute()).thenReturn(Response.success(List.of(dispatch())));

        service.ensureDispatched(ROOM_NAME);

        verify(dispatchClient, never()).createDispatch(
                ROOM_NAME, LiveKitAgentDispatchService.AGENT_NAME);
        verify(dispatchStore, never()).release(ROOM_NAME);
    }

    /** 다른 요청이 배치 중인데 실제 Agent가 아직 없으면 토큰 발급 흐름을 차단하는지 검증한다. */
    @Test
    void rejectsRequestWhenClaimIsOwnedButAgentIsMissing() throws IOException {
        Call<List<AgentDispatch>> listCall = mock(Call.class);
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(false);
        when(dispatchClient.listDispatch(ROOM_NAME)).thenReturn(listCall);
        when(listCall.execute()).thenReturn(Response.success(List.of()));

        assertThatThrownBy(() -> service.ensureDispatched(ROOM_NAME))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_OPERATION_FAILED));
        verify(dispatchStore, never()).release(ROOM_NAME);
    }

    /** LiveKit 통신 실패 시 Redis 선점을 해제하고 표준 오류를 반환하는지 검증한다. */
    @Test
    void releasesClaimWhenLiveKitRequestFails() throws IOException {
        Call<List<AgentDispatch>> listCall = mock(Call.class);
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);
        when(dispatchClient.listDispatch(ROOM_NAME)).thenReturn(listCall);
        when(listCall.execute()).thenThrow(new IOException("connection failed"));

        assertThatThrownBy(() -> service.ensureDispatched(ROOM_NAME))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_OPERATION_FAILED));
        verify(dispatchStore).release(ROOM_NAME);
    }

    /** 테스트에 사용할 자막 Agent Dispatch 응답을 생성한다. */
    private AgentDispatch dispatch() {
        return AgentDispatch.newBuilder()
                .setRoom(ROOM_NAME)
                .setAgentName(LiveKitAgentDispatchService.AGENT_NAME)
                .build();
    }
}

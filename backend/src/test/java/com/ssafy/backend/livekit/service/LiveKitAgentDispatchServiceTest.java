package com.ssafy.backend.livekit.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import io.livekit.server.AgentDispatchServiceClient;
import io.livekit.server.RoomServiceClient;
import livekit.LivekitAgentDispatch.AgentDispatch;
import livekit.LivekitModels.Room;
import okhttp3.MediaType;
import okhttp3.ResponseBody;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import retrofit2.Call;
import retrofit2.Response;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LiveKitAgentDispatchServiceTest {

    private static final String ROOM_NAME = "meeting-room-7";
    private static final Long CALL_SESSION_ID = 100L;
    private static final String HOST_LANGUAGE = "ko";

    private AgentDispatchServiceClient dispatchClient;
    private RoomServiceClient roomClient;
    private LiveKitAgentDispatchStore dispatchStore;
    private LiveKitAgentDispatchService service;

    /** LiveKit Dispatch·Room 클라이언트와 Redis 저장소를 mock으로 구성한다. */
    @BeforeEach
    void setUp() {
        dispatchClient = mock(AgentDispatchServiceClient.class);
        roomClient = mock(RoomServiceClient.class);
        dispatchStore = mock(LiveKitAgentDispatchStore.class);
        service = new LiveKitAgentDispatchService(
                dispatchClient, roomClient, dispatchStore, new ObjectMapper());
    }

    /** Room 최초 호출이면 통화 식별값과 주최자 언어를 metadata에 담아 자막 Agent를 생성하는지 검증한다. */
    @Test
    void createsSubtitleAgentWithCallMetadataForFirstRoomRequest() throws IOException {
        givenRoomExists(true);
        givenExistingDispatches(List.of());
        Call<AgentDispatch> createCall = givenCreateDispatchReturns(Response.success(dispatch()));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE);

        assertThat(createCall).isNotNull();
        assertThat(capturedMetadata()).isEqualTo("{\"callSessionId\":100,\"host_lang\":\"ko\"}");
        verify(dispatchStore).release(ROOM_NAME);
    }

    /** Room이 아직 만들어지지 않았으면 목록 조회를 건너뛰고 곧바로 자막 Agent를 생성하는지 검증한다. */
    @Test
    void createsSubtitleAgentWhenRoomDoesNotExistYet() throws IOException {
        givenRoomExists(false);
        givenCreateDispatchReturns(Response.success(dispatch()));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE);

        verify(dispatchClient, never()).listDispatch(ROOM_NAME);
        verify(dispatchClient).createDispatch(
                eq(ROOM_NAME), eq(LiveKitAgentDispatchService.AGENT_NAME), any());
        verify(dispatchStore).release(ROOM_NAME);
    }

    /** Redis 선점 키가 만료된 뒤 재시도해도 외부 Dispatch를 감지해 중복 생성하지 않는지 검증한다. */
    @Test
    void detectsExternalDispatchAfterClaimKeyExpires() throws IOException {
        givenRoomExists(true);
        givenExistingDispatches(List.of(dispatch()));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE);

        verify(dispatchClient, never()).createDispatch(any(), any(), any());
        verify(dispatchStore).release(ROOM_NAME);
    }

    /** 이름이 빈 자동 배치 항목만 있으면 자막 Agent를 새로 배치하는지 검증한다. */
    @Test
    void createsSubtitleAgentWhenOnlyAnonymousDispatchExists() throws IOException {
        AgentDispatch anonymous = AgentDispatch.newBuilder().setRoom(ROOM_NAME).build();
        givenRoomExists(true);
        givenExistingDispatches(List.of(anonymous));
        givenCreateDispatchReturns(Response.success(dispatch()));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE);

        verify(dispatchClient).createDispatch(
                eq(ROOM_NAME), eq(LiveKitAgentDispatchService.AGENT_NAME), any());
    }

    /** 다른 요청이 선점한 Room에도 실제 Agent가 있으면 중복 생성하지 않는지 검증한다. */
    @Test
    void acceptsExistingAgentWhileAnotherRequestOwnsClaim() throws IOException {
        givenRoomExists(true);
        givenExistingDispatches(List.of(dispatch()));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(false);

        service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE);

        verify(dispatchClient, never()).createDispatch(any(), any(), any());
        verify(dispatchStore, never()).release(ROOM_NAME);
    }

    /** 다른 요청이 배치 중인데 실제 Agent가 아직 없으면 호출 흐름을 차단하는지 검증한다. */
    @Test
    void rejectsRequestWhenClaimIsOwnedButAgentIsMissing() throws IOException {
        givenRoomExists(true);
        givenExistingDispatches(List.of());
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(false);

        assertThatThrownBy(() ->
                service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_OPERATION_FAILED));
        verify(dispatchClient, never()).createDispatch(any(), any(), any());
        verify(dispatchStore, never()).release(ROOM_NAME);
    }

    /** LiveKit 통신 실패 시 Redis 선점을 해제하고 표준 오류를 반환하는지 검증한다. */
    @Test
    void releasesClaimWhenLiveKitRequestFails() throws IOException {
        givenRoomExists(true);
        Call<List<AgentDispatch>> listCall = mock(Call.class);
        when(dispatchClient.listDispatch(ROOM_NAME)).thenReturn(listCall);
        when(listCall.execute()).thenThrow(new IOException("connection failed"));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        assertThatThrownBy(() ->
                service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_OPERATION_FAILED));
        verify(dispatchStore).release(ROOM_NAME);
    }

    /** Room 조회가 오류 응답이면 선점을 해제하고 표준 오류를 반환하는지 검증한다. */
    @Test
    void releasesClaimWhenRoomLookupReturnsError() throws IOException {
        Call<List<Room>> roomsCall = mock(Call.class);
        when(roomClient.listRooms(List.of(ROOM_NAME))).thenReturn(roomsCall);
        when(roomsCall.execute()).thenReturn(Response.error(500, errorBody()));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        assertThatThrownBy(() ->
                service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_OPERATION_FAILED));
        verify(dispatchClient, never()).createDispatch(any(), any(), any());
        verify(dispatchStore).release(ROOM_NAME);
    }

    /** Dispatch 목록 조회가 오류 응답이면 선점을 해제하고 표준 오류를 반환하는지 검증한다. */
    @Test
    void releasesClaimWhenListDispatchReturnsError() throws IOException {
        givenRoomExists(true);
        Call<List<AgentDispatch>> listCall = mock(Call.class);
        when(dispatchClient.listDispatch(ROOM_NAME)).thenReturn(listCall);
        when(listCall.execute()).thenReturn(Response.error(500, errorBody()));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        assertThatThrownBy(() ->
                service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_OPERATION_FAILED));
        verify(dispatchStore).release(ROOM_NAME);
        verify(dispatchClient, never()).createDispatch(any(), any(), any());
    }

    /** Dispatch 생성 응답에 본문이 없으면 선점을 해제하고 표준 오류를 반환하는지 검증한다. */
    @Test
    void releasesClaimWhenCreateDispatchReturnsEmptyBody() throws IOException {
        givenRoomExists(true);
        givenExistingDispatches(List.of());
        givenCreateDispatchReturns(Response.success(null));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        assertThatThrownBy(() ->
                service.ensureDispatched(ROOM_NAME, CALL_SESSION_ID, HOST_LANGUAGE))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_OPERATION_FAILED));
        verify(dispatchStore).release(ROOM_NAME);
    }

    /** 영어를 쓰는 주최 인플루언서의 언어 코드가 metadata에 그대로 담기는지 검증한다. */
    @Test
    void writesEnglishHostLanguageIntoMetadata() throws IOException {
        givenRoomExists(true);
        givenExistingDispatches(List.of());
        givenCreateDispatchReturns(Response.success(dispatch()));
        when(dispatchStore.claim(ROOM_NAME)).thenReturn(true);

        service.ensureDispatched(ROOM_NAME, 205L, "en");

        assertThat(capturedMetadata()).isEqualTo("{\"callSessionId\":205,\"host_lang\":\"en\"}");
    }

    /**
     * Room 존재 여부 조회 응답을 준비한다.
     *
     * @param exists Room이 존재하는 것으로 응답할지 여부
     * @throws IOException mock 실행 선언에서 발생할 수 있는 예외
     */
    private void givenRoomExists(boolean exists) throws IOException {
        Call<List<Room>> roomsCall = mock(Call.class);
        when(roomClient.listRooms(List.of(ROOM_NAME))).thenReturn(roomsCall);
        when(roomsCall.execute()).thenReturn(Response.success(exists
                ? List.of(Room.newBuilder().setName(ROOM_NAME).build())
                : List.of()));
    }

    /**
     * Dispatch 목록 조회 응답을 준비한다.
     *
     * @param dispatches 조회 결과로 돌려줄 Agent Dispatch 목록
     * @throws IOException mock 실행 선언에서 발생할 수 있는 예외
     */
    private void givenExistingDispatches(List<AgentDispatch> dispatches) throws IOException {
        Call<List<AgentDispatch>> listCall = mock(Call.class);
        when(dispatchClient.listDispatch(ROOM_NAME)).thenReturn(listCall);
        when(listCall.execute()).thenReturn(Response.success(dispatches));
    }

    /**
     * Dispatch 생성 응답을 준비한다.
     *
     * @param response 생성 요청에 돌려줄 응답
     * @return 준비된 생성 요청 mock
     * @throws IOException mock 실행 선언에서 발생할 수 있는 예외
     */
    private Call<AgentDispatch> givenCreateDispatchReturns(
            Response<AgentDispatch> response) throws IOException {
        Call<AgentDispatch> createCall = mock(Call.class);
        when(dispatchClient.createDispatch(
                eq(ROOM_NAME), eq(LiveKitAgentDispatchService.AGENT_NAME), any()))
                .thenReturn(createCall);
        when(createCall.execute()).thenReturn(response);
        return createCall;
    }

    /**
     * 실제 생성 요청에 전달된 metadata 문자열을 꺼낸다.
     *
     * @return Dispatch 생성에 사용된 JSON metadata
     */
    private String capturedMetadata() {
        ArgumentCaptor<String> metadataCaptor = ArgumentCaptor.forClass(String.class);
        verify(dispatchClient).createDispatch(
                eq(ROOM_NAME),
                eq(LiveKitAgentDispatchService.AGENT_NAME),
                metadataCaptor.capture()
        );
        return metadataCaptor.getValue();
    }

    /** 테스트에 사용할 자막 Agent Dispatch 응답을 생성한다. */
    private AgentDispatch dispatch() {
        return AgentDispatch.newBuilder()
                .setRoom(ROOM_NAME)
                .setAgentName(LiveKitAgentDispatchService.AGENT_NAME)
                .build();
    }

    /** 실패 응답에 사용할 오류 본문을 생성한다. */
    private ResponseBody errorBody() {
        return ResponseBody.create("{}", MediaType.parse("application/json"));
    }
}

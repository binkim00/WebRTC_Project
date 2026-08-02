package com.ssafy.backend.livekit.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import io.livekit.server.AgentDispatchServiceClient;
import io.livekit.server.RoomServiceClient;
import livekit.LivekitAgentDispatch.AgentDispatch;
import livekit.LivekitModels.Room;
import org.springframework.stereotype.Service;
import retrofit2.Response;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 공용 영상통화 Room의 실제 상태를 확인해 통화 식별값과 주최자 언어를 담은
 * 자막 AI Agent를 한 번만 배치한다.
 */
@Service
public class LiveKitAgentDispatchService {

    static final String AGENT_NAME = "subtitle-agent";
    static final String METADATA_CALL_SESSION_ID = "callSessionId";
    static final String METADATA_HOST_LANGUAGE = "host_lang";

    private final AgentDispatchServiceClient dispatchClient;
    private final RoomServiceClient roomClient;
    private final LiveKitAgentDispatchStore dispatchStore;
    private final ObjectMapper objectMapper;

    /**
     * LiveKit Dispatch·Room 클라이언트와 중복 방지 저장소, metadata 직렬화기를 주입받는다.
     *
     * @param dispatchClient LiveKit Agent Dispatch API 클라이언트
     * @param roomClient     Room 존재 여부 확인에 사용하는 Room API 클라이언트
     * @param dispatchStore  Room별 배치 선점 저장소
     * @param objectMapper   Dispatch metadata JSON 직렬화기
     */
    public LiveKitAgentDispatchService(
            AgentDispatchServiceClient dispatchClient,
            RoomServiceClient roomClient,
            LiveKitAgentDispatchStore dispatchStore,
            ObjectMapper objectMapper
    ) {
        this.dispatchClient = dispatchClient;
        this.roomClient = roomClient;
        this.dispatchStore = dispatchStore;
        this.objectMapper = objectMapper;
    }

    /**
     * 지정 Room에 자막 Agent가 없을 때만 통화 식별값과 주최자 언어를 metadata로 담아 배치한다.
     *
     * <p>LiveKit에 이미 만들어진 Dispatch를 먼저 조회하므로 Redis 선점 키가 사라진 뒤
     * 재시도해도 중복 Dispatch가 생기지 않는다.
     *
     * @param roomName      LiveKit Room 이름
     * @param callSessionId Agent가 자막 컨텍스트를 식별할 통화 세션 식별자
     * @param hostLanguage  주최 인플루언서의 언어 코드
     * @throws BusinessException LiveKit Dispatch 조회 또는 생성에 실패한 경우
     */
    public void ensureDispatched(String roomName, Long callSessionId, String hostLanguage) {
        boolean claimed = dispatchStore.claim(roomName);

        try {
            if (hasExistingDispatch(roomName)) {
                return;
            }
            if (!claimed) {
                throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
            }

            String metadata = createMetadata(callSessionId, hostLanguage);
            Response<AgentDispatch> response = dispatchClient
                    .createDispatch(roomName, AGENT_NAME, metadata)
                    .execute();
            if (!response.isSuccessful() || response.body() == null) {
                throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
            }
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
        } finally {
            if (claimed) {
                dispatchStore.release(roomName);
            }
        }
    }

    /**
     * LiveKit 서버에 동일 이름의 Agent Dispatch가 이미 존재하는지 확인한다.
     *
     * <p>Room 생성 전에는 LiveKit이 Dispatch 목록 조회를 처리할 노드를 찾지 못해 실패하므로,
     * Room 존재 여부를 먼저 확인하고 없을 때는 배치된 Agent도 없다고 판단한다.
     * 이름이 빈 자동 배치 항목이 함께 조회되므로 Agent 이름이 일치하는 항목만 센다.
     *
     * @param roomName LiveKit Room 이름
     * @return 동일 Agent가 이미 배치되어 있으면 {@code true}
     * @throws IOException LiveKit Dispatch 목록 조회 통신에 실패한 경우
     */
    private boolean hasExistingDispatch(String roomName) throws IOException {
        if (!roomExists(roomName)) {
            return false;
        }
        Response<List<AgentDispatch>> response = dispatchClient.listDispatch(roomName).execute();
        if (!response.isSuccessful()) {
            throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
        }
        List<AgentDispatch> dispatches = response.body();
        return dispatches != null && dispatches.stream()
                .anyMatch(dispatch -> AGENT_NAME.equals(dispatch.getAgentName()));
    }

    /**
     * LiveKit 서버에 해당 Room이 아직 살아 있는지 확인한다.
     *
     * @param roomName LiveKit Room 이름
     * @return Room이 존재하면 {@code true}
     * @throws IOException LiveKit Room 목록 조회 통신에 실패한 경우
     */
    private boolean roomExists(String roomName) throws IOException {
        Response<List<Room>> response = roomClient.listRooms(List.of(roomName)).execute();
        if (!response.isSuccessful()) {
            throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
        }
        List<Room> rooms = response.body();
        return rooms != null && !rooms.isEmpty();
    }

    /**
     * 자막 Agent가 읽을 통화 식별값과 주최자 언어를 JSON metadata 문자열로 직렬화한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @param hostLanguage  주최 인플루언서의 언어 코드
     * @return Dispatch에 첨부할 JSON metadata 문자열
     * @throws BusinessException metadata 직렬화에 실패한 경우
     */
    private String createMetadata(Long callSessionId, String hostLanguage) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put(METADATA_CALL_SESSION_ID, callSessionId);
        metadata.put(METADATA_HOST_LANGUAGE, hostLanguage);
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (JacksonException exception) {
            throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
        }
    }
}

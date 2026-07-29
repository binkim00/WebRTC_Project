package com.ssafy.backend.livekit.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import io.livekit.server.AgentDispatchServiceClient;
import livekit.LivekitAgentDispatch.AgentDispatch;
import org.springframework.stereotype.Service;
import retrofit2.Response;

import java.io.IOException;
import java.util.List;

/** 공용 영상통화 Room의 실제 상태를 확인해 자막 AI Agent를 한 번만 자동 배치한다. */
@Service
public class LiveKitAgentDispatchService {

    static final String AGENT_NAME = "subtitle-agent";

    private final AgentDispatchServiceClient dispatchClient;
    private final LiveKitAgentDispatchStore dispatchStore;

    /**
     * LiveKit Dispatch 클라이언트와 중복 방지 저장소를 주입받는다.
     *
     * @param dispatchClient LiveKit Agent Dispatch API 클라이언트
     * @param dispatchStore  Room별 배치 선점 저장소
     */
    public LiveKitAgentDispatchService(
            AgentDispatchServiceClient dispatchClient,
            LiveKitAgentDispatchStore dispatchStore
    ) {
        this.dispatchClient = dispatchClient;
        this.dispatchStore = dispatchStore;
    }

    /**
     * 지정 Room에 자막 Agent가 없을 때 한 번만 배치한다.
     *
     * @param roomName LiveKit Room 이름
     * @throws BusinessException LiveKit Dispatch 조회 또는 생성에 실패한 경우
     */
    public void ensureDispatched(String roomName) {
        boolean claimed = dispatchStore.claim(roomName);

        try {
            if (hasExistingDispatch(roomName)) {
                return;
            }
            if (!claimed) {
                throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
            }

            Response<AgentDispatch> response = dispatchClient
                    .createDispatch(roomName, AGENT_NAME)
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
     * @param roomName LiveKit Room 이름
     * @return 동일 Agent가 이미 배치되어 있으면 {@code true}
     * @throws IOException LiveKit Dispatch 목록 조회 통신에 실패한 경우
     */
    private boolean hasExistingDispatch(String roomName) throws IOException {
        Response<List<AgentDispatch>> response = dispatchClient.listDispatch(roomName).execute();
        if (!response.isSuccessful()) {
            throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
        }
        List<AgentDispatch> dispatches = response.body();
        return dispatches != null && dispatches.stream()
                .anyMatch(dispatch -> AGENT_NAME.equals(dispatch.getAgentName()));
    }
}

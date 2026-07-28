package com.ssafy.backend.livekit.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import io.livekit.server.RoomServiceClient;
import livekit.LivekitModels;
import org.springframework.stereotype.Service;
import retrofit2.Response;

import java.io.IOException;
import java.util.List;

/** 공유 LiveKit Room을 유지하면서 현재 팬 참가자만 관리한다. */
@Service
public class LiveKitRoomParticipantService {

    private static final String CALL_SESSION_ID_ATTRIBUTE = "call_session_id";

    private final RoomServiceClient roomServiceClient;

    /**
     * LiveKit Room 관리 클라이언트를 주입받는다.
     *
     * @param roomServiceClient LiveKit Room 관리 API 클라이언트
     */
    public LiveKitRoomParticipantService(RoomServiceClient roomServiceClient) {
        this.roomServiceClient = roomServiceClient;
    }

    /**
     * 공유 Room에서 지정 통화 세션 attribute를 가진 팬만 제거한다.
     *
     * @param roomId 공유 LiveKit Room 식별자
     * @param callSessionId 종료할 통화 세션 식별자
     * @throws BusinessException LiveKit 참가자 조회 또는 제거 요청이 실패한 경우
     */
    public void removeFan(String roomId, Long callSessionId) {
        try {
            Response<List<LivekitModels.ParticipantInfo>> listResponse =
                    roomServiceClient.listParticipants(roomId).execute();
            if (!listResponse.isSuccessful() || listResponse.body() == null) {
                throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
            }

            String expectedSessionId = callSessionId.toString();
            for (LivekitModels.ParticipantInfo participant : listResponse.body()) {
                if (expectedSessionId.equals(
                        participant.getAttributesMap().get(CALL_SESSION_ID_ATTRIBUTE))) {
                    removeParticipant(roomId, participant.getIdentity());
                    return;
                }
            }
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
        }
    }

    /**
     * LiveKit Room에서 identity가 일치하는 참가자를 제거한다.
     *
     * @param roomId 공유 LiveKit Room 식별자
     * @param identity 제거할 팬의 익명 LiveKit identity
     * @throws IOException LiveKit 관리 API 통신에 실패한 경우
     */
    private void removeParticipant(String roomId, String identity) throws IOException {
        Response<Void> response = roomServiceClient.removeParticipant(roomId, identity).execute();
        if (!response.isSuccessful()) {
            throw new BusinessException(ErrorCode.LIVEKIT_OPERATION_FAILED);
        }
    }
}

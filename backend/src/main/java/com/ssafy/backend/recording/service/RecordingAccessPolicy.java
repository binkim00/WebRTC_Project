package com.ssafy.backend.recording.service;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Component;

/**
 * 녹화 접근 권한을 한곳에서 판정한다.
 *
 * <p>녹화는 통화 상대의 얼굴과 음성이 담긴 민감 자료이므로 해당 통화에 참여한 팬 본인만
 * 업로드·조회·재생·다운로드할 수 있다. 운영자와 ADMIN도 접근하지 못한다.
 */
@Component
public class RecordingAccessPolicy {

    /**
     * 사용자가 해당 통화에 참여한 팬 본인인지 검증한다.
     *
     * @param callSession 대기열·참가자·팬을 함께 조회한 통화 세션
     * @param user 요청 사용자
     * @throws BusinessException 참여한 팬 본인이 아닌 경우
     */
    public void requireParticipantFan(CallSession callSession, User user) {
        if (!isParticipantFan(callSession, user.getId())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
    }

    /**
     * 사용자가 해당 녹화를 소유한 팬 본인인지 검증한다.
     *
     * <p>다른 사용자의 녹화는 존재 여부조차 알리지 않기 위해 없는 녹화와 같은 오류를 던진다.
     *
     * @param recording 통화·참가자·팬을 함께 조회한 녹화
     * @param userId 요청 사용자 식별자
     * @throws BusinessException 소유한 팬 본인이 아닌 경우
     */
    public void requireOwnerFan(Recording recording, Long userId) {
        if (!isParticipantFan(recording.getCallSession(), userId)) {
            throw new BusinessException(ErrorCode.RECORDING_NOT_FOUND);
        }
    }

    /**
     * 통화에 참여한 팬과 사용자가 같은지 예외 없이 판정한다.
     *
     * @param callSession 통화 세션
     * @param userId 요청 사용자 식별자
     * @return 참여한 팬 본인이면 true
     */
    private boolean isParticipantFan(CallSession callSession, Long userId) {
        if (callSession == null || userId == null) {
            return false;
        }
        var queueEntry = callSession.getQueueEntry();
        if (queueEntry == null || queueEntry.getParticipant() == null) {
            return false;
        }
        User fan = queueEntry.getParticipant().getFan();
        return fan != null && userId.equals(fan.getId());
    }
}

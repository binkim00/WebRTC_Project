package com.ssafy.backend.call.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.dto.CallSessionEndResponse;
import com.ssafy.backend.call.dto.CallSessionStatusResponse;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.LocalDateTime;

/** 통화 상태 조회와 운영자 강제 종료를 처리한다. */
@Service
public class CallSessionService {

    private final CallSessionRepository callSessionRepository;
    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final CallSessionFinalizer finalizer;
    private final Clock clock;

    /**
     * 통화 조회·종료에 필요한 저장소와 외부 연동 서비스를 주입받는다.
     *
     * @param callSessionRepository 통화 세션 저장소
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param finalizer 통화와 대기열의 공통 종료 처리기
     * @param clock 서버 기준 시각 제공자
     */
    public CallSessionService(
            CallSessionRepository callSessionRepository,
            CurrentUserService currentUserService,
            MeetingAccessService meetingAccessService,
            CallSessionFinalizer finalizer,
            Clock clock
    ) {
        this.callSessionRepository = callSessionRepository;
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.finalizer = finalizer;
        this.clock = clock;
    }

    /**
     * 통화 관계 사용자에게 서버 기준 통화 상태와 남은 시간을 반환한다.
     *
     * @param callSessionId 조회할 통화 세션 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 서버 시각이 포함된 통화 상태
     * @throws BusinessException 통화가 없거나 조회 권한이 없는 경우
     */
    @Transactional(readOnly = true)
    public CallSessionStatusResponse getStatus(
            Long callSessionId, AuthenticatedUser principal
    ) {
        User user = currentUserService.requireActiveUser(principal);
        CallSession callSession = callSessionRepository.findAccessContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        requireReadAccess(callSession, user);
        return CallSessionStatusResponse.from(callSession, LocalDateTime.now(clock));
    }

    /**
     * 권한 있는 운영자가 진행 중이거나 연결을 기다리는 통화를 강제로 종료한다.
     *
     * <p>활성 통화는 완료로 마감하고 팬만 공유 Room에서 제거한다. 아직 연결되지 않은 통화는
     * 노쇼로 마감해 다음 참가자를 호출할 수 있도록 호출 자리를 비운다.
     *
     * @param callSessionId 종료할 통화 세션 식별자
     * @param reason 운영자가 입력한 강제 종료 사유
     * @param principal JWT 인증 사용자 정보
     * @return 종료된 통화의 최종 상태
     * @throws BusinessException 통화가 없거나 권한·상태·요청값이 유효하지 않은 경우
     */
    @Transactional
    public CallSessionEndResponse forceEnd(
            Long callSessionId, String reason, AuthenticatedUser principal
    ) {
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        User user = currentUserService.requireActiveUser(principal);
        CallSession callSession = callSessionRepository.findEndContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        requireForceEndAccess(callSession, user);

        LocalDateTime endedAt = LocalDateTime.now(clock);
        try {
            if (callSession.getStatus() == CallSessionStatus.ACTIVE) {
                finalizer.end(callSession, endedAt, CallEndReason.FORCED, user);
            } else if (callSession.getStatus() == CallSessionStatus.CONNECTING) {
                finalizer.failConnecting(callSession, endedAt, CallEndReason.FORCED, user);
            } else {
                throw new BusinessException(ErrorCode.CALL_SESSION_STATE_CONFLICT);
            }
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.CALL_SESSION_STATE_CONFLICT);
        }
        return CallSessionEndResponse.from(callSession);
    }

    /**
     * 통화 중인 팬이 자신의 통화를 정상 종료한다.
     *
     * <p>팬이 직접 끊었을 때 재접속 유예가 끝날 때까지 기다리지 않고 바로 마감하기 위한 경로다.
     *
     * @param callSessionId 종료할 통화 세션 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 종료된 통화의 최종 상태
     * @throws BusinessException 통화가 없거나 당사자가 아니거나 활성 통화가 아닌 경우
     */
    @Transactional
    public CallSessionEndResponse endByFan(Long callSessionId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        CallSession callSession = callSessionRepository.findEndContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        if (!sameUser(callSession.getQueueEntry().getParticipant().getFan(), user)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        if (callSession.getStatus() != CallSessionStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CALL_SESSION_STATE_CONFLICT);
        }

        finalizer.end(callSession, LocalDateTime.now(clock), CallEndReason.NORMAL, user);
        return CallSessionEndResponse.from(callSession);
    }

    /**
     * 팬·인플루언서·해당 팬미팅 매니저 중 하나인지 확인한다.
     *
     * @param callSession 조회 대상 통화 세션
     * @param user 현재 사용자
     * @throws BusinessException 통화 관계 사용자가 아닌 경우
     */
    private void requireReadAccess(CallSession callSession, User user) {
        QueueEntry queueEntry = callSession.getQueueEntry();
        FanMeeting meeting = queueEntry.getMeeting();
        if (sameUser(queueEntry.getParticipant().getFan(), user)
                || sameUser(meeting.getInfluencer(), user)
                || isMeetingManager(meeting, user)) {
            return;
        }
        throw new BusinessException(ErrorCode.ACCESS_DENIED);
    }

    /**
     * 강제 종료 요청자가 현재 인플루언서 또는 해당 팬미팅 매니저인지 확인한다.
     *
     * @param callSession 종료 대상 통화 세션
     * @param user 현재 사용자
     * @throws BusinessException 강제 종료 권한이 없는 경우
     */
    private void requireForceEndAccess(CallSession callSession, User user) {
        FanMeeting meeting = callSession.getQueueEntry().getMeeting();
        boolean influencer = (user.getRole() == UserRole.INFLUENCER
                || user.getRole() == UserRole.SOLO_INFLUENCER)
                && sameUser(meeting.getInfluencer(), user);
        if (influencer || isMeetingManager(meeting, user)) {
            return;
        }
        throw new BusinessException(ErrorCode.ACCESS_DENIED);
    }

    /**
     * 사용자가 해당 팬미팅을 담당하는 매니저인지 확인한다.
     *
     * @param meeting 권한을 확인할 팬미팅
     * @param user 현재 사용자
     * @return 매니저 권한 검증을 통과하면 true
     */
    private boolean isMeetingManager(FanMeeting meeting, User user) {
        if (user.getRole() != UserRole.MANAGER) {
            return false;
        }
        try {
            meetingAccessService.requireManager(meeting.getId(), user);
            return true;
        } catch (BusinessException exception) {
            return false;
        }
    }

    /**
     * 두 사용자 엔티티가 같은 식별자를 가리키는지 확인한다.
     *
     * @param left 첫 번째 사용자
     * @param right 두 번째 사용자
     * @return 두 식별자가 같으면 true
     */
    private boolean sameUser(User left, User right) {
        return left != null && right != null && left.getId().equals(right.getId());
    }
}

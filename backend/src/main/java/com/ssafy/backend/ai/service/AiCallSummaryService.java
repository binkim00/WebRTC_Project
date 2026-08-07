package com.ssafy.backend.ai.service;

import com.ssafy.backend.ai.domain.AiCallSummary;
import com.ssafy.backend.ai.domain.AiCallSummaryStatus;
import com.ssafy.backend.ai.dto.AiCallSummaryResponse;
import com.ssafy.backend.ai.repository.AiCallSummaryRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * 팬미팅 운영자에게 AI가 생성한 통화 요약을 제공한다.
 * 요약 생성과 저장은 AI Agent가 담당하므로 이 서비스는 조회만 수행한다.
 */
@Service
public class AiCallSummaryService {

    /**
     * 요약이 이 시간 안에 끝나지 않으면 Agent가 중단된 것으로 보고 생성 실패로 처리한다.
     * Agent가 종료 훅에서 최대 30초만 대기하다 연결을 닫기 때문에,
     * 이 방어가 없으면 클라이언트가 202 응답만 무한히 받게 된다.
     */
    private static final Duration GENERATION_TIMEOUT = Duration.ofMinutes(10);

    private final AiCallSummaryRepository aiCallSummaryRepository;
    private final CallSessionRepository callSessionRepository;
    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final Clock clock;

    /**
     * 요약 조회에 필요한 저장소와 권한 검증 서비스, 시계를 주입받는다.
     *
     * @param aiCallSummaryRepository AI 통화 요약 저장소
     * @param callSessionRepository 통화 세션 저장소
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 권한 검증 서비스
     * @param clock 생성 지연 판단 기준 시계
     */
    public AiCallSummaryService(AiCallSummaryRepository aiCallSummaryRepository,
                                CallSessionRepository callSessionRepository,
                                CurrentUserService currentUserService,
                                MeetingAccessService meetingAccessService,
                                Clock clock) {
        this.aiCallSummaryRepository = aiCallSummaryRepository;
        this.callSessionRepository = callSessionRepository;
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.clock = clock;
    }

    /**
     * 팬미팅 운영자에게 통화 요약을 반환한다.
     *
     * @param callSessionId 조회할 통화 세션 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 생성이 끝난 요약이며, 아직 생성 중이면 empty
     * @throws BusinessException 통화 세션이 없거나 운영자가 아니거나 요약 생성에 실패한 경우
     */
    @Transactional(readOnly = true)
    public Optional<AiCallSummaryResponse> getSummary(Long callSessionId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        CallSession callSession = callSessionRepository.findAccessContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        meetingAccessService.requireOperator(callSession.getQueueEntry().getMeeting().getId(), user);

        return aiCallSummaryRepository.findByCallSession_Id(callSessionId)
                .map(this::toResponse)
                .orElseGet(() -> waitingForAgent(callSession));
    }

    /**
     * 저장된 요약의 생성 상태에 따라 응답을 결정한다.
     *
     * @param callSummary 조회된 통화 요약
     * @return 생성이 끝났으면 요약 응답, 생성 중이면 empty
     * @throws BusinessException 생성에 실패했거나 생성이 지나치게 지연된 경우
     */
    private Optional<AiCallSummaryResponse> toResponse(AiCallSummary callSummary) {
        if (callSummary.getStatus() == AiCallSummaryStatus.COMPLETED) {
            return Optional.of(AiCallSummaryResponse.from(callSummary));
        }
        if (callSummary.getStatus() == AiCallSummaryStatus.FAILED) {
            throw new BusinessException(ErrorCode.AI_CALL_SUMMARY_NOT_FOUND);
        }
        // 생성 중으로 남아 있으나 제한 시간을 넘겼다면 Agent가 중단된 것으로 본다.
        if (isTimedOut(callSummary.getCreatedAt())) {
            throw new BusinessException(ErrorCode.AI_CALL_SUMMARY_NOT_FOUND);
        }
        return Optional.empty();
    }

    /**
     * 요약 행이 아직 없을 때 Agent가 생성을 시작하기 전인지 판단한다.
     *
     * @param callSession 조회 대상 통화 세션
     * @return 아직 기다릴 만하면 empty
     * @throws BusinessException 통화 종료 후 제한 시간이 지나도록 요약이 시작되지 않은 경우
     */
    private Optional<AiCallSummaryResponse> waitingForAgent(CallSession callSession) {
        LocalDateTime endedAt = callSession.getEndedAt();
        if (endedAt != null && isTimedOut(endedAt)) {
            throw new BusinessException(ErrorCode.AI_CALL_SUMMARY_NOT_FOUND);
        }
        return Optional.empty();
    }

    /**
     * 기준 시각이 요약 생성 제한 시간을 넘겼는지 확인한다.
     *
     * @param startedAt 판단 기준이 되는 시각
     * @return 제한 시간을 넘겼으면 true
     */
    private boolean isTimedOut(LocalDateTime startedAt) {
        return startedAt != null
                && startedAt.plus(GENERATION_TIMEOUT).isBefore(LocalDateTime.now(clock));
    }
}

package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.livekit.service.LiveKitAgentDispatchService;
import com.ssafy.backend.livekit.support.LiveKitRoomNames;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueCallResponse;
import com.ssafy.backend.queue.dto.QueueEnterResponse;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
import com.ssafy.backend.queue.redis.QueueClaimResult;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Set;

/** 대기실 입장, 참가자 호출, 재호출과 노쇼 상태 변경을 처리한다. */
@Service
public class QueueCommandService {
    private static final Logger log = LoggerFactory.getLogger(QueueCommandService.class);
    private static final Set<CallSessionStatus> ACTIVE_CALL_SESSION_STATUSES =
            Set.of(CallSessionStatus.CONNECTING, CallSessionStatus.ACTIVE);

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final MeetingOperationSettingRepository operationSettingRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final CallSessionRepository callSessionRepository;
    private final QueueRealtimeStore realtimeStore;
    private final QueueQueryService queryService;
    private final QueueInitializationService initializationService;
    private final LiveKitAgentDispatchService agentDispatchService;
    private final Clock clock;

    /**
     * 대기열과 영상통화 상태 변경에 필요한 구성 요소를 주입받는다.
     *
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param operationSettingRepository 팬미팅 운영 설정 저장소
     * @param queueEntryRepository 대기열 항목 저장소
     * @param callSessionRepository 영상통화 세션 저장소
     * @param realtimeStore Redis 실시간 대기열 저장소
     * @param queryService 대기열 응답 조회 서비스
     * @param initializationService 참가자 기반 대기열 초기화 서비스
     * @param agentDispatchService 자막 AI Agent 배치 서비스
     * @param clock 상태 변경 시각 기준 시계
     */
    public QueueCommandService(CurrentUserService currentUserService,
                               MeetingAccessService meetingAccessService,
                               MeetingOperationSettingRepository operationSettingRepository,
                               QueueEntryRepository queueEntryRepository,
                               CallSessionRepository callSessionRepository,
                               QueueRealtimeStore realtimeStore,
                               QueueQueryService queryService,
                               QueueInitializationService initializationService,
                               LiveKitAgentDispatchService agentDispatchService,
                               Clock clock) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.operationSettingRepository = operationSettingRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.callSessionRepository = callSessionRepository;
        this.realtimeStore = realtimeStore;
        this.queryService = queryService;
        this.initializationService = initializationService;
        this.agentDispatchService = agentDispatchService;
        this.clock = clock;
    }

    /**
     * 로그인 참가자를 대기실 운영 시작 이후 한 번만 입장시킨다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 대기열 최초 입장 결과
     * @throws BusinessException 팬미팅이 종료·취소되었거나 대기실 오픈 전이거나
     *                          참가자 또는 상태 검증에 실패한 경우
     */
    @Transactional
    public QueueEnterResponse enter(Long meetingId, AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        // 종료·취소 확인은 대기열 초기화보다 먼저 한다. 팬미팅 종료가 지운 Redis 대기열을
        // 뒤늦은 입장 요청이 다시 만들어 내는 것을 막아야 하기 때문이다.
        meetingAccessService.requireJoinableMeeting(meetingId);
        initializationService.ensureInitializedForParticipant(meetingId, user.getId());
        LocalDateTime now = LocalDateTime.now(clock);
        MeetingOperationSetting setting = operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
        if (setting.getWaitingRoomOpenAt() != null && now.isBefore(setting.getWaitingRoomOpenAt())) {
            throw new BusinessException(ErrorCode.WAITING_ROOM_NOT_OPEN);
        }
        // 초기화는 별도 트랜잭션에서 커밋되므로 이 트랜잭션의 스냅샷 조회로는 보이지 않는다.
        // 잠금 조회는 최신 커밋 데이터를 읽어 최초 입장에서도 방금 만들어진 항목을 찾는다.
        QueueEntry locked = queueEntryRepository
                .findForUpdateByMeetingAndFan(meetingId, user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        try {
            locked.enter(now);
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_ENTRY_ALREADY_ENTERED);
        }
        realtimeStore.updateStatus(meetingId, locked.getId(), locked.getStatus());
        QueueSnapshotResponse snapshot = queryService.getMySnapshot(meetingId, principal);
        return new QueueEnterResponse(
                snapshot.queueEntryId(),
                snapshot.position(),
                QueueEntryStatus.WAITING,
                locked.getEnteredAt(),
                snapshot.aheadCount(),
                snapshot.estimatedWaitSec()
        );
    }

    /**
     * 매니저가 지정한 참가자를 호출하고 동일 API의 두 번째 요청을 재호출로 처리한다.
     *
     * @param entryId 호출할 대기열 항목 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 영상통화 세션 식별자를 포함한 호출 또는 재호출 결과
     * @throws BusinessException 매니저 권한, 호출 상태 또는 최대 횟수 검증에 실패한 경우
     */
    @Transactional
    public QueueCallResponse call(Long entryId, AuthenticatedUser principal) {
        User manager = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository.findByIdForUpdate(entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        Long meetingId = entry.getMeeting().getId();
        meetingAccessService.requireManager(meetingId, manager);

        if (entry.getStatus() == QueueEntryStatus.CALLED) {
            return recallCurrent(meetingId, entry);
        }
        if (entry.getStatus() != QueueEntryStatus.WAITING) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }

        QueueClaimResult claimResult = realtimeStore.claimEntry(meetingId, entryId);
        if (claimResult == QueueClaimResult.ACTIVE_CALL) {
            throw new BusinessException(ErrorCode.ACTIVE_CALL_EXISTS);
        }
        if (claimResult == QueueClaimResult.STATE_CONFLICT) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        try {
            entry.call(LocalDateTime.now(clock));
            CallSession callSession = createCallSession(meetingId, entry);
            dispatchSubtitleAgent(meetingId, entry, callSession);
            return toCallResponse(entry, callSession);
        } catch (DataIntegrityViolationException exception) {
            realtimeStore.releaseClaim(meetingId, entryId);
            throw new BusinessException(ErrorCode.ACTIVE_CALL_SESSION_EXISTS);
        } catch (RuntimeException exception) {
            realtimeStore.releaseClaim(meetingId, entryId);
            if (exception instanceof BusinessException businessException) {
                throw businessException;
            }
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
    }

    /**
     * 현재 선점된 참가자를 팬미팅에 설정된 최대 횟수 안에서 재호출한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param entry 재호출할 대기열 항목
     * @return 재호출 결과
     * @throws BusinessException 현재 호출자가 아니거나 최대 호출 횟수를 초과한 경우
     */
    private QueueCallResponse recallCurrent(Long meetingId, QueueEntry entry) {
        Long currentEntryId = realtimeStore.getCurrentEntryId(meetingId);
        if (!entry.getId().equals(currentEntryId)) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        MeetingOperationSetting setting = operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
        if (entry.getRecallCount() >= setting.getMaxRecallCount()) {
            throw new BusinessException(ErrorCode.CALL_ATTEMPT_LIMIT_EXCEEDED);
        }
        CallSession callSession = callSessionRepository.findByQueueEntry_Id(entry.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        try {
            entry.recall(LocalDateTime.now(clock), setting.getMaxRecallCount());
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        dispatchSubtitleAgent(meetingId, entry, callSession);
        return toCallResponse(entry, callSession);
    }

    /**
     * 팬미팅 공용 Room에 통화 식별값과 주최자 언어를 담은 자막 Agent를 한 번만 배치한다.
     *
     * <p>최초 호출과 재호출이 같은 Room을 공유하므로 이미 배치된 Agent가 있으면
     * 중복 생성 없이 그대로 재사용한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param entry 호출 또는 재호출된 대기열 항목
     * @param callSession 해당 팬의 영상통화 세션
     */
    private void dispatchSubtitleAgent(
            Long meetingId, QueueEntry entry, CallSession callSession) {
        String hostLanguage = toLanguageCode(
                entry.getMeeting().getInfluencer().getPreferredLanguage());
        try {
            agentDispatchService.ensureDispatched(
                    LiveKitRoomNames.forMeeting(meetingId),
                    callSession.getId(),
                    hostLanguage
            );
        } catch (RuntimeException exception) {
            log.warn(
                    "LiveKit AI Agent Dispatch failed; keeping the participant call. "
                            + "meetingId={}, entryId={}, callSessionId={}",
                    meetingId, entry.getId(), callSession.getId(), exception
            );
        }
    }

    /**
     * 팬미팅에 활성 세션이 없는 경우 호출된 팬의 연결 대기 세션을 생성한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param entry 최초 호출된 대기열 항목
     * @return DB에 저장되어 식별자가 발급된 영상통화 세션
     * @throws BusinessException 팬미팅에 이미 활성 영상통화 세션이 있는 경우
     */
    private CallSession createCallSession(Long meetingId, QueueEntry entry) {
        if (callSessionRepository.existsByQueueEntry_Meeting_IdAndStatusIn(
                meetingId, ACTIVE_CALL_SESSION_STATUSES)) {
            throw new BusinessException(ErrorCode.ACTIVE_CALL_SESSION_EXISTS);
        }
        String fanLanguage = toLanguageCode(
                entry.getParticipant().getFan().getPreferredLanguage());
        CallSession callSession = CallSession.createConnecting(
                entry,
                LiveKitRoomNames.forMeeting(meetingId),
                fanLanguage
        );
        return callSessionRepository.saveAndFlush(callSession);
    }

    /**
     * 회원 선호 언어를 AI Agent와 약속한 짧은 언어 코드로 변환한다.
     *
     * @param preferredLanguage 회원의 선호 언어
     * @return KOREAN은 ko, ENGLISH는 en, JAPANESE는 ja, CHINESE는 zh, VIETNAMESE는 vi
     */
    private String toLanguageCode(PreferredLanguage preferredLanguage) {
        return switch (preferredLanguage) {
            case KOREAN -> "ko";
            case ENGLISH -> "en";
            case JAPANESE -> "ja";
            case CHINESE -> "zh";
            case VIETNAMESE -> "vi";
        };
    }

    /**
     * 대기열 항목과 생성된 영상통화 세션을 참가자 호출 응답으로 변환한다.
     *
     * @param entry 호출 또는 재호출된 대기열 항목
     * @param callSession 해당 팬의 영상통화 세션
     * @return 명세에 정의된 참가자 호출 응답
     */
    private QueueCallResponse toCallResponse(QueueEntry entry, CallSession callSession) {
        return new QueueCallResponse(
                entry.getId(),
                entry.getStatus(),
                entry.getCalledAt(),
                entry.getCallAttemptCount(),
                callSession.getId(),
                false
        );
    }

    /**
     * 매니저가 현재 호출 중인 참가자를 노쇼 처리하고 현재 선점을 해제한다.
     *
     * @param entryId 노쇼 처리할 대기열 항목 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 노쇼 처리 결과
     * @throws BusinessException 매니저 권한 또는 호출 상태 검증에 실패한 경우
     */
    @Transactional
    public QueueOperationResponse markNoShow(Long entryId, AuthenticatedUser principal) {
        User manager = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository.findByIdForUpdate(entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        Long meetingId = entry.getMeeting().getId();
        meetingAccessService.requireManager(meetingId, manager);
        CallSession callSession = callSessionRepository.findByQueueEntryIdForUpdate(entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        LocalDateTime noShowAt = LocalDateTime.now(clock);
        try {
            entry.markNoShow(noShowAt);
            callSession.failConnecting(noShowAt);
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        realtimeStore.updateStatus(meetingId, entryId, entry.getStatus());
        realtimeStore.clearCurrent(meetingId, entryId);
        realtimeStore.clearFanConnected(callSession.getId());
        realtimeStore.clearDisconnectRole(callSession.getId());
        return queryService.toOperationResponse(entry);
    }
}

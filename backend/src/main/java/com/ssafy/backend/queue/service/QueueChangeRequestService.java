package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueChangeRequest;
import com.ssafy.backend.queue.domain.QueueChangeRequestDecision;
import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueChangeRequestCreateRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestCreateResponse;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionResponse;
import com.ssafy.backend.queue.dto.QueueChangeRequestSummaryResponse;
import com.ssafy.backend.queue.dto.QueuePositionChangeResponse;
import com.ssafy.backend.queue.repository.QueueChangeRequestRepository;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 팬의 순서 미루기 요청 접수와 매니저의 승인·거절 처리를 담당한다. */
@Service
public class QueueChangeRequestService {
    private static final int MAX_PAGE_SIZE = 100;
    private static final String APPROVED_CHANGE_REASON = "요청하신 순서 변경이 승인되었습니다.";

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final QueueEntryRepository queueEntryRepository;
    private final QueueChangeRequestRepository changeRequestRepository;
    private final QueuePositionService positionService;
    private final Clock clock;

    /**
     * 순서 변경 요청 처리에 필요한 저장소와 권한 검증기를 주입받는다.
     *
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param queueEntryRepository 대기열 항목 저장소
     * @param changeRequestRepository 순서 변경 요청 저장소
     * @param positionService 대기 순서 이동 서비스
     * @param clock 요청·처리 시각 기준 시계
     */
    public QueueChangeRequestService(CurrentUserService currentUserService,
                                     MeetingAccessService meetingAccessService,
                                     QueueEntryRepository queueEntryRepository,
                                     QueueChangeRequestRepository changeRequestRepository,
                                     QueuePositionService positionService,
                                     Clock clock) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.queueEntryRepository = queueEntryRepository;
        this.changeRequestRepository = changeRequestRepository;
        this.positionService = positionService;
        this.clock = clock;
    }

    /**
     * 대기 중인 팬이 자신의 순서를 미뤄달라는 요청을 팬미팅당 한 번만 접수한다.
     *
     * @param entryId 요청할 본인의 대기열 항목 식별자
     * @param request 순서 미루기 요청 사유
     * @param principal JWT 인증 사용자 정보
     * @return 접수된 요청 식별자와 대기 상태
     * @throws BusinessException 본인 항목이 아니거나 대기 상태가 아니거나 이미 요청한 경우
     */
    @Transactional
    public QueueChangeRequestCreateResponse create(Long entryId,
                                                  QueueChangeRequestCreateRequest request,
                                                  AuthenticatedUser principal) {
        User fan = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository.findByIdForUpdate(entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        if (!entry.getParticipant().getFan().getId().equals(fan.getId())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        if (entry.getStatus() == QueueEntryStatus.NOT_ENTERED) {
            throw new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_ENTERED);
        }
        if (entry.getStatus() != QueueEntryStatus.WAITING) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        if (changeRequestRepository.existsByQueueEntry_Id(entryId)) {
            throw new BusinessException(ErrorCode.QUEUE_CHANGE_REQUEST_ALREADY_EXISTS);
        }
        QueueChangeRequest saved = changeRequestRepository.save(QueueChangeRequest.create(
                entry, request.requestReason(), LocalDateTime.now(clock)));
        return new QueueChangeRequestCreateResponse(
                saved.getId(), saved.getStatus(), saved.getRequestedAt());
    }

    /**
     * 팬미팅 매니저가 접수된 순서 변경 요청을 요청 시각 순으로 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 조회할 처리 상태이며 {@code null}이면 전체를 조회한다
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 공통 페이지 형식으로 감싼 순서 변경 요청 목록
     * @throws BusinessException 매니저 권한이 없거나 페이지 값이 올바르지 않은 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<QueueChangeRequestSummaryResponse> getRequests(
            Long meetingId, QueueChangeRequestStatus status, int page, int size,
            AuthenticatedUser principal
    ) {
        User manager = currentUserService.requireActiveUser(principal);
        meetingAccessService.requireManager(meetingId, manager);
        validatePage(page, size);
        PageRequest pageable = PageRequest.of(
                page, size, Sort.by(Sort.Order.asc("requestedAt"), Sort.Order.asc("id")));
        Page<QueueChangeRequest> requests = status == null
                ? changeRequestRepository.findByQueueEntry_Meeting_Id(meetingId, pageable)
                : changeRequestRepository.findByQueueEntry_Meeting_IdAndStatus(
                        meetingId, status, pageable);
        return PageResponse.from(requests.map(this::toSummary));
    }

    /**
     * 팬미팅 매니저가 순서 변경 요청을 승인하거나 거절한다.
     *
     * <p>승인 시 요청에 새 순번이 없으면 대기열 마지막으로 이동시키며 이동은
     * {@link QueuePositionService}가 Redis와 DB에 함께 반영한다.
     *
     * @param requestId 처리할 순서 변경 요청 식별자
     * @param request 승인 또는 거절 결정과 새 순번
     * @param principal JWT 인증 사용자 정보
     * @return 처리 상태와 순번 변경 결과
     * @throws BusinessException 요청이 없거나 매니저 권한, 이미 처리된 요청, 이동 조건 검증에 실패한 경우
     */
    @Transactional
    public QueueChangeRequestDecisionResponse process(Long requestId,
                                                     QueueChangeRequestDecisionRequest request,
                                                     AuthenticatedUser principal) {
        User manager = currentUserService.requireActiveUser(principal);
        QueueChangeRequest changeRequest = changeRequestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_CHANGE_REQUEST_NOT_FOUND));
        QueueEntry entry = changeRequest.getQueueEntry();
        Long meetingId = entry.getMeeting().getId();
        meetingAccessService.requireManager(meetingId, manager);
        if (changeRequest.getStatus() != QueueChangeRequestStatus.PENDING) {
            throw new BusinessException(ErrorCode.QUEUE_CHANGE_REQUEST_CONFLICT);
        }
        LocalDateTime processedAt = LocalDateTime.now(clock);
        if (request.decision() == QueueChangeRequestDecision.REJECTED) {
            int previousPosition = entry.getQueuePosition();
            reject(changeRequest, manager, processedAt);
            return new QueueChangeRequestDecisionResponse(
                    changeRequest.getId(), changeRequest.getStatus(), previousPosition,
                    null, processedAt);
        }
        QueuePositionChangeResponse moved = positionService.moveEntry(
                meetingId, entry.getId(), request.newPosition(), APPROVED_CHANGE_REASON);
        approve(changeRequest, manager, moved.newPosition(), processedAt);
        return new QueueChangeRequestDecisionResponse(
                changeRequest.getId(), changeRequest.getStatus(), moved.previousPosition(),
                moved.newPosition(), processedAt);
    }

    /**
     * 요청을 승인 상태로 바꾸고 이미 처리된 요청이면 충돌로 변환한다.
     *
     * @param changeRequest 처리할 순서 변경 요청
     * @param manager 처리한 매니저
     * @param changedPosition 승인으로 적용된 새 순번
     * @param processedAt 처리 시각
     * @throws BusinessException 이미 처리된 요청인 경우
     */
    private void approve(QueueChangeRequest changeRequest, User manager, int changedPosition,
                         LocalDateTime processedAt) {
        try {
            changeRequest.approve(manager, changedPosition, processedAt);
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_CHANGE_REQUEST_CONFLICT);
        }
    }

    /**
     * 요청을 거절 상태로 바꾸고 이미 처리된 요청이면 충돌로 변환한다.
     *
     * @param changeRequest 처리할 순서 변경 요청
     * @param manager 처리한 매니저
     * @param processedAt 처리 시각
     * @throws BusinessException 이미 처리된 요청인 경우
     */
    private void reject(QueueChangeRequest changeRequest, User manager, LocalDateTime processedAt) {
        try {
            changeRequest.reject(manager, processedAt);
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.QUEUE_CHANGE_REQUEST_CONFLICT);
        }
    }

    /**
     * 순서 변경 요청 엔티티를 매니저 화면 응답 항목으로 변환한다.
     *
     * @param changeRequest 변환할 순서 변경 요청
     * @return 매니저 화면용 요청 항목
     */
    private QueueChangeRequestSummaryResponse toSummary(QueueChangeRequest changeRequest) {
        User fan = changeRequest.getQueueEntry().getParticipant().getFan();
        return new QueueChangeRequestSummaryResponse(
                changeRequest.getId(),
                fan.getId(),
                fan.getNickname(),
                fan.getProfileImageUrl(),
                changeRequest.getRequestReason(),
                changeRequest.getRequestedAt(),
                changeRequest.getPreviousQueuePosition(),
                changeRequest.getStatus()
        );
    }

    /**
     * 목록 조회의 페이지 번호와 크기가 허용 범위인지 확인한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @throws BusinessException 페이지 번호나 크기가 허용 범위를 벗어난 경우
     */
    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}

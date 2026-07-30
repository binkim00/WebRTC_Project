package com.ssafy.backend.meeting.service;

import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.dto.FanMeetingDetailResponse;
import com.ssafy.backend.meeting.dto.FanMeetingSummaryResponse;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.Set;

/** 공개 팬미팅과 로그인 사용자의 팬미팅 목록·상세 조회를 처리한다. */
@Service
public class FanMeetingQueryService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<FanMeetingStatus> PUBLIC_STATUSES = EnumSet.of(
            FanMeetingStatus.PUBLISHED,
            FanMeetingStatus.APPLICATION_OPEN,
            FanMeetingStatus.APPLICATION_CLOSED,
            FanMeetingStatus.READY,
            FanMeetingStatus.LIVE,
            FanMeetingStatus.ENDED
    );

    private final CurrentUserService currentUserService;
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final MeetingOperationSettingRepository operationSettingRepository;
    private final ApplicationRepository applicationRepository;
    private final ParticipantRepository participantRepository;
    private final Clock clock;

    /**
     * 팬미팅 조회에 필요한 사용자·팬미팅·설정·응모·참가자 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param operationSettingRepository 운영 설정 저장소
     * @param applicationRepository 응모 저장소
     * @param participantRepository 참가자 저장소
     * @param clock 현재 시각 공급자
     */
    public FanMeetingQueryService(
            CurrentUserService currentUserService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            MeetingOperationSettingRepository operationSettingRepository,
            ApplicationRepository applicationRepository,
            ParticipantRepository participantRepository,
            Clock clock
    ) {
        this.currentUserService = currentUserService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.operationSettingRepository = operationSettingRepository;
        this.applicationRepository = applicationRepository;
        this.participantRepository = participantRepository;
        this.clock = clock;
    }

    /**
     * 일반 사용자에게 공개된 팬미팅을 검색 조건과 함께 페이지 조회한다.
     *
     * @param keyword 팬미팅 제목 또는 인플루언서명 검색어
     * @param status 조회할 공개 상태
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal 선택적 로그인 사용자 정보
     * @return 공개 팬미팅 페이지
     * @throws BusinessException 공개할 수 없는 상태 또는 잘못된 페이지 값인 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<FanMeetingSummaryResponse> getPublicMeetings(
            String keyword, FanMeetingStatus status, int page, int size,
            AuthenticatedUser principal
    ) {
        validatePage(page, size);
        if (status != null && !PUBLIC_STATUSES.contains(status)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        User viewer = optionalActiveUser(principal);
        Page<FanMeetingSummaryResponse> result = fanMeetingRepository.findAll(
                publicSpecification(keyword, status),
                PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "scheduledStartAt"))
        ).map(meeting -> toSummary(meeting, viewer));
        return PageResponse.from(result);
    }

    /**
     * 로그인한 매니저 또는 인플루언서에게 자신이 담당하는 팬미팅을 페이지 조회한다.
     *
     * @param status 조회할 팬미팅 상태
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal 로그인 사용자 정보
     * @return 담당 팬미팅 페이지
     * @throws BusinessException 역할 또는 페이지 값이 올바르지 않은 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<FanMeetingSummaryResponse> getMyMeetings(
            FanMeetingStatus status, int page, int size, AuthenticatedUser principal
    ) {
        validatePage(page, size);
        User actor = currentUserService.requireActiveUser(principal);
        if (actor.getRole() != UserRole.MANAGER
                && actor.getRole() != UserRole.INFLUENCER
                && actor.getRole() != UserRole.SOLO_INFLUENCER) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        Page<FanMeetingSummaryResponse> result = fanMeetingRepository.findAll(
                ownedSpecification(actor, status),
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "scheduledStartAt"))
        ).map(meeting -> toSummary(meeting, actor));
        return PageResponse.from(result);
    }

    /**
     * 팬미팅 상세와 현재 조회자의 응모·참가·입장 가능 상태를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 팬미팅 상세 정보
     * @throws BusinessException 팬미팅이 없거나 비공개 상태에 접근할 수 없는 경우
     */
    @Transactional(readOnly = true)
    public FanMeetingDetailResponse getDetail(Long meetingId, AuthenticatedUser principal) {
        FanMeeting meeting = fanMeetingRepository.findById(meetingId)
                .filter(candidate -> candidate.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
        User viewer = optionalActiveUser(principal);
        if (!PUBLIC_STATUSES.contains(meeting.getStatus()) && !canViewPrivate(meeting, viewer)) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }

        MeetingApplicationSetting application = requireApplicationSetting(meetingId);
        MeetingOperationSetting operation = requireOperationSetting(meetingId);
        ApplicationStatus applicationStatus = findApplicationStatus(meetingId, viewer);
        Participant participant = findParticipant(meetingId, viewer);
        boolean canApply = canApply(meeting, application, viewer, applicationStatus);
        boolean canEnter = canEnter(meeting, operation, participant);
        return FanMeetingDetailResponse.of(
                meeting, application, operation, applicationStatus,
                participant == null ? null : participant.getStatus(), canApply, canEnter
        );
    }

    /** 공개 목록에 사용할 삭제 여부, 상태 및 검색어 조건을 구성한다. */
    private Specification<FanMeeting> publicSpecification(
            String keyword, FanMeetingStatus status
    ) {
        return (root, query, builder) -> {
            Predicate predicate = builder.and(
                    builder.isNull(root.get("deletedAt")),
                    root.get("status").in(status == null ? PUBLIC_STATUSES : Set.of(status))
            );
            if (!StringUtils.hasText(keyword)) {
                return predicate;
            }
            String pattern = "%" + keyword.trim().toLowerCase() + "%";
            Predicate search = builder.or(
                    builder.like(builder.lower(root.get("title")), pattern),
                    builder.like(builder.lower(root.get("influencer").get("nickname")), pattern)
            );
            return builder.and(predicate, search);
        };
    }

    /** 로그인 사용자의 역할에 따라 담당 팬미팅 조건을 구성한다. */
    private Specification<FanMeeting> ownedSpecification(User actor, FanMeetingStatus status) {
        return (root, query, builder) -> {
            Predicate owner = actor.getRole() == UserRole.MANAGER
                    ? builder.equal(root.get("manager").get("id"), actor.getId())
                    : builder.equal(root.get("influencer").get("id"), actor.getId());
            Predicate predicate = builder.and(builder.isNull(root.get("deletedAt")), owner);
            return status == null
                    ? predicate
                    : builder.and(predicate, builder.equal(root.get("status"), status));
        };
    }

    /** 팬미팅 한 건을 목록 요약 응답으로 변환한다. */
    private FanMeetingSummaryResponse toSummary(FanMeeting meeting, User viewer) {
        Long meetingId = meeting.getId();
        return FanMeetingSummaryResponse.of(
                meeting,
                requireApplicationSetting(meetingId),
                findApplicationStatus(meetingId, viewer),
                applicationRepository.countByMeeting_IdAndStatusNot(
                        meetingId, ApplicationStatus.WITHDRAWN
                ),
                participantRepository.countByMeeting_Id(meetingId)
        );
    }

    /** 인증 정보가 있으면 활성 사용자를 조회하고 없으면 익명 조회자로 처리한다. */
    private User optionalActiveUser(AuthenticatedUser principal) {
        return principal == null ? null : currentUserService.requireActiveUser(principal);
    }

    /** 비공개 팬미팅을 현재 담당 매니저 또는 인플루언서가 조회할 수 있는지 확인한다. */
    private boolean canViewPrivate(FanMeeting meeting, User viewer) {
        return viewer != null && (sameUser(meeting.getManager(), viewer)
                || sameUser(meeting.getInfluencer(), viewer));
    }

    /** 팬 역할 조회자의 현재 응모 상태를 반환한다. */
    private ApplicationStatus findApplicationStatus(Long meetingId, User viewer) {
        if (viewer == null || viewer.getRole() != UserRole.FAN) {
            return null;
        }
        return applicationRepository.findByMeeting_IdAndFan_Id(meetingId, viewer.getId())
                .map(application -> application.getStatus())
                .orElse(null);
    }

    /** 팬 역할 조회자의 참가자 정보를 반환한다. */
    private Participant findParticipant(Long meetingId, User viewer) {
        if (viewer == null || viewer.getRole() != UserRole.FAN) {
            return null;
        }
        return participantRepository.findByMeeting_IdAndFan_Id(meetingId, viewer.getId())
                .orElse(null);
    }

    /** 현재 팬이 응모할 수 있는 공개 기간인지 확인한다. */
    private boolean canApply(
            FanMeeting meeting, MeetingApplicationSetting application,
            User viewer, ApplicationStatus applicationStatus
    ) {
        if (viewer == null || viewer.getRole() != UserRole.FAN
                || (applicationStatus != null
                && applicationStatus != ApplicationStatus.WITHDRAWN)
                || !application.isEnabled()
                || meeting.getStatus() != FanMeetingStatus.APPLICATION_OPEN) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        return application.getApplicationOpenAt() != null
                && application.getApplicationCloseAt() != null
                && !now.isBefore(application.getApplicationOpenAt())
                && now.isBefore(application.getApplicationCloseAt());
    }

    /** 확정 참가자가 대기실 개방 이후 입장할 수 있는지 확인한다. */
    private boolean canEnter(
            FanMeeting meeting, MeetingOperationSetting operation, Participant participant
    ) {
        if (participant == null || meeting.getStatus() == FanMeetingStatus.CANCELED
                || meeting.getStatus() == FanMeetingStatus.ENDED) {
            return false;
        }
        LocalDateTime openAt = operation.getWaitingRoomOpenAt();
        return openAt == null || !LocalDateTime.now(clock).isBefore(openAt);
    }

    /** 응모 설정을 조회하고 없으면 공통 비즈니스 예외를 발생시킨다. */
    private MeetingApplicationSetting requireApplicationSetting(Long meetingId) {
        return applicationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.APPLICATION_SETTING_NOT_FOUND));
    }

    /** 운영 설정을 조회하고 없으면 공통 비즈니스 예외를 발생시킨다. */
    private MeetingOperationSetting requireOperationSetting(Long meetingId) {
        return operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
    }

    /** 페이지 번호와 크기가 허용 범위인지 검증한다. */
    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    /** 두 사용자의 영속 식별자가 같은지 확인한다. */
    private boolean sameUser(User left, User right) {
        return left != null && left.getId().equals(right.getId());
    }
}

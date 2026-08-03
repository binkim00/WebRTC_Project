package com.ssafy.backend.meeting.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.livekit.service.LiveKitRoomParticipantService;
import com.ssafy.backend.livekit.support.LiveKitRoomNames;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.dto.FanMeetingManagementResponse;
import com.ssafy.backend.meeting.dto.FanMeetingTestControlRequest;
import com.ssafy.backend.meeting.dto.FanMeetingUpdateRequest;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/** 팬미팅 수정·게시·취소·시작·종료 명령을 처리한다. */
@Service
public class FanMeetingManagementService {

    private static final Set<FanMeetingStatus> PRE_LIVE_STATUSES = EnumSet.of(
            FanMeetingStatus.DRAFT,
            FanMeetingStatus.PUBLISHED,
            FanMeetingStatus.APPLICATION_OPEN,
            FanMeetingStatus.APPLICATION_CLOSED,
            FanMeetingStatus.READY
    );

    private final CurrentUserService currentUserService;
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final MeetingOperationSettingRepository operationSettingRepository;
    private final UserRepository userRepository;
    private final OrganizationMemberRepository organizationMemberRepository;
    private final ApplicationRepository applicationRepository;
    private final ParticipantRepository participantRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final CallSessionRepository callSessionRepository;
    private final NotificationRepository notificationRepository;
    private final LiveKitRoomParticipantService roomParticipantService;
    private final QueueRealtimeStore realtimeStore;
    private final Clock clock;

    /** 팬미팅 관리 명령에 필요한 저장소와 외부 연동 구성 요소를 주입받는다. */
    public FanMeetingManagementService(
            CurrentUserService currentUserService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            MeetingOperationSettingRepository operationSettingRepository,
            UserRepository userRepository,
            OrganizationMemberRepository organizationMemberRepository,
            ApplicationRepository applicationRepository,
            ParticipantRepository participantRepository,
            QueueEntryRepository queueEntryRepository,
            CallSessionRepository callSessionRepository,
            NotificationRepository notificationRepository,
            LiveKitRoomParticipantService roomParticipantService,
            QueueRealtimeStore realtimeStore,
            Clock clock
    ) {
        this.currentUserService = currentUserService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.operationSettingRepository = operationSettingRepository;
        this.userRepository = userRepository;
        this.organizationMemberRepository = organizationMemberRepository;
        this.applicationRepository = applicationRepository;
        this.participantRepository = participantRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.callSessionRepository = callSessionRepository;
        this.notificationRepository = notificationRepository;
        this.roomParticipantService = roomParticipantService;
        this.realtimeStore = realtimeStore;
        this.clock = clock;
    }

    /**
     * 응모 시작 전 팬미팅 정보와 설정을 수정한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자
     * @param request 선택적 수정 값
     * @return 수정된 팬미팅 정보
     */
    @Transactional
    public FanMeetingManagementResponse update(
            Long meetingId, AuthenticatedUser principal, FanMeetingUpdateRequest request
    ) {
        User actor = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        requireManagerOrSolo(meeting, actor);
        MeetingApplicationSetting application = requireApplicationSetting(meetingId);
        MeetingOperationSetting operation = requireOperationSetting(meetingId);
        LocalDateTime now = LocalDateTime.now(clock);
        if (!PRE_LIVE_STATUSES.contains(meeting.getStatus())) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
        boolean applicationStarted = hasApplicationStarted(meeting, application, now);
        if (applicationStarted && hasApplicationRestrictedChanges(request)) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }

        User influencer = request.influencerId() == null
                ? meeting.getInfluencer() : resolveInfluencer(meeting, actor, request.influencerId());
        String title = request.title() == null ? meeting.getTitle() : request.title().trim();
        String description = request.description() == null
                ? meeting.getDescription() : trimToNull(request.description());
        String coverImageUrl = request.coverImageUrl() == null
                ? meeting.getCoverImageUrl() : trimToNull(request.coverImageUrl());
        LocalDateTime scheduledStartAt = request.scheduledStartAt() == null
                ? meeting.getScheduledStartAt() : request.scheduledStartAt();

        ApplicationValues applicationValues = mergeApplication(application, request.application());
        OperationValues operationValues = mergeOperation(operation, request.operation());
        validateSchedule(scheduledStartAt, applicationValues, operationValues);
        if (!applicationStarted) {
            meeting.update(influencer, title, description, coverImageUrl, scheduledStartAt);
            application.update(applicationValues.enabled(), applicationValues.startAt(),
                    applicationValues.endAt(), applicationValues.resultAnnouncementAt(),
                    applicationValues.capacity());
        }
        operation.update(operationValues.queueOpenAt(), operationValues.callDurationSec(),
                operationValues.recordingEnabled(), operationValues.translationEnabled(),
                operationValues.reconnectGraceSec(), operationValues.earlyStartMinutes(),
                operationValues.maxRecallCount());
        fanMeetingRepository.flush();
        return FanMeetingManagementResponse.of(meeting, application, operation);
    }

    /** 테스트용 상태와 주요 일정을 강제로 변경한다. */
    @Transactional
    public FanMeetingManagementResponse controlForTest(
            Long meetingId, AuthenticatedUser principal, FanMeetingTestControlRequest request
    ) {
        User actor = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        requireManagerOrSolo(meeting, actor);
        MeetingApplicationSetting application = requireApplicationSetting(meetingId);
        MeetingOperationSetting operation = requireOperationSetting(meetingId);
        meeting.forceControl(request.status(), request.scheduledStartAt());
        controlApplication(application, request);
        controlOperation(operation, request);
        fanMeetingRepository.flush();
        return FanMeetingManagementResponse.of(meeting, application, operation);
    }

    /** 테스트 요청의 응모 일정을 기존 값과 병합해 반영한다. */
    private void controlApplication(
            MeetingApplicationSetting setting, FanMeetingTestControlRequest request
    ) {
        setting.update(setting.isEnabled(),
                request.applicationOpenAt() == null ? setting.getApplicationOpenAt() : request.applicationOpenAt(),
                request.applicationCloseAt() == null ? setting.getApplicationCloseAt() : request.applicationCloseAt(),
                request.resultAnnouncementAt() == null
                        ? setting.getResultAnnouncementAt() : request.resultAnnouncementAt(),
                setting.getCapacity());
    }

    /** 테스트 요청의 대기실 오픈 시각을 기존 운영 설정에 반영한다. */
    private void controlOperation(
            MeetingOperationSetting setting, FanMeetingTestControlRequest request
    ) {
        setting.update(request.waitingRoomOpenAt() == null
                        ? setting.getWaitingRoomOpenAt() : request.waitingRoomOpenAt(),
                setting.getCallDurationSec(), setting.isRecordingEnabled(),
                setting.isTranslationEnabled(), setting.getReconnectGraceSec(),
                setting.getEarlyStartMinutes(), setting.getMaxRecallCount());
    }

    /** 초안 팬미팅을 공개한다. */
    @Transactional
    public FanMeetingManagementResponse publish(Long meetingId, AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        requireManagerOrSolo(meeting, actor);
        if (meeting.getStatus() != FanMeetingStatus.DRAFT) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
        meeting.publish(LocalDateTime.now(clock));
        return response(meeting);
    }

    /** 공개 전 초안 팬미팅을 논리 삭제한다. */
    @Transactional
    public FanMeetingManagementResponse deleteDraft(Long meetingId, AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        requireManagerOrSolo(meeting, actor);
        try {
            meeting.deleteDraft(LocalDateTime.now(clock));
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
        return response(meeting);
    }

    /** 공개 후 진행 전 팬미팅을 취소하고 응모자 알림을 생성한다. */
    @Transactional
    public FanMeetingManagementResponse cancel(Long meetingId, AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        requireManagerOrSolo(meeting, actor);
        try {
            meeting.cancel(LocalDateTime.now(clock));
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
        List<Notification> notifications = applicationRepository
                .findAllByMeeting_IdAndStatusNot(meetingId, ApplicationStatus.WITHDRAWN)
                .stream()
                .map(Application::getFan)
                .map(fan -> Notification.create(fan, meeting, NotificationType.MEETING_CANCELED,
                        "팬미팅 취소 안내", meeting.getTitle() + " 팬미팅이 취소되었습니다."))
                .toList();
        notificationRepository.saveAll(notifications);
        return response(meeting);
    }

    /** 설정된 조기 시작 허용 시각부터 준비 완료 팬미팅을 시작한다. */
    @Transactional
    public FanMeetingManagementResponse start(Long meetingId, AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        requireMeetingOperator(meeting, actor);
        MeetingOperationSetting operation = requireOperationSetting(meetingId);
        LocalDateTime now = LocalDateTime.now(clock);
        if (meeting.getStatus() != FanMeetingStatus.READY
                || now.isBefore(meeting.getScheduledStartAt()
                .minusMinutes(operation.getEarlyStartMinutes()))
                || participantRepository.countByMeeting_Id(meetingId) == 0) {
            throw new BusinessException(ErrorCode.FAN_MEETING_START_NOT_ALLOWED);
        }
        meeting.start(now);
        return response(meeting);
    }

    /** 진행 중인 팬미팅과 개별 영상통화·대기열·LiveKit Room·Redis 상태를 종료한다. */
    @Transactional
    public FanMeetingManagementResponse end(Long meetingId, AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireMeetingForUpdate(meetingId);
        requireMeetingOperator(meeting, actor);
        if (meeting.getStatus() == FanMeetingStatus.ENDED) {
            return response(meeting);
        }
        if (meeting.getStatus() != FanMeetingStatus.LIVE) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }

        LocalDateTime endedAt = LocalDateTime.now(clock);
        List<CallSession> sessions = callSessionRepository
                .findByQueueEntry_Meeting_IdAndStatusIn(meetingId,
                        List.of(CallSessionStatus.CONNECTING, CallSessionStatus.ACTIVE));
        for (CallSession session : sessions) {
            QueueEntry queueEntry = session.getQueueEntry();
            if (session.getStatus() == CallSessionStatus.ACTIVE) {
                session.end(endedAt, CallEndReason.FORCED, actor);
                queueEntry.complete();
            } else {
                session.failConnecting(endedAt);
                queueEntry.remove();
            }
            realtimeStore.clearFanConnected(session.getId());
            realtimeStore.clearDisconnectRole(session.getId());
        }
        for (QueueEntry entry : queueEntryRepository.findAllByMeetingIdForUpdate(meetingId)) {
            entry.remove();
        }

        String roomId = LiveKitRoomNames.forMeeting(meetingId);
        roomParticipantService.deleteRoom(roomId);
        realtimeStore.clearMeeting(meetingId, roomId);
        meeting.end(endedAt);
        return response(meeting);
    }

    /** 팬미팅과 두 운영 설정을 관리 응답으로 변환한다. */
    private FanMeetingManagementResponse response(FanMeeting meeting) {
        return FanMeetingManagementResponse.of(meeting,
                requireApplicationSetting(meeting.getId()),
                requireOperationSetting(meeting.getId()));
    }

    /** 팬미팅을 쓰기 잠금으로 조회한다. */
    private FanMeeting requireMeetingForUpdate(Long meetingId) {
        FanMeeting meeting = fanMeetingRepository.findByIdForUpdate(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }
        return meeting;
    }

    /** 팬미팅 응모 설정을 조회한다. */
    private MeetingApplicationSetting requireApplicationSetting(Long meetingId) {
        return applicationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.APPLICATION_SETTING_NOT_FOUND));
    }

    /** 팬미팅 운영 설정을 조회한다. */
    private MeetingOperationSetting requireOperationSetting(Long meetingId) {
        return operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
    }

    /** 수정·게시·삭제·취소 요청자가 담당 매니저 또는 1인 인플루언서인지 검증한다. */
    private void requireManagerOrSolo(FanMeeting meeting, User actor) {
        boolean manager = sameUser(meeting.getManager(), actor) && actor.getRole() == UserRole.MANAGER;
        boolean solo = meeting.getManager() == null && sameUser(meeting.getInfluencer(), actor)
                && actor.getRole() == UserRole.SOLO_INFLUENCER;
        if (!manager && !solo) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
    }

    /** 시작·종료 요청자가 담당 매니저 또는 실제 진행 인플루언서인지 검증한다. */
    private void requireMeetingOperator(FanMeeting meeting, User actor) {
        if (!sameUser(meeting.getManager(), actor) && !sameUser(meeting.getInfluencer(), actor)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
    }

    /** 수정 요청의 인플루언서 변경 권한과 조직 소속을 검증한다. */
    private User resolveInfluencer(FanMeeting meeting, User actor, Long influencerId) {
        if (actor.getRole() == UserRole.SOLO_INFLUENCER) {
            if (!actor.getId().equals(influencerId)) {
                throw new BusinessException(ErrorCode.ACCESS_DENIED);
            }
            return actor;
        }
        User influencer = userRepository.findById(influencerId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .filter(user -> user.getRole() == UserRole.INFLUENCER)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED));
        if (meeting.getOrganization() == null || !organizationMemberRepository
                .existsByOrganizationIdAndUserIdAndMemberTypeAndStatus(
                        meeting.getOrganization().getId(), influencerId,
                        OrganizationMemberType.INFLUENCER, OrganizationMemberStatus.ACTIVE)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return influencer;
    }

    /** 기존 응모 설정과 부분 수정 값을 합친다. */
    private ApplicationValues mergeApplication(MeetingApplicationSetting current,
                                                FanMeetingUpdateRequest.ApplicationSettingPatch patch) {
        if (patch == null) {
            return new ApplicationValues(current.isEnabled(), current.getApplicationOpenAt(),
                    current.getApplicationCloseAt(), current.getResultAnnouncementAt(),
                    current.getCapacity());
        }
        return new ApplicationValues(
                patch.enabled() == null ? current.isEnabled() : patch.enabled(),
                patch.startAt() == null ? current.getApplicationOpenAt() : patch.startAt(),
                patch.endAt() == null ? current.getApplicationCloseAt() : patch.endAt(),
                patch.resultAnnouncementAt() == null
                        ? current.getResultAnnouncementAt() : patch.resultAnnouncementAt(),
                patch.capacity() == null ? current.getCapacity() : patch.capacity()
        );
    }

    /** 기존 운영 설정과 부분 수정 값을 합친다. */
    private OperationValues mergeOperation(MeetingOperationSetting current,
                                            FanMeetingUpdateRequest.OperationSettingPatch patch) {
        if (patch == null) {
            return new OperationValues(current.getWaitingRoomOpenAt(), current.getCallDurationSec(),
                    current.isRecordingEnabled(), current.isTranslationEnabled(),
                    current.getReconnectGraceSec(), current.getEarlyStartMinutes(),
                    current.getMaxRecallCount());
        }
        return new OperationValues(
                patch.queueOpenAt() == null ? current.getWaitingRoomOpenAt() : patch.queueOpenAt(),
                patch.callDurationSec() == null ? current.getCallDurationSec() : patch.callDurationSec(),
                patch.recordingEnabled() == null
                        ? current.isRecordingEnabled() : patch.recordingEnabled(),
                patch.translationEnabled() == null
                        ? current.isTranslationEnabled() : patch.translationEnabled(),
                patch.reconnectGraceSec() == null
                        ? current.getReconnectGraceSec() : patch.reconnectGraceSec(),
                patch.earlyStartMinutes() == null
                        ? current.getEarlyStartMinutes() : patch.earlyStartMinutes(),
                patch.maxRecallCount() == null
                        ? current.getMaxRecallCount() : patch.maxRecallCount()
        );
    }

    /** 변경 결과의 응모·대기실·팬미팅 일정 순서를 검증한다. */
    private void validateSchedule(LocalDateTime scheduledStartAt, ApplicationValues application,
                                  OperationValues operation) {
        if (scheduledStartAt == null || operation.queueOpenAt() == null
                || !operation.queueOpenAt().isBefore(scheduledStartAt)
                || operation.reconnectGraceSec() < 0
                || operation.earlyStartMinutes() < 0
                || operation.maxRecallCount() < 0) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        if (application.enabled()) {
            if (application.startAt() == null || application.endAt() == null
                    || application.capacity() <= 0
                    || !application.startAt().isBefore(application.endAt())
                    || !application.endAt().isBefore(scheduledStartAt)
                    || application.resultAnnouncementAt() != null
                    && (application.resultAnnouncementAt().isBefore(application.endAt())
                    || !application.resultAnnouncementAt().isBefore(scheduledStartAt))) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST);
            }
        } else if (application.startAt() != null || application.endAt() != null
                || application.resultAnnouncementAt() != null || application.capacity() != 0) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    /** 두 사용자의 영속 식별자가 같은지 확인한다. */
    private boolean sameUser(User left, User right) {
        return left != null && left.getId().equals(right.getId());
    }

    /** 빈 문자열을 null로 정규화한다. */
    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    /** 응모 상태 또는 응모 시작 시각을 기준으로 기본 정보 수정 제한 시점을 판단한다. */
    private boolean hasApplicationStarted(
            FanMeeting meeting, MeetingApplicationSetting application, LocalDateTime now
    ) {
        return (meeting.getStatus() != FanMeetingStatus.DRAFT
                && meeting.getStatus() != FanMeetingStatus.PUBLISHED)
                || (application.isEnabled()
                && application.getApplicationOpenAt() != null
                && !now.isBefore(application.getApplicationOpenAt()));
    }

    /** 응모 시작 이후 변경할 수 없는 기본 정보·응모·기존 운영 설정 요청인지 확인한다. */
    private boolean hasApplicationRestrictedChanges(FanMeetingUpdateRequest request) {
        if (request.influencerId() != null || request.title() != null
                || request.description() != null || request.coverImageUrl() != null
                || request.scheduledStartAt() != null || request.application() != null) {
            return true;
        }
        FanMeetingUpdateRequest.OperationSettingPatch operation = request.operation();
        return operation != null && (operation.queueOpenAt() != null
                || operation.callDurationSec() != null
                || operation.recordingEnabled() != null
                || operation.translationEnabled() != null);
    }

    /** 검증에 사용할 응모 설정의 병합 결과다. */
    private record ApplicationValues(boolean enabled, LocalDateTime startAt,
                                     LocalDateTime endAt, LocalDateTime resultAnnouncementAt,
                                     int capacity) {
    }

    /** 검증에 사용할 운영 설정의 병합 결과다. */
    private record OperationValues(LocalDateTime queueOpenAt, int callDurationSec,
                                   boolean recordingEnabled, boolean translationEnabled,
                                   int reconnectGraceSec, int earlyStartMinutes,
                                   int maxRecallCount) {
    }
}

package com.ssafy.backend.meeting.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.domain.ParticipantSelectionType;
import com.ssafy.backend.meeting.dto.FanMeetingCreateRequest;
import com.ssafy.backend.meeting.dto.FanMeetingCreateResponse;
import com.ssafy.backend.meeting.exception.FanMeetingAccessDeniedException;
import com.ssafy.backend.meeting.exception.InvalidFanMeetingRequestException;
import com.ssafy.backend.meeting.exception.MeetingUserNotFoundException;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.organization.domain.Organization;
import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class FanMeetingService {
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final MeetingOperationSettingRepository operationSettingRepository;
    private final UserRepository userRepository;
    private final OrganizationMemberRepository organizationMemberRepository;

    /**
     * 팬미팅 생성에 필요한 저장소를 구성한다.
     *
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param operationSettingRepository 운영 설정 저장소
     * @param userRepository 사용자 저장소
     * @param organizationMemberRepository 조직 구성원 저장소
     */
    public FanMeetingService(
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            MeetingOperationSettingRepository operationSettingRepository,
            UserRepository userRepository,
            OrganizationMemberRepository organizationMemberRepository
    ) {
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.operationSettingRepository = operationSettingRepository;
        this.userRepository = userRepository;
        this.organizationMemberRepository = organizationMemberRepository;
    }

    /**
     * 인증 사용자의 권한과 일정을 검증하고 운영 정책을 포함한 팬미팅 초안을 생성한다.
     *
     * @param authenticatedUser 인증 사용자 정보
     * @param request 팬미팅 생성 요청
     * @return 생성된 팬미팅과 응모·운영 설정
     * @throws FanMeetingAccessDeniedException 생성 권한이나 인플루언서 지정 권한이 없는 경우
     * @throws InvalidFanMeetingRequestException 일정 또는 운영 정책이 유효하지 않은 경우
     */
    @Transactional
    public FanMeetingCreateResponse create(
            AuthenticatedUser authenticatedUser,
            FanMeetingCreateRequest request
    ) {
        if (authenticatedUser == null) {
            throw new FanMeetingAccessDeniedException();
        }

        User creator = findActiveUser(authenticatedUser.userId());
        CreationContext context = resolveCreationContext(creator, request.influencerId());
        validateParticipantSelection(request);
        validateSchedule(request);

        FanMeeting meeting = FanMeeting.create(
                context.organization(),
                context.manager(),
                context.influencer(),
                request.title().trim(),
                trimToNull(request.description()),
                trimToNull(request.coverImageUrl()),
                request.scheduledStartAt(),
                request.resolvedParticipantSelectionType()
        );
        fanMeetingRepository.save(meeting);

        FanMeetingCreateRequest.ApplicationSettingRequest applicationRequest = request.application();
        MeetingApplicationSetting application = MeetingApplicationSetting.create(
                meeting,
                applicationRequest.enabled(),
                applicationRequest.startAt(),
                applicationRequest.endAt(),
                applicationRequest.resultAnnouncementAt(),
                applicationRequest.capacity()
        );
        applicationSettingRepository.save(application);

        FanMeetingCreateRequest.OperationSettingRequest operationRequest = request.operation();
        MeetingOperationSetting operation = MeetingOperationSetting.create(
                meeting,
                operationRequest.queueOpenAt(),
                operationRequest.callDurationSec(),
                operationRequest.recordingEnabled(),
                operationRequest.translationEnabled(),
                defaultValue(operationRequest.reconnectGraceSec(),
                        MeetingOperationSetting.DEFAULT_RECONNECT_GRACE_SEC),
                defaultValue(operationRequest.earlyStartMinutes(),
                        MeetingOperationSetting.DEFAULT_EARLY_START_MINUTES),
                defaultValue(operationRequest.maxRecallCount(),
                        MeetingOperationSetting.DEFAULT_MAX_RECALL_COUNT)
        );
        operationSettingRepository.save(operation);

        return FanMeetingCreateResponse.of(meeting, application, operation);
    }

    /**
     * 활성 사용자를 조회한다.
     *
     * @param userId 사용자 식별자
     * @return 활성 사용자
     * @throws MeetingUserNotFoundException 사용자가 없거나 비활성 상태인 경우
     */
    private User findActiveUser(Long userId) {
        return userRepository.findById(userId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(MeetingUserNotFoundException::new);
    }

    /**
     * 생성자의 역할에 맞는 조직·매니저·인플루언서 컨텍스트를 결정한다.
     *
     * @param creator 생성자
     * @param influencerId 팬미팅 인플루언서 식별자
     * @return 팬미팅 생성 컨텍스트
     * @throws FanMeetingAccessDeniedException 역할 또는 지정 권한이 유효하지 않은 경우
     */
    private CreationContext resolveCreationContext(User creator, Long influencerId) {
        if (creator.getRole() == UserRole.MANAGER) {
            return resolveManagerContext(creator, influencerId);
        }
        if (creator.getRole() == UserRole.SOLO_INFLUENCER) {
            if (!creator.getId().equals(influencerId)) {
                throw new FanMeetingAccessDeniedException();
            }
            return new CreationContext(null, null, creator);
        }
        throw new FanMeetingAccessDeniedException();
    }

    /**
     * 매니저와 같은 조직에 소속된 인플루언서의 생성 컨텍스트를 결정한다.
     *
     * @param manager 팬미팅을 생성하는 매니저
     * @param influencerId 지정할 인플루언서 식별자
     * @return 조직이 포함된 팬미팅 생성 컨텍스트
     * @throws FanMeetingAccessDeniedException 같은 조직의 활성 인플루언서가 아닌 경우
     */
    private CreationContext resolveManagerContext(User manager, Long influencerId) {
        User influencer = findActiveUser(influencerId);
        if (influencer.getRole() != UserRole.INFLUENCER) {
            throw new FanMeetingAccessDeniedException();
        }

        List<OrganizationMember> managerMemberships =
                organizationMemberRepository.findAllByUserIdAndMemberTypeAndStatus(
                        manager.getId(),
                        OrganizationMemberType.MANAGER,
                        OrganizationMemberStatus.ACTIVE
                );

        Organization organization = managerMemberships.stream()
                .map(OrganizationMember::getOrganization)
                .filter(candidate -> organizationMemberRepository
                        .existsByOrganizationIdAndUserIdAndMemberTypeAndStatus(
                                candidate.getId(),
                                influencer.getId(),
                                OrganizationMemberType.INFLUENCER,
                                OrganizationMemberStatus.ACTIVE
                        ))
                .findFirst()
                .orElseThrow(FanMeetingAccessDeniedException::new);

        return new CreationContext(organization, manager, influencer);
    }

    /**
     * 참가자 선별 방식과 응모 사용 여부가 서로 맞는지 검증한다.
     *
     * <p>응모 방식은 응모를 반드시 사용하고, 외부 선별 방식은 응모를 사용하지 않는다.
     * 두 방식을 섞어서 운영할 수 없으므로 생성 시점에 조합을 확정한다.
     *
     * @param request 팬미팅 생성 요청
     * @throws InvalidFanMeetingRequestException 선별 방식과 응모 사용 여부가 맞지 않는 경우
     */
    private void validateParticipantSelection(FanMeetingCreateRequest request) {
        ParticipantSelectionType selectionType = request.resolvedParticipantSelectionType();
        boolean applicationEnabled = request.application().enabled();
        if (selectionType == ParticipantSelectionType.APPLICATION && !applicationEnabled) {
            throw new InvalidFanMeetingRequestException(
                    "Application based meetings require enabled applications."
            );
        }
        if (selectionType == ParticipantSelectionType.EXTERNAL_SELECTION && applicationEnabled) {
            throw new InvalidFanMeetingRequestException(
                    "External selection meetings must disable applications."
            );
        }
    }

    /**
     * 응모·대기실·팬미팅 일정과 운영 정책 값의 유효성을 검증한다.
     *
     * @param request 팬미팅 생성 요청
     * @throws InvalidFanMeetingRequestException 일정 순서나 운영 정책 값이 유효하지 않은 경우
     */
    private void validateSchedule(FanMeetingCreateRequest request) {
        LocalDateTime scheduledStartAt = request.scheduledStartAt();
        FanMeetingCreateRequest.ApplicationSettingRequest application = request.application();

        if (application.enabled()) {
            if (application.startAt() == null || application.endAt() == null
                    || application.capacity() <= 0) {
                throw new InvalidFanMeetingRequestException(
                        "Enabled applications require startAt, endAt, and a positive capacity."
                );
            }
            if (!application.startAt().isBefore(application.endAt())
                    || !application.endAt().isBefore(scheduledStartAt)) {
                throw new InvalidFanMeetingRequestException(
                        "Application dates must be ordered before the fan meeting starts."
                );
            }
            if (application.resultAnnouncementAt() != null
                    && (application.resultAnnouncementAt().isBefore(application.endAt())
                    || !application.resultAnnouncementAt().isBefore(scheduledStartAt))) {
                throw new InvalidFanMeetingRequestException(
                        "The result announcement must be between application close and meeting start."
                );
            }
        } else if (request.resolvedParticipantSelectionType()
                == ParticipantSelectionType.EXTERNAL_SELECTION) {
            // 외부 선별은 응모 일정을 쓰지 않지만 capacity는 등록 가능한 최대 인원으로 사용한다.
            if (application.startAt() != null
                    || application.endAt() != null
                    || application.resultAnnouncementAt() != null) {
                throw new InvalidFanMeetingRequestException(
                        "External selection meetings must not include application dates."
                );
            }
            if (application.capacity() <= 0) {
                throw new InvalidFanMeetingRequestException(
                        "External selection meetings require a positive capacity."
                );
            }
        } else if (application.startAt() != null
                || application.endAt() != null
                || application.resultAnnouncementAt() != null
                || application.capacity() != 0) {
            throw new InvalidFanMeetingRequestException(
                    "Disabled applications must not include dates or capacity."
            );
        }

        if (!request.operation().queueOpenAt().isBefore(scheduledStartAt)) {
            throw new InvalidFanMeetingRequestException(
                    "The waiting room must open before the fan meeting starts."
            );
        }
        if (defaultValue(request.operation().reconnectGraceSec(),
                MeetingOperationSetting.DEFAULT_RECONNECT_GRACE_SEC) < 0
                || defaultValue(request.operation().earlyStartMinutes(),
                MeetingOperationSetting.DEFAULT_EARLY_START_MINUTES) < 0
                || defaultValue(request.operation().maxRecallCount(),
                MeetingOperationSetting.DEFAULT_MAX_RECALL_COUNT) < 0) {
            throw new InvalidFanMeetingRequestException(
                    "Operation policy values must not be negative."
            );
        }
    }

    /**
     * nullable 생성 요청 값을 지정한 서버 기본값으로 보완한다.
     *
     * @param value 요청 값
     * @param defaultValue 요청 값이 없을 때 사용할 기본값
     * @return 요청 값 또는 서버 기본값
     */
    private int defaultValue(Integer value, int defaultValue) {
        return value == null ? defaultValue : value;
    }

    /**
     * 문자열 양끝 공백을 제거하고 빈 문자열을 null로 정규화한다.
     *
     * @param value 정규화할 문자열
     * @return 정규화된 문자열
     */
    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private record CreationContext(
            Organization organization,
            User manager,
            User influencer
    ) {
    }
}

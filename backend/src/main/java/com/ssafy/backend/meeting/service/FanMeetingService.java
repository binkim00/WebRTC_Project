package com.ssafy.backend.meeting.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
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
        validateSchedule(request);

        FanMeeting meeting = FanMeeting.create(
                context.organization(),
                context.manager(),
                context.influencer(),
                request.title().trim(),
                trimToNull(request.description()),
                trimToNull(request.coverImageUrl()),
                request.scheduledStartAt()
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
                operationRequest.translationEnabled()
        );
        operationSettingRepository.save(operation);

        return FanMeetingCreateResponse.of(meeting, application, operation);
    }

    private User findActiveUser(Long userId) {
        return userRepository.findById(userId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(MeetingUserNotFoundException::new);
    }

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
    }

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

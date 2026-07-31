package com.ssafy.backend.meeting.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.dto.FanMeetingCreateRequest;
import com.ssafy.backend.meeting.dto.FanMeetingCreateResponse;
import com.ssafy.backend.meeting.exception.FanMeetingAccessDeniedException;
import com.ssafy.backend.meeting.exception.InvalidFanMeetingRequestException;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class FanMeetingServiceTest {
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private MeetingOperationSettingRepository operationSettingRepository;
    private UserRepository userRepository;
    private OrganizationMemberRepository organizationMemberRepository;
    private FanMeetingService fanMeetingService;

    @BeforeEach
    void setUp() {
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        operationSettingRepository = mock(MeetingOperationSettingRepository.class);
        userRepository = mock(UserRepository.class);
        organizationMemberRepository = mock(OrganizationMemberRepository.class);
        fanMeetingService = new FanMeetingService(
                fanMeetingRepository,
                applicationSettingRepository,
                operationSettingRepository,
                userRepository,
                organizationMemberRepository
        );
        when(fanMeetingRepository.save(any(FanMeeting.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void managerCreatesDraftMeetingForInfluencerInSameOrganization() {
        User manager = user(10L, UserRole.MANAGER);
        User influencer = user(20L, UserRole.INFLUENCER);
        Organization organization = mock(Organization.class);
        OrganizationMember membership = mock(OrganizationMember.class);

        when(organization.getId()).thenReturn(100L);
        when(membership.getOrganization()).thenReturn(organization);
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(userRepository.findById(20L)).thenReturn(Optional.of(influencer));
        when(organizationMemberRepository.findAllByUserIdAndMemberTypeAndStatus(
                10L, OrganizationMemberType.MANAGER, OrganizationMemberStatus.ACTIVE
        )).thenReturn(List.of(membership));
        when(organizationMemberRepository.existsByOrganizationIdAndUserIdAndMemberTypeAndStatus(
                100L, 20L, OrganizationMemberType.INFLUENCER, OrganizationMemberStatus.ACTIVE
        )).thenReturn(true);

        FanMeetingCreateResponse response = fanMeetingService.create(
                new AuthenticatedUser(10L, UserRole.MANAGER),
                validRequest(20L)
        );

        assertThat(response.status()).isEqualTo(FanMeetingStatus.DRAFT);
        assertThat(response.organizationId()).isEqualTo(100L);
        assertThat(response.managerId()).isEqualTo(10L);
        assertThat(response.influencerId()).isEqualTo(20L);
        assertThat(response.application().enabled()).isTrue();
        assertThat(response.operation().translationEnabled()).isTrue();

        ArgumentCaptor<MeetingApplicationSetting> applicationCaptor =
                ArgumentCaptor.forClass(MeetingApplicationSetting.class);
        verify(applicationSettingRepository).save(applicationCaptor.capture());
        assertThat(applicationCaptor.getValue().getCapacity()).isEqualTo(20);

        ArgumentCaptor<MeetingOperationSetting> operationCaptor =
                ArgumentCaptor.forClass(MeetingOperationSetting.class);
        verify(operationSettingRepository).save(operationCaptor.capture());
        assertThat(operationCaptor.getValue().getCallDurationSec()).isEqualTo(120);
        assertThat(operationCaptor.getValue().isTranslationEnabled()).isTrue();
    }

    @Test
    void soloInfluencerCreatesMeetingForSelfWithoutOrganizationOrManager() {
        User solo = user(30L, UserRole.SOLO_INFLUENCER);
        when(userRepository.findById(30L)).thenReturn(Optional.of(solo));

        FanMeetingCreateResponse response = fanMeetingService.create(
                new AuthenticatedUser(30L, UserRole.SOLO_INFLUENCER),
                validRequest(30L)
        );

        assertThat(response.status()).isEqualTo(FanMeetingStatus.DRAFT);
        assertThat(response.organizationId()).isNull();
        assertThat(response.managerId()).isNull();
        assertThat(response.influencerId()).isEqualTo(30L);
        verifyNoInteractions(organizationMemberRepository);
    }

    @Test
    void rejectsFanRoleBeforeSavingMeeting() {
        User fan = user(40L, UserRole.FAN);
        when(userRepository.findById(40L)).thenReturn(Optional.of(fan));

        assertThatThrownBy(() -> fanMeetingService.create(
                new AuthenticatedUser(40L, UserRole.FAN),
                validRequest(40L)
        )).isInstanceOf(FanMeetingAccessDeniedException.class);

        verify(fanMeetingRepository, never()).save(any());
    }

    @Test
    void rejectsManagerWhenInfluencerIsOutsideManagersOrganizations() {
        User manager = user(10L, UserRole.MANAGER);
        User influencer = user(20L, UserRole.INFLUENCER);
        Organization organization = mock(Organization.class);
        OrganizationMember membership = mock(OrganizationMember.class);

        when(organization.getId()).thenReturn(100L);
        when(membership.getOrganization()).thenReturn(organization);
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(userRepository.findById(20L)).thenReturn(Optional.of(influencer));
        when(organizationMemberRepository.findAllByUserIdAndMemberTypeAndStatus(
                10L, OrganizationMemberType.MANAGER, OrganizationMemberStatus.ACTIVE
        )).thenReturn(List.of(membership));

        assertThatThrownBy(() -> fanMeetingService.create(
                new AuthenticatedUser(10L, UserRole.MANAGER),
                validRequest(20L)
        )).isInstanceOf(FanMeetingAccessDeniedException.class);

        verify(fanMeetingRepository, never()).save(any());
    }

    @Test
    void rejectsInvalidApplicationScheduleBeforeSaving() {
        User solo = user(30L, UserRole.SOLO_INFLUENCER);
        when(userRepository.findById(30L)).thenReturn(Optional.of(solo));
        LocalDateTime meetingStart = LocalDateTime.of(2030, 8, 10, 15, 0);
        FanMeetingCreateRequest invalid = new FanMeetingCreateRequest(
                30L,
                "Fan meeting",
                null,
                null,
                meetingStart,
                new FanMeetingCreateRequest.ApplicationSettingRequest(
                        true,
                        meetingStart.minusDays(1),
                        meetingStart.plusHours(1),
                        null,
                        20
                ),
                new FanMeetingCreateRequest.OperationSettingRequest(
                        meetingStart.minusMinutes(30),
                        120,
                        true,
                        true
                )
        );

        assertThatThrownBy(() -> fanMeetingService.create(
                new AuthenticatedUser(30L, UserRole.SOLO_INFLUENCER),
                invalid
        )).isInstanceOf(InvalidFanMeetingRequestException.class);

        verify(fanMeetingRepository, never()).save(any());
    }

    private User user(Long id, UserRole role) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        when(user.getRole()).thenReturn(role);
        when(user.getStatus()).thenReturn(UserStatus.ACTIVE);
        return user;
    }

    private FanMeetingCreateRequest validRequest(Long influencerId) {
        LocalDateTime meetingStart = LocalDateTime.of(2030, 8, 10, 15, 0);
        return new FanMeetingCreateRequest(
                influencerId,
                " Fan meeting ",
                " Description ",
                " https://example.com/cover.png ",
                meetingStart,
                new FanMeetingCreateRequest.ApplicationSettingRequest(
                        true,
                        meetingStart.minusDays(10),
                        meetingStart.minusDays(5),
                        meetingStart.minusDays(4),
                        20
                ),
                new FanMeetingCreateRequest.OperationSettingRequest(
                        meetingStart.minusMinutes(30),
                        120,
                        true,
                        true
                )
        );
    }
}

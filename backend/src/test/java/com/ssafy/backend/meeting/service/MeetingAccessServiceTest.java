package com.ssafy.backend.meeting.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MeetingAccessServiceTest {

    /** 팬미팅에 직접 배정된 매니저가 상태 변경 권한을 얻는지 검증한다. */
    @Test
    void allowsAssignedManager() {
        FanMeetingRepository meetingRepository = mock(FanMeetingRepository.class);
        OrganizationMemberRepository memberRepository = mock(OrganizationMemberRepository.class);
        MeetingAccessService service = new MeetingAccessService(meetingRepository, memberRepository);
        User manager = mock(User.class);
        FanMeeting meeting = mock(FanMeeting.class);
        when(manager.getRole()).thenReturn(UserRole.MANAGER);
        when(manager.getId()).thenReturn(10L);
        when(meeting.getManager()).thenReturn(manager);
        when(meetingRepository.findById(1L)).thenReturn(Optional.of(meeting));

        assertThat(service.requireManager(1L, manager)).isSameAs(meeting);
    }

    /** 팬미팅을 주최한 인플루언서 본인이 인플루언서 전용 권한을 얻는지 검증한다. */
    @Test
    void allowsHostInfluencer() {
        FanMeetingRepository meetingRepository = mock(FanMeetingRepository.class);
        OrganizationMemberRepository memberRepository = mock(OrganizationMemberRepository.class);
        MeetingAccessService service = new MeetingAccessService(meetingRepository, memberRepository);
        User influencer = mock(User.class);
        FanMeeting meeting = mock(FanMeeting.class);
        when(influencer.getId()).thenReturn(10L);
        when(meeting.getInfluencer()).thenReturn(influencer);
        when(meetingRepository.findById(1L)).thenReturn(Optional.of(meeting));

        assertThat(service.requireInfluencer(1L, influencer)).isSameAs(meeting);
    }

    /** 다른 인플루언서가 주최한 팬미팅에 대해 인플루언서 전용 권한이 거부되는지 검증한다. */
    @Test
    void rejectsOtherInfluencersMeeting() {
        FanMeetingRepository meetingRepository = mock(FanMeetingRepository.class);
        OrganizationMemberRepository memberRepository = mock(OrganizationMemberRepository.class);
        MeetingAccessService service = new MeetingAccessService(meetingRepository, memberRepository);
        User host = mock(User.class);
        User other = mock(User.class);
        FanMeeting meeting = mock(FanMeeting.class);
        when(host.getId()).thenReturn(10L);
        when(other.getId()).thenReturn(99L);
        when(meeting.getInfluencer()).thenReturn(host);
        when(meetingRepository.findById(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.requireInfluencer(1L, other))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
    }

    /** 팬미팅 인플루언서가 매니저 전용 상태 변경 권한을 얻지 못하는지 검증한다. */
    @Test
    void rejectsInfluencerFromManagerOperation() {
        FanMeetingRepository meetingRepository = mock(FanMeetingRepository.class);
        OrganizationMemberRepository memberRepository = mock(OrganizationMemberRepository.class);
        MeetingAccessService service = new MeetingAccessService(meetingRepository, memberRepository);
        User influencer = mock(User.class);
        FanMeeting meeting = mock(FanMeeting.class);
        when(influencer.getRole()).thenReturn(UserRole.INFLUENCER);
        when(meetingRepository.findById(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.requireManager(1L, influencer))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
    }
}

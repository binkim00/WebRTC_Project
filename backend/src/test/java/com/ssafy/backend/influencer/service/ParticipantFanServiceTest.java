package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.dto.ParticipantFanSummaryResponse;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ParticipantFanServiceTest {

    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final ParticipantRepository participantRepository = mock(ParticipantRepository.class);
    private final ParticipantFanService participantFanService =
            new ParticipantFanService(currentUserService, participantRepository);

    /**
     * 인플루언서가 참가 팬 목록을 조회할 때 자신의 식별자와 종료 상태 조건, 페이지 요청이 그대로
     * 저장소에 전달되고 응답이 공통 페이지 형식으로 감싸지는지 검증한다.
     */
    @Test
    void queriesOwnEndedMeetingsWithPageRequest() {
        User influencer = influencer(10L, UserRole.INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);
        ParticipantFanSummaryResponse summary = new ParticipantFanSummaryResponse(
                100L, "팬하나", "https://cdn.example.com/fan.png", 2L,
                LocalDateTime.of(2026, 7, 1, 19, 0), LocalDateTime.of(2026, 8, 1, 19, 0)
        );
        when(participantRepository.findParticipantFanSummaries(
                eq(10L), eq(FanMeetingStatus.ENDED), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(summary), PageRequest.of(0, 20), 1L));

        PageResponse<ParticipantFanSummaryResponse> response =
                participantFanService.getMyParticipantFans(0, 20, principal);

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(participantRepository).findParticipantFanSummaries(
                eq(10L), eq(FanMeetingStatus.ENDED), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageNumber()).isZero();
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(20);
        assertThat(response.content()).containsExactly(summary);
        assertThat(response.totalElements()).isEqualTo(1L);
    }

    /** 1인 인플루언서도 참가 팬 목록을 조회할 수 있는지 검증한다. */
    @Test
    void allowsSoloInfluencer() {
        User influencer = influencer(11L, UserRole.SOLO_INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(11L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);
        when(participantRepository.findParticipantFanSummaries(
                eq(11L), eq(FanMeetingStatus.ENDED), any(Pageable.class)))
                .thenReturn(Page.empty(PageRequest.of(0, 20)));

        PageResponse<ParticipantFanSummaryResponse> response =
                participantFanService.getMyParticipantFans(0, 20, principal);

        assertThat(response.content()).isEmpty();
    }

    /** 팬 역할이 참가 팬 목록을 조회하면 저장소 조회 전에 접근이 거부되는지 검증한다. */
    @Test
    void rejectsFanRole() {
        User fan = influencer(20L, UserRole.FAN);
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.FAN);
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);

        assertThatThrownBy(() -> participantFanService.getMyParticipantFans(0, 20, principal))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ACCESS_DENIED);

        verifyNoInteractions(participantRepository);
    }

    /**
     * 매니저 역할이 참가 팬 목록을 조회하면 접근이 거부되는지 검증한다. 팬미팅을 함께 운영하더라도
     * 이 API 는 인플루언서 본인의 참가 이력만 노출한다.
     */
    @Test
    void rejectsManagerRole() {
        User manager = influencer(21L, UserRole.MANAGER);
        AuthenticatedUser principal = new AuthenticatedUser(21L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);

        assertThatThrownBy(() -> participantFanService.getMyParticipantFans(0, 20, principal))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ACCESS_DENIED);

        verifyNoInteractions(participantRepository);
    }

    /** 페이지 번호가 음수면 저장소 조회 전에 요청이 거부되는지 검증한다. */
    @Test
    void rejectsNegativePage() {
        User influencer = influencer(12L, UserRole.INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(12L, UserRole.INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);

        assertThatThrownBy(() -> participantFanService.getMyParticipantFans(-1, 20, principal))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_REQUEST);

        verifyNoInteractions(participantRepository);
    }

    /** 페이지 크기가 허용 상한을 넘으면 저장소 조회 전에 요청이 거부되는지 검증한다. */
    @Test
    void rejectsTooLargeSize() {
        User influencer = influencer(13L, UserRole.INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(13L, UserRole.INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);

        assertThatThrownBy(() -> participantFanService.getMyParticipantFans(0, 101, principal))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_REQUEST);

        verifyNoInteractions(participantRepository);
    }

    /**
     * 지정한 식별자와 역할을 가진 사용자를 만든다.
     *
     * @param id 사용자 식별자
     * @param role 사용자 역할
     * @return 식별자가 주입된 활성 사용자
     */
    private User influencer(Long id, UserRole role) {
        User user = User.createActive(
                "login" + id, "user" + id + "@example.com", "encoded-password",
                "닉네임" + id, role, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }
}

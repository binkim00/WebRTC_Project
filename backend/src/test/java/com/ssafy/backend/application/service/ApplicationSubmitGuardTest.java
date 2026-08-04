package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.DeviceDuplicatePolicy;
import com.ssafy.backend.application.dto.ApplicationSubmitRequest;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.DeviceTokenService;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.common.support.RequestRateLimiter;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 다계정 대량 응모를 억제하는 응모 게이트를 검증한다.
 *
 * <p>이메일 인증 강제 여부와 기기 중복 정책은 설정값이라 테스트마다 다른 서비스를 구성한다.
 */
class ApplicationSubmitGuardTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-08-04T03:00:00Z");
    private static final String DEVICE_TOKEN = "device-token";
    private static final String DEVICE_HASH = "device-hash";

    private CurrentUserService currentUserService;
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private ApplicationRepository applicationRepository;
    private ApplicationFormRepository applicationFormRepository;
    private DeviceTokenService deviceTokenService;
    private RequestRateLimiter rateLimiter;
    private AuthenticatedUser principal;
    private User fan;
    private FanMeeting meeting;

    /** 응모 기간 중인 팬미팅과 통과 상태의 요청 제한기를 기본값으로 둔다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        applicationRepository = mock(ApplicationRepository.class);
        applicationFormRepository = mock(ApplicationFormRepository.class);
        deviceTokenService = mock(DeviceTokenService.class);
        rateLimiter = mock(RequestRateLimiter.class);

        principal = new AuthenticatedUser(1L, UserRole.FAN);
        fan = activeFan(1L);
        meeting = openMeeting();
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);
        when(fanMeetingRepository.findById(10L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(10L)).thenReturn(Optional.of(openSetting()));
        when(applicationFormRepository.findByMeeting_Id(10L)).thenReturn(Optional.empty());
        when(applicationRepository.findByMeeting_IdAndFan_Id(10L, 1L)).thenReturn(Optional.empty());
        when(applicationRepository.save(any(Application.class)))
                .thenAnswer(invocation -> {
                    Application saved = invocation.getArgument(0);
                    ReflectionTestUtils.setField(saved, "id", 100L);
                    return saved;
                });
        when(deviceTokenService.hash(DEVICE_TOKEN)).thenReturn(DEVICE_HASH);
        when(rateLimiter.tryConsume(anyString(), anyString(), anyInt(), any(Duration.class)))
                .thenReturn(true);
    }

    /** 인증을 강제한 상태에서 미인증 팬의 응모를 403으로 막는지 검증한다. */
    @Test
    void rejectsUnverifiedFanWhenVerificationRequired() {
        ApplicationService service = service(true, DeviceDuplicatePolicy.FLAG);

        assertThatThrownBy(() -> service.submit(10L, request(), principal, DEVICE_TOKEN))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.EMAIL_VERIFICATION_REQUIRED));

        verify(applicationRepository, never()).save(any(Application.class));
    }

    /** 인증을 마친 팬은 강제 설정에서도 정상 응모되는지 검증한다. */
    @Test
    void acceptsVerifiedFanWhenVerificationRequired() {
        fan.verifyEmail(now().minusDays(1));
        ApplicationService service = service(true, DeviceDuplicatePolicy.FLAG);

        assertThat(service.submit(10L, request(), principal, DEVICE_TOKEN).applicationId())
                .isEqualTo(100L);
    }

    /** 인증 강제를 끄면 미인증 팬도 응모할 수 있는지 검증한다. */
    @Test
    void acceptsUnverifiedFanWhenVerificationDisabled() {
        ApplicationService service = service(false, DeviceDuplicatePolicy.FLAG);

        assertThat(service.submit(10L, request(), principal, DEVICE_TOKEN).applicationId())
                .isEqualTo(100L);
    }

    /** 응모 시점의 기기 해시를 응모에 기록하는지 검증한다. */
    @Test
    void recordsDeviceHashOnSubmit() {
        ApplicationService service = service(false, DeviceDuplicatePolicy.FLAG);

        service.submit(10L, request(), principal, DEVICE_TOKEN);

        verify(applicationRepository).save(
                org.mockito.ArgumentMatchers.argThat(
                        application -> DEVICE_HASH.equals(application.getDeviceHash())));
    }

    /** FLAG 정책에서는 같은 기기의 다른 계정 응모가 있어도 접수를 허용하는지 검증한다. */
    @Test
    void allowsDuplicateDeviceUnderFlagPolicy() {
        when(applicationRepository
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(10L, DEVICE_HASH, 1L))
                .thenReturn(true);
        ApplicationService service = service(false, DeviceDuplicatePolicy.FLAG);

        assertThat(service.submit(10L, request(), principal, DEVICE_TOKEN).applicationId())
                .isEqualTo(100L);
    }

    /** BLOCK 정책에서는 같은 기기의 다른 계정 응모를 409로 거부하는지 검증한다. */
    @Test
    void rejectsDuplicateDeviceUnderBlockPolicy() {
        when(applicationRepository
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(10L, DEVICE_HASH, 1L))
                .thenReturn(true);
        ApplicationService service = service(false, DeviceDuplicatePolicy.BLOCK);

        assertThatThrownBy(() -> service.submit(10L, request(), principal, DEVICE_TOKEN))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DEVICE_DUPLICATE_APPLICATION));

        verify(applicationRepository, never()).save(any(Application.class));
    }

    /** 기기 쿠키가 없는 요청은 중복 조회 없이 통과시키는지 검증한다. */
    @Test
    void skipsDuplicateCheckWithoutDeviceCookie() {
        ApplicationService service = service(false, DeviceDuplicatePolicy.BLOCK);

        assertThat(service.submit(10L, request(), principal, null).applicationId())
                .isEqualTo(100L);

        verify(applicationRepository, never())
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(anyLong(), anyString(), anyLong());
    }

    /** 응모 요청 제한을 넘기면 재시도 시간과 함께 429로 거부하는지 검증한다. */
    @Test
    void rejectsSubmitOverRateLimit() {
        when(rateLimiter.tryConsume(anyString(), anyString(), anyInt(), any(Duration.class)))
                .thenReturn(false);
        when(rateLimiter.retryAfterSeconds(anyString(), anyString())).thenReturn(30L);
        ApplicationService service = service(false, DeviceDuplicatePolicy.FLAG);

        assertThatThrownBy(() -> service.submit(10L, request(), principal, DEVICE_TOKEN))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.TOO_MANY_REQUESTS);
                    assertThat(exception.getRetryAfterSeconds()).isEqualTo(30L);
                });

        verify(applicationRepository, never()).save(any(Application.class));
    }

    /**
     * 지정한 게이트 설정으로 응모 서비스를 구성한다.
     *
     * @param emailVerificationRequired 응모 전 이메일 인증 강제 여부
     * @param policy 같은 기기 중복 응모 처리 정책
     * @return 테스트 대상 응모 서비스
     */
    private ApplicationService service(
            boolean emailVerificationRequired, DeviceDuplicatePolicy policy
    ) {
        return new ApplicationService(
                currentUserService,
                fanMeetingRepository,
                applicationSettingRepository,
                applicationRepository,
                applicationFormRepository,
                mock(ApplicationQuestionRepository.class),
                mock(ApplicationAnswerRepository.class),
                deviceTokenService,
                rateLimiter,
                Clock.fixed(NOW, SEOUL),
                emailVerificationRequired,
                policy,
                5,
                60L
        );
    }

    /** 질문이 없는 팬미팅에 사용할 동의 완료 응모 요청을 만든다. */
    private ApplicationSubmitRequest request() {
        return new ApplicationSubmitRequest(true, List.of());
    }

    /** 테스트에 사용할 활성 팬 사용자를 만든다. */
    private User activeFan(Long id) {
        User result = User.createActive(
                "fan01", "fan@example.com", "encoded", "팬",
                UserRole.FAN, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(result, "id", id);
        return result;
    }

    /** 응모 접수 상태의 테스트 팬미팅을 만든다. */
    private FanMeeting openMeeting() {
        User influencer = User.createActive(
                "influencer01", "influencer@example.com", "encoded", "인플루언서",
                UserRole.INFLUENCER, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(influencer, "id", 2L);
        FanMeeting result = FanMeeting.create(
                null, null, influencer, "테스트 팬미팅", null, null, now().plusDays(10)
        );
        ReflectionTestUtils.setField(result, "id", 10L);
        result.publish(now().minusDays(2));
        result.openApplications();
        return result;
    }

    /** 현재 시각이 응모 기간에 포함되는 응모 설정을 만든다. */
    private MeetingApplicationSetting openSetting() {
        return MeetingApplicationSetting.create(
                meeting, true, now().minusDays(1), now().plusDays(1), now().plusDays(2), 20
        );
    }

    /** 고정 시계가 가리키는 현재 시각을 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.ofInstant(NOW, SEOUL);
    }
}

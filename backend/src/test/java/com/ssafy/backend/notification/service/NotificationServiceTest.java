package com.ssafy.backend.notification.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;
import com.ssafy.backend.notification.dto.NotificationReadResponse;
import com.ssafy.backend.notification.dto.NotificationResponse;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");

    private CurrentUserService currentUserService;
    private NotificationRepository notificationRepository;
    private NotificationService notificationService;
    private AuthenticatedUser principal;
    private User user;

    /** 각 테스트에서 사용할 인증 사용자, 저장소, 고정 시각 기반 알림 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        notificationRepository = mock(NotificationRepository.class);
        notificationService = new NotificationService(
                currentUserService,
                notificationRepository,
                Clock.fixed(NOW, SEOUL)
        );
        principal = new AuthenticatedUser(1L, UserRole.FAN);
        user = user(1L);
        when(currentUserService.requireActiveUser(principal)).thenReturn(user);
    }

    /** 미읽음 전용 조회 시 읽지 않은 알림 저장소 메서드를 사용하고 응답으로 변환하는지 검증한다. */
    @Test
    void returnsUnreadNotificationsOnly() {
        Notification notification = notification(user, 10L);
        when(notificationRepository.findAllByUser_IdAndReadAtIsNull(
                org.mockito.ArgumentMatchers.eq(1L), any(Pageable.class)
        )).thenReturn(new PageImpl<>(List.of(notification)));

        PageResponse<NotificationResponse> response = notificationService.getNotifications(
                true, 0, 20, principal
        );

        assertThat(response.content()).hasSize(1);
        assertThat(response.content().get(0).notificationId()).isEqualTo(10L);
        assertThat(response.content().get(0).type())
                .isEqualTo(NotificationType.APPLICATION_RESULT);
        verify(notificationRepository).findAllByUser_IdAndReadAtIsNull(
                org.mockito.ArgumentMatchers.eq(1L), any(Pageable.class)
        );
        verify(notificationRepository, never()).findAllByUser_Id(
                org.mockito.ArgumentMatchers.eq(1L), any(Pageable.class)
        );
    }

    /** 본인 소유의 미읽음 알림에 현재 시각을 기록해 반환하는지 검증한다. */
    @Test
    void marksOwnedNotificationAsRead() {
        Notification notification = notification(user, 10L);
        when(notificationRepository.findById(10L)).thenReturn(Optional.of(notification));

        NotificationReadResponse response = notificationService.markAsRead(10L, principal);

        assertThat(response.notificationId()).isEqualTo(10L);
        assertThat(response.readAt()).isEqualTo(LocalDateTime.ofInstant(NOW, SEOUL));
    }

    /** 이미 읽은 알림을 다시 처리해도 최초 읽은 시각이 유지되는지 검증한다. */
    @Test
    void preservesFirstReadTime() {
        Notification notification = notification(user, 10L);
        LocalDateTime firstReadAt = LocalDateTime.of(2026, 7, 29, 10, 0);
        notification.markAsRead(firstReadAt);
        when(notificationRepository.findById(10L)).thenReturn(Optional.of(notification));

        NotificationReadResponse response = notificationService.markAsRead(10L, principal);

        assertThat(response.readAt()).isEqualTo(firstReadAt);
    }

    /** 타인 소유 알림을 읽음 처리하려는 요청을 접근 거부하는지 검증한다. */
    @Test
    void rejectsReadingAnotherUsersNotification() {
        Notification notification = notification(user(2L), 10L);
        when(notificationRepository.findById(10L)).thenReturn(Optional.of(notification));

        assertThatThrownBy(() -> notificationService.markAsRead(10L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));
    }

    /** 허용 범위를 벗어난 페이지 크기를 잘못된 요청으로 거부하는지 검증한다. */
    @Test
    void rejectsInvalidPageSize() {
        assertThatThrownBy(() -> notificationService.getNotifications(
                false, 0, 101, principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_REQUEST));

        verify(currentUserService, never()).requireActiveUser(principal);
    }

    /** 지정한 식별자를 반환하는 사용자 테스트 대역을 생성한다. */
    private User user(Long id) {
        User result = mock(User.class);
        when(result.getId()).thenReturn(id);
        return result;
    }

    /** 응답 변환과 읽음 처리에 사용할 테스트 알림을 생성한다. */
    private Notification notification(User recipient, Long id) {
        Notification notification = Notification.create(
                recipient,
                null,
                NotificationType.APPLICATION_RESULT,
                "응모 결과 안내",
                "응모 결과가 발표되었습니다."
        );
        ReflectionTestUtils.setField(notification, "id", id);
        ReflectionTestUtils.setField(
                notification,
                "createdAt",
                LocalDateTime.ofInstant(NOW.minusSeconds(60), SEOUL)
        );
        return notification;
    }
}

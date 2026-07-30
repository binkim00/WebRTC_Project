package com.ssafy.backend.notification.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.dto.NotificationReadResponse;
import com.ssafy.backend.notification.dto.NotificationResponse;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 사용자 알림 조회와 읽음 처리를 담당한다. */
@Service
public class NotificationService {

    private static final int MAX_PAGE_SIZE = 100;

    private final CurrentUserService currentUserService;
    private final NotificationRepository notificationRepository;
    private final Clock clock;

    /**
     * 알림 처리에 필요한 의존성을 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param notificationRepository 알림 저장소
     * @param clock 현재 시각 공급자
     */
    public NotificationService(
            CurrentUserService currentUserService,
            NotificationRepository notificationRepository,
            Clock clock
    ) {
        this.currentUserService = currentUserService;
        this.notificationRepository = notificationRepository;
        this.clock = clock;
    }

    /**
     * 현재 사용자의 알림을 최신순으로 페이지 조회한다.
     *
     * @param unreadOnly 읽지 않은 알림만 조회할지 여부
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 사용자 알림 페이지
     * @throws BusinessException 페이지 값이 유효하지 않은 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<NotificationResponse> getNotifications(
            boolean unreadOnly, int page, int size, AuthenticatedUser principal
    ) {
        validatePage(page, size);
        User user = currentUserService.requireActiveUser(principal);
        PageRequest pageable = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"))
        );
        Page<Notification> notifications = unreadOnly
                ? notificationRepository.findAllByUser_IdAndReadAtIsNull(user.getId(), pageable)
                : notificationRepository.findAllByUser_Id(user.getId(), pageable);
        return PageResponse.from(notifications.map(NotificationResponse::from));
    }

    /**
     * 현재 사용자 소유 알림에 최초 읽은 시각을 기록한다.
     *
     * @param notificationId 읽을 알림 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 알림 읽음 처리 결과
     * @throws BusinessException 알림이 없거나 현재 사용자 소유가 아닌 경우
     */
    @Transactional
    public NotificationReadResponse markAsRead(
            Long notificationId, AuthenticatedUser principal
    ) {
        User user = currentUserService.requireActiveUser(principal);
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND));
        if (!notification.getUser().getId().equals(user.getId())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        notification.markAsRead(LocalDateTime.now(clock));
        return NotificationReadResponse.from(notification);
    }

    /**
     * 페이지 번호와 크기가 허용 범위인지 검증한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @throws BusinessException 페이지 값이 허용 범위를 벗어난 경우
     */
    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}

package com.ssafy.backend.notification.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.notification.dto.NotificationReadResponse;
import com.ssafy.backend.notification.dto.NotificationResponse;
import com.ssafy.backend.notification.service.NotificationService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 로그인 사용자의 알림 조회와 읽음 처리 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    /**
     * 알림 서비스를 주입받는다.
     *
     * @param notificationService 알림 서비스
     */
    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /**
     * 현재 사용자의 알림을 최신순으로 페이지 조회한다.
     *
     * @param unreadOnly 읽지 않은 알림만 조회할지 여부
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 알림 페이지
     */
    @GetMapping
    public ApiResponse<PageResponse<NotificationResponse>> getNotifications(
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                notificationService.getNotifications(unreadOnly, page, size, principal)
        );
    }

    /**
     * 현재 사용자 소유 알림을 읽음 처리한다.
     *
     * @param notificationId 읽을 알림 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 읽음 처리 결과
     */
    @PatchMapping("/{notificationId}/read")
    public ApiResponse<NotificationReadResponse> markAsRead(
            @PathVariable Long notificationId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(notificationService.markAsRead(notificationId, principal));
    }
}

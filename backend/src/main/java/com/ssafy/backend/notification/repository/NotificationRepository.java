package com.ssafy.backend.notification.repository;

import com.ssafy.backend.notification.domain.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 사용자 알림 영속성 처리를 담당한다.
 */
public interface NotificationRepository extends JpaRepository<Notification, Long> {
}

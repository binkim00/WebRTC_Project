package com.ssafy.backend.notification.repository;

import com.ssafy.backend.notification.domain.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 사용자 알림 영속성 처리를 담당한다.
 */
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    /**
     * 사용자의 전체 알림을 페이지 단위로 조회한다.
     *
     * @param userId 알림 수신 사용자 식별자
     * @param pageable 페이지와 정렬 조건
     * @return 사용자의 알림 페이지
     */
    Page<Notification> findAllByUser_Id(Long userId, Pageable pageable);

    /**
     * 사용자의 읽지 않은 알림을 페이지 단위로 조회한다.
     *
     * @param userId 알림 수신 사용자 식별자
     * @param pageable 페이지와 정렬 조건
     * @return 사용자의 읽지 않은 알림 페이지
     */
    Page<Notification> findAllByUser_IdAndReadAtIsNull(Long userId, Pageable pageable);
}

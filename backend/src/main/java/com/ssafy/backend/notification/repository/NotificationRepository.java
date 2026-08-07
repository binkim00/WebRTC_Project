package com.ssafy.backend.notification.repository;

import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;
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

    /**
     * 팬미팅에 특정 유형의 알림이 이미 생성되었는지 확인한다.
     *
     * <p>응모 결과 공개는 별도 상태 컬럼 없이 결과 알림 생성 여부로 중복 실행을 판별한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param type 확인할 알림 유형
     * @return 해당 유형의 알림이 하나라도 있으면 true
     */
    boolean existsByMeeting_IdAndType(Long meetingId, NotificationType type);
}

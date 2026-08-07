package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationForm;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 응모 폼 영속성 처리를 담당한다.
 */
public interface ApplicationFormRepository extends JpaRepository<ApplicationForm, Long> {

    /**
     * 팬미팅 식별자로 응모 폼을 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 팬미팅의 응모 폼
     */
    Optional<ApplicationForm> findByMeeting_Id(Long meetingId);
}

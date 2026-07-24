package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationForm;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 응모 폼 영속성 처리를 담당한다.
 */
public interface ApplicationFormRepository extends JpaRepository<ApplicationForm, Long> {
}

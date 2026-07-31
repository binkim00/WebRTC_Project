package com.ssafy.backend.device.repository;

import com.ssafy.backend.device.domain.DeviceCheck;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 장비 점검 결과 영속성 처리를 담당한다.
 */
public interface DeviceCheckRepository extends JpaRepository<DeviceCheck, Long> {
}

package com.ssafy.backend.recording.repository;

import com.ssafy.backend.recording.domain.Recording;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 녹화 파일 정보 영속성 처리를 담당한다.
 */
public interface RecordingRepository extends JpaRepository<Recording, Long> {
}

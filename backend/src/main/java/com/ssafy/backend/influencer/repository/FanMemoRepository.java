package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.FanMemo;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 팬 메모 영속성 처리를 담당한다.
 */
public interface FanMemoRepository extends JpaRepository<FanMemo, Long> {
}

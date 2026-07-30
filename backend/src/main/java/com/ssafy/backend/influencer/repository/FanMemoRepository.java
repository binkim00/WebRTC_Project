package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.FanMemo;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 팬 메모 영속성 처리를 담당한다.
 */
public interface FanMemoRepository extends JpaRepository<FanMemo, Long> {
    /**
     * 인플루언서 본인이 특정 팬에 대해 작성한 삭제되지 않은 메모 목록을 조회한다.
     *
     * @param influencerId 작성자인 인플루언서의 ID
     * @param fanId 조회 대상 팬의 ID
     * @return 삭제되지 않은 메모 목록
     */
    @EntityGraph(attributePaths = {"meeting"})
    List<FanMemo> findByInfluencer_IdAndFan_IdAndDeletedAtIsNull(Long influencerId, Long fanId);

    /**
     * 특정 팬 · 특정 회차 조합으로 이미 작성된(삭제되지 않은) 메모가 있는지 확인한다.
     * 소프트 삭제 방식이라, 삭제된 메모는 중복 판단에서 제외되도록 deletedAt 조건을 함께 건다.
     *
     * @param fanId 팬 ID
     * @param meetingId 팬미팅 회차 ID
     * @return 삭제되지 않은 메모가 이미 있으면 true
     */
    boolean existsByFan_IdAndMeeting_IdAndDeletedAtIsNull(Long fanId, Long meetingId);
}

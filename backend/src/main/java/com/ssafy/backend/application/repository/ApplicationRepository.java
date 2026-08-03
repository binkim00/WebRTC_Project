package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.dto.ParticipantAssignment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 팬미팅 응모 영속성 처리를 담당한다.
 */
public interface ApplicationRepository extends JpaRepository<Application, Long> {

    /** 팬미팅의 전체 응모 수를 반환한다. */
    long countByMeeting_Id(Long meetingId);

    /**
     * 팬미팅에서 지정 상태를 제외한 응모 수를 반환한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param excludedStatus 집계에서 제외할 응모 상태
     * @return 제외 상태를 뺀 응모 수
     */
    long countByMeeting_IdAndStatusNot(Long meetingId, ApplicationStatus excludedStatus);

    /** 팬미팅과 팬 식별자로 응모 결과를 조회한다. */
    Optional<Application> findByMeeting_IdAndFan_Id(Long meetingId, Long fanId);

    /** 팬미팅 취소 알림 대상 팬을 포함해 모든 응모를 조회한다. */
    @EntityGraph(attributePaths = {"fan"})
    List<Application> findAllByMeeting_Id(Long meetingId);

    /**
     * 팬미팅에서 지정 상태를 제외하고 알림 대상 팬을 포함한 응모를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param excludedStatus 조회에서 제외할 응모 상태
     * @return 제외 상태를 뺀 응모 목록
     */
    @EntityGraph(attributePaths = {"fan"})
    List<Application> findAllByMeeting_IdAndStatusNot(
            Long meetingId, ApplicationStatus excludedStatus
    );

    /**
     * 팬미팅에서 지정 상태인 응모 수를 반환한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 집계할 응모 상태
     * @return 해당 상태의 응모 수
     */
    long countByMeeting_IdAndStatus(Long meetingId, ApplicationStatus status);

    /**
     * 팬미팅과 팬 식별자로 팬미팅 카드 정보까지 함께 응모를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param fanId 팬 사용자 식별자
     * @return 팬미팅과 인플루언서를 함께 조회한 응모
     */
    @EntityGraph(attributePaths = {"meeting", "meeting.influencer"})
    Optional<Application> findWithMeetingByMeeting_IdAndFan_Id(Long meetingId, Long fanId);

    /**
     * 팬의 전체 응모 내역을 팬미팅 카드 정보와 함께 페이지 조회한다.
     *
     * @param fanId 팬 사용자 식별자
     * @param pageable 페이지 요청 정보
     * @return 팬의 응모 내역 페이지
     */
    @EntityGraph(attributePaths = {"meeting", "meeting.influencer"})
    Page<Application> findAllByFan_Id(Long fanId, Pageable pageable);

    /**
     * 팬의 특정 상태 응모 내역을 팬미팅 카드 정보와 함께 페이지 조회한다.
     *
     * @param fanId 팬 사용자 식별자
     * @param status 조회할 응모 상태
     * @param pageable 페이지 요청 정보
     * @return 팬의 응모 내역 페이지
     */
    @EntityGraph(attributePaths = {"meeting", "meeting.influencer"})
    Page<Application> findAllByFan_IdAndStatus(
            Long fanId, ApplicationStatus status, Pageable pageable
    );

    /**
     * 팬미팅에서 지정 상태를 제외하고 닉네임 검색어에 해당하는 응모를 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param excludedStatus 조회에서 제외할 응모 상태
     * @param nickname 팬 닉네임 검색어이며 빈 문자열이면 전체를 조회한다
     * @param pageable 페이지 요청 정보
     * @return 응모자 페이지
     */
    @EntityGraph(attributePaths = {"fan"})
    Page<Application> findAllByMeeting_IdAndStatusNotAndFan_NicknameContainingIgnoreCase(
            Long meetingId, ApplicationStatus excludedStatus, String nickname, Pageable pageable
    );

    /**
     * 팬미팅에서 지정 상태이고 닉네임 검색어에 해당하는 응모를 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 조회할 응모 상태
     * @param nickname 팬 닉네임 검색어이며 빈 문자열이면 전체를 조회한다
     * @param pageable 페이지 요청 정보
     * @return 응모자 페이지
     */
    @EntityGraph(attributePaths = {"fan"})
    Page<Application> findAllByMeeting_IdAndStatusAndFan_NicknameContainingIgnoreCase(
            Long meetingId, ApplicationStatus status, String nickname, Pageable pageable
    );

    /**
     * 응모 식별자 목록에 해당하는 확정 참가자의 호출 순서 배정을 한 번에 조회한다.
     *
     * <p>응모 목록마다 참가자를 개별 조회하면 N+1이 되므로 참가자 쪽에서 역방향으로 모아 읽는다.
     *
     * @param applicationIds 조회할 응모 식별자 목록
     * @return 응모별 참가자 배정 정보 목록이며 참가자가 없는 응모는 포함되지 않는다
     */
    @Query("""
            select new com.ssafy.backend.application.dto.ParticipantAssignment(
                participant.application.id, participant.id, participant.assignedOrder
            )
            from Participant participant
            where participant.application.id in :applicationIds
            """)
    List<ParticipantAssignment> findParticipantAssignments(
            @Param("applicationIds") Collection<Long> applicationIds
    );
}

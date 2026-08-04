package com.ssafy.backend.participant.repository;

import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.domain.ParticipantSource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 팬미팅 참가자 영속성 처리를 담당한다.
 */
public interface ParticipantRepository extends JpaRepository<Participant, Long> {
    /** 팬미팅에 확정된 참가자 수를 반환한다. */
    long countByMeeting_Id(Long meetingId);

    /** 팬미팅에 확정된 참가자가 하나라도 있는지 확인한다. */
    boolean existsByMeeting_Id(Long meetingId);

    /**
     * 팬미팅에서 지정한 출처로 확정된 참가자 수를 반환한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param participantSource 집계할 참가자 출처
     * @return 해당 출처의 참가자 수
     */
    long countByMeeting_IdAndParticipantSource(Long meetingId, ParticipantSource participantSource);

    /** 팬미팅 참가자를 배정 순번대로 조회한다. */
    @EntityGraph(attributePaths = {"fan", "meeting"})
    List<Participant> findByMeeting_IdOrderByAssignedOrderAsc(Long meetingId);

    /** 팬미팅과 팬 사용자 식별자로 참가자를 조회한다. */
    @EntityGraph(attributePaths = {"fan", "meeting"})
    Optional<Participant> findByMeeting_IdAndFan_Id(Long meetingId, Long fanId);

    /** 팬미팅에 속한 참가자를 식별자로 조회한다. */
    @EntityGraph(attributePaths = {"fan", "meeting"})
    Optional<Participant> findByIdAndMeeting_Id(Long participantId, Long meetingId);

    /**
     * 팬미팅 참가자를 상태와 닉네임 검색어로 걸러 배정 순번대로 페이지 조회한다.
     *
     * <p>빈 문자열을 넘기면 해당 조건을 적용하지 않는다. 팬 정보를 함께 가져와
     * 참가자 수에 비례해 조회 쿼리가 늘어나지 않도록 한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 참가자 상태 필터이며 비우면 전체 상태를 조회한다
     * @param keyword 팬 닉네임 검색어이며 비우면 전체 참가자를 조회한다
     * @param pageable 페이지 요청 정보
     * @return 조건에 해당하는 참가자 페이지
     */
    @Query(value = "select p from Participant p join fetch p.fan f "
            + "where p.meeting.id = :meetingId "
            + "and (:status = '' or p.status = :status) "
            + "and (:keyword = '' or lower(f.nickname) like lower(concat('%', :keyword, '%'))) "
            + "order by p.assignedOrder asc",
            countQuery = "select count(p) from Participant p join p.fan f "
                    + "where p.meeting.id = :meetingId "
                    + "and (:status = '' or p.status = :status) "
                    + "and (:keyword = '' or lower(f.nickname) like lower(concat('%', :keyword, '%')))")
    Page<Participant> searchByMeeting(@Param("meetingId") Long meetingId,
                                      @Param("status") String status,
                                      @Param("keyword") String keyword,
                                      Pageable pageable);

    /**
     * 참가자 출처까지 지정해 팬미팅 참가자를 배정 순번대로 페이지 조회한다.
     *
     * <p>외부 선별로 등록한 참가자만 따로 보려는 운영 화면에서 사용한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 참가자 상태 필터이며 비우면 전체 상태를 조회한다
     * @param keyword 팬 닉네임 검색어이며 비우면 전체 참가자를 조회한다
     * @param participantSource 조회할 참가자 출처
     * @param pageable 페이지 요청 정보
     * @return 조건에 해당하는 참가자 페이지
     */
    @Query(value = "select p from Participant p join fetch p.fan f "
            + "where p.meeting.id = :meetingId "
            + "and p.participantSource = :participantSource "
            + "and (:status = '' or p.status = :status) "
            + "and (:keyword = '' or lower(f.nickname) like lower(concat('%', :keyword, '%'))) "
            + "order by p.assignedOrder asc",
            countQuery = "select count(p) from Participant p join p.fan f "
                    + "where p.meeting.id = :meetingId "
                    + "and p.participantSource = :participantSource "
                    + "and (:status = '' or p.status = :status) "
                    + "and (:keyword = '' or lower(f.nickname) like lower(concat('%', :keyword, '%')))")
    Page<Participant> searchByMeetingAndSource(@Param("meetingId") Long meetingId,
                                               @Param("status") String status,
                                               @Param("keyword") String keyword,
                                               @Param("participantSource") ParticipantSource participantSource,
                                               Pageable pageable);

    /**
     * 통계 내보내기에 사용할 참가자를 팬과 함께 배정 순번대로 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 팬 정보를 포함한 참가자 목록
     */
    @Query("select p from Participant p join fetch p.fan "
            + "where p.meeting.id = :meetingId order by p.assignedOrder asc")
    List<Participant> findAllForExport(@Param("meetingId") Long meetingId);
}

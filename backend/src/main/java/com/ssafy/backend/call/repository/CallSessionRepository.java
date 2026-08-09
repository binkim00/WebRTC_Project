package com.ssafy.backend.call.repository;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.dto.ParticipantCallSessionView;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 영상통화 세션 영속성 처리를 담당한다.
 */
public interface CallSessionRepository extends JpaRepository<CallSession, Long> {

    /**
     * LiveKit 입장 권한 검증에 필요한 통화 세션과 연관 정보를 함께 조회한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 대기열, 참가자, 팬미팅 운영자가 함께 조회된 통화 세션
     */
    @EntityGraph(attributePaths = {
            "queueEntry",
            "queueEntry.participant",
            "queueEntry.participant.fan",
            "queueEntry.meeting",
            "queueEntry.meeting.influencer",
            "queueEntry.meeting.manager",
            "queueEntry.meeting.organization"
    })
    Optional<CallSession> findAccessContextById(Long callSessionId);

    /**
     * 대기열 항목에 이미 생성된 영상통화 세션을 조회한다.
     *
     * @param queueEntryId 대기열 항목 식별자
     * @return 해당 대기열 항목의 영상통화 세션
     */
    Optional<CallSession> findByQueueEntry_Id(Long queueEntryId);

    /**
     * 노쇼 처리와 LiveKit 입장 이벤트가 동시에 상태를 바꾸지 못하도록 세션을 잠금 조회한다.
     *
     * @param queueEntryId 노쇼 대상 대기열 항목 식별자
     * @return 쓰기 잠금으로 조회된 영상통화 세션
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select callSession
            from CallSession callSession
            where callSession.queueEntry.id = :queueEntryId
            """)
    Optional<CallSession> findByQueueEntryIdForUpdate(@Param("queueEntryId") Long queueEntryId);

    /**
     * LiveKit webhook 상태 전환에 필요한 세션을 쓰기 잠금과 함께 조회한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 대기열과 팬미팅이 함께 조회된 통화 세션
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select callSession
            from CallSession callSession
            join fetch callSession.queueEntry queueEntry
            join fetch queueEntry.meeting meeting
            where callSession.id = :callSessionId
            """)
    Optional<CallSession> findWebhookContextById(@Param("callSessionId") Long callSessionId);

    /**
     * 통화 종료 상태 전이에 필요한 세션과 권한 컨텍스트를 쓰기 잠금으로 조회한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 참가자와 팬미팅 운영자가 함께 조회된 통화 세션
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {
            "queueEntry",
            "queueEntry.participant",
            "queueEntry.participant.fan",
            "queueEntry.meeting",
            "queueEntry.meeting.influencer",
            "queueEntry.meeting.manager",
            "queueEntry.meeting.organization"
    })
    Optional<CallSession> findEndContextById(Long callSessionId);

    /**
     * Room에서 연결을 기다리는 최신 세션을 쓰기 잠금과 함께 조회한다.
     *
     * @param roomId LiveKit Room 식별자
     * @param status 조회할 통화 세션 상태
     * @return 해당 Room에서 가장 최근에 생성된 통화 세션
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {"queueEntry", "queueEntry.meeting"})
    Optional<CallSession> findFirstByRoomIdAndStatusOrderByIdDesc(
            String roomId, CallSessionStatus status);

    /**
     * 통화 제한 시간 또는 재접속 유예가 만료된 활성 세션 식별자를 조회한다.
     *
     * @param now 만료 여부를 판단할 서버 시각
     * @return 종료 처리가 필요한 활성 통화 세션 식별자 목록
     */
    @Query("""
            select callSession.id
            from CallSession callSession
            where callSession.status = com.ssafy.backend.call.domain.CallSessionStatus.ACTIVE
              and (callSession.endsAt <= :now
                   or callSession.reconnectAllowedUntil <= :now)
            """)
    List<Long> findExpiredActiveIds(@Param("now") LocalDateTime now);

    /**
     * 생성 후 정해진 시간까지 연결되지 않은 통화 세션 식별자를 조회한다.
     *
     * <p>연결 대기 세션은 {@code endsAt}과 {@code reconnectAllowedUntil}이 모두 비어 있어
     * 활성 세션 만료 조회에 걸리지 않으므로 생성 시각을 기준으로 따로 찾는다.
     *
     * @param threshold 이 시각 이전에 생성된 세션을 시간 초과로 판단할 기준 시각
     * @return 연결 시간이 초과된 통화 세션 식별자 목록
     */
    @Query("""
            select callSession.id
            from CallSession callSession
            where callSession.status = com.ssafy.backend.call.domain.CallSessionStatus.CONNECTING
              and callSession.createdAt <= :threshold
            """)
    List<Long> findTimedOutConnectingIds(@Param("threshold") LocalDateTime threshold);

    /**
     * 팬미팅에 지정 상태의 영상통화 세션이 존재하는지 확인한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param statuses 확인할 영상통화 세션 상태
     * @return 지정 상태의 세션이 하나라도 있으면 true
     */
    boolean existsByQueueEntry_Meeting_IdAndStatusIn(
            Long meetingId, Collection<CallSessionStatus> statuses);

    /**
     * 팬미팅 결과 통계 집계에 사용할 지정 상태의 영상통화 세션 수를 반환한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 집계할 영상통화 세션 상태
     * @return 해당 상태의 영상통화 세션 수
     */
    long countByQueueEntry_Meeting_IdAndStatus(Long meetingId, CallSessionStatus status);

    /**
     * 통화 시간 집계에 사용할 지정 상태의 영상통화 세션을 조회한다.
     *
     * <p>통화 시간은 {@code startedAt}과 {@code endedAt}의 차이로 계산하므로 DB 함수 대신
     * 두 시각을 읽어와 애플리케이션에서 합산한다. 팬미팅 한 건의 세션 수는 참가자 수 이하다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 조회할 영상통화 세션 상태
     * @return 해당 상태의 영상통화 세션 목록
     */
    List<CallSession> findByQueueEntry_Meeting_IdAndStatus(
            Long meetingId, CallSessionStatus status);

    /**
     * 팬미팅 종료 시 아직 연결 중이거나 활성 상태인 영상통화 세션을 잠금 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param statuses 조회할 영상통화 상태 목록
     * @return 종료 처리가 필요한 영상통화 세션 목록
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {"queueEntry", "queueEntry.meeting"})
    List<CallSession> findByQueueEntry_Meeting_IdAndStatusIn(
            Long meetingId, Collection<CallSessionStatus> statuses);

    /**
     * 통계 내보내기에 사용할 팬미팅의 모든 통화 세션을 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 상태와 무관한 팬미팅의 전체 통화 세션 목록
     */
    List<CallSession> findByQueueEntry_Meeting_Id(Long meetingId);

    /**
     * 팬미팅 참가자별 통화 세션 식별자를 한 번에 조회한다.
     *
     * <p>참가자 목록 화면이 통화가 끝난 뒤에도 AI 요약을 열 수 있으려면 참가자마다 통화 세션
     * 식별자가 필요하다. 세션 엔티티를 통째로 읽으면 참가자를 지연 로딩하느라 행 수만큼 추가
     * 질의가 나가므로 필요한 두 식별자만 가져온다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 참가자 식별자와 통화 세션 식별자 쌍의 목록
     */
    @Query("""
            select new com.ssafy.backend.call.dto.ParticipantCallSessionView(
                    participant.id, callSession.id)
            from CallSession callSession
            join callSession.queueEntry queueEntry
            join queueEntry.participant participant
            where queueEntry.meeting.id = :meetingId
            """)
    List<ParticipantCallSessionView> findParticipantCallSessions(
            @Param("meetingId") Long meetingId);
}

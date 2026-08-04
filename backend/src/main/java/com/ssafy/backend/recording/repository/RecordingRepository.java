package com.ssafy.backend.recording.repository;

import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.domain.RecordingStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 녹화 파일 정보 영속성 처리를 담당한다.
 */
public interface RecordingRepository extends JpaRepository<Recording, Long> {

    /**
     * 해당 통화에 이미 녹화가 등록되어 있는지 확인한다.
     *
     * <p>통화당 녹화 파일은 1개만 허용하므로 업로드 전에 확인한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 이미 녹화가 있으면 true
     */
    boolean existsByCallSession_Id(Long callSessionId);

    /** 통화 세션에 연결된 녹화를 조회한다. */
    Optional<Recording> findByCallSession_Id(Long callSessionId);

    /** 통화 종료와 Egress webhook의 동시 상태 변경을 직렬화한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Recording r where r.callSession.id = :callSessionId")
    Optional<Recording> findByCallSessionIdForUpdate(
            @Param("callSessionId") Long callSessionId);

    /** Egress 상태 변경을 직렬화하기 위해 녹화 행을 쓰기 잠금으로 조회한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Recording r where r.id = :recordingId")
    Optional<Recording> findByIdForUpdate(@Param("recordingId") Long recordingId);

    /** Egress webhook 상태 변경을 직렬화하기 위해 작업 ID로 쓰기 잠금 조회한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Recording r where r.egressId = :egressId")
    Optional<Recording> findByEgressIdForUpdate(@Param("egressId") String egressId);

    /**
     * 권한 검증에 필요한 통화·대기열·참가자·팬을 함께 조회한다.
     *
     * <p>녹화 접근은 해당 통화에 참여한 팬 본인만 허용하므로 팬까지 한 번에 가져온다.
     *
     * @param recordingId 녹화 식별자
     * @return 녹화이며 없으면 빈 값
     */
    @Query("""
            select r from Recording r
            join fetch r.callSession cs
            join fetch cs.queueEntry qe
            join fetch qe.participant p
            join fetch p.fan
            where r.id = :recordingId
            """)
    Optional<Recording> findDetailById(@Param("recordingId") Long recordingId);

    /**
     * 특정 팬이 소유한 녹화를 최신 완료순으로 페이지 조회한다.
     *
     * <p>연관 엔티티를 fetch join해 목록 매핑 중 건별 추가 조회가 발생하지 않게 한다.
     *
     * @param fanId 팬 사용자 식별자
     * @param pageable 정렬과 페이지 정보
     * @return 해당 팬의 녹화 페이지
     */
    @Query(value = """
            select r from Recording r
            join fetch r.callSession cs
            join fetch cs.queueEntry qe
            join fetch qe.participant p
            join fetch p.fan f
            join fetch qe.meeting
            where f.id = :fanId
            """,
            countQuery = """
            select count(r) from Recording r
            where r.callSession.queueEntry.participant.fan.id = :fanId
            """)
    Page<Recording> findAllByFanId(@Param("fanId") Long fanId, Pageable pageable);

    /**
     * 보관 기간이 지난 녹화 식별자를 조회한다.
     *
     * <p>파일 삭제와 상태 전환은 건별 트랜잭션으로 처리하므로 식별자만 먼저 모은다.
     *
     * @param status 만료 대상 상태
     * @param now 기준 시각
     * @param pageable 한 번에 처리할 건수 제한
     * @return 만료 처리할 녹화 식별자 목록
     */
    @Query("""
            select r.id from Recording r
            where r.status = :status
              and r.availableUntil is not null
              and r.availableUntil < :now
            order by r.availableUntil asc
            """)
    List<Long> findExpiredIds(@Param("status") RecordingStatus status,
                              @Param("now") LocalDateTime now,
                              Pageable pageable);
}

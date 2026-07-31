package com.ssafy.backend.recording.service;

import com.ssafy.backend.recording.config.RecordingStorageProperties;
import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.domain.RecordingStatus;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.recording.storage.RecordingFileStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 보관 기간이 지난 녹화의 실제 파일을 지우고 상태를 만료로 바꾼다.
 *
 * <p>파일 삭제와 상태 전환을 건별 트랜잭션으로 처리해 한 건이 실패해도 나머지가 진행된다.
 * 파일이 이미 없거나 이미 만료된 건을 다시 처리해도 안전하므로 몇 번이든 재실행할 수 있다.
 */
@Service
public class RecordingExpirationService {

    private static final Logger log = LoggerFactory.getLogger(RecordingExpirationService.class);

    private final RecordingRepository recordingRepository;
    private final RecordingFileStorage fileStorage;
    private final RecordingStorageProperties properties;
    private final Clock clock;

    /**
     * 만료 처리에 필요한 저장소와 파일 스토리지, 설정, 시계를 주입받는다.
     *
     * @param recordingRepository 녹화 저장소
     * @param fileStorage 녹화 파일 스토리지
     * @param properties 녹화 저장 설정
     * @param clock 만료 판정 기준 시계
     */
    public RecordingExpirationService(RecordingRepository recordingRepository,
                                      RecordingFileStorage fileStorage,
                                      RecordingStorageProperties properties,
                                      Clock clock) {
        this.recordingRepository = recordingRepository;
        this.fileStorage = fileStorage;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * 보관 기간이 지난 녹화 식별자를 모은다.
     *
     * @param batchSize 한 번에 처리할 최대 건수
     * @return 만료 처리 대상 녹화 식별자 목록
     */
    @Transactional(readOnly = true)
    public List<Long> findExpiredRecordingIds(int batchSize) {
        return recordingRepository.findExpiredIds(
                RecordingStatus.AVAILABLE,
                LocalDateTime.now(clock),
                PageRequest.ofSize(batchSize)
        );
    }

    /**
     * 녹화 한 건의 파일을 지우고 상태를 만료로 바꾼다.
     *
     * <p>파일이 이미 없어도 상태 전환은 그대로 수행하므로 중간에 실패한 만료 작업을 다시 실행해도
     * 결과가 같다. 이미 만료된 녹화는 아무것도 바꾸지 않는다.
     *
     * @param recordingId 녹화 식별자
     * @return 이번 호출로 상태가 만료로 바뀌었으면 true
     */
    @Transactional
    public boolean expire(Long recordingId) {
        Recording recording = recordingRepository.findById(recordingId).orElse(null);
        if (recording == null) {
            return false;
        }

        boolean fileDeleted = fileStorage.delete(recording.getStorageKey());
        boolean statusChanged = recording.expire();
        if (statusChanged) {
            log.info("녹화 보관 기간이 지나 만료 처리했습니다. recordingId={} fileDeleted={}",
                    recordingId, fileDeleted);
        }
        return statusChanged;
    }

    /** 한 주기에 처리할 최대 건수를 반환한다. */
    public int batchSize() {
        return DEFAULT_BATCH_SIZE;
    }

    /** 보관 기간(일)을 반환한다. */
    public int retentionDays() {
        return properties.retentionDays();
    }

    /** 한 주기에 처리할 기본 건수이며 스케줄러가 자주 도므로 작게 잡는다. */
    private static final int DEFAULT_BATCH_SIZE = 100;
}

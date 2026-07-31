package com.ssafy.backend.recording.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 보관 기간이 지난 녹화를 주기적으로 만료 처리한다.
 *
 * <p>한 건이 실패해도 나머지 건을 계속 처리하고, 다음 주기에 같은 건을 다시 시도한다.
 */
@Component
public class RecordingExpirationScheduler {

    private static final Logger log = LoggerFactory.getLogger(RecordingExpirationScheduler.class);

    private final RecordingExpirationService expirationService;

    /**
     * 만료 처리 서비스를 주입받는다.
     *
     * @param expirationService 녹화 만료 처리 서비스
     */
    public RecordingExpirationScheduler(RecordingExpirationService expirationService) {
        this.expirationService = expirationService;
    }

    /** 보관 기간이 지난 녹화의 파일을 지우고 상태를 만료로 바꾼다. */
    @Scheduled(fixedDelayString = "${app.recording.expiration-check-delay-ms:600000}")
    public void expireOutdatedRecordings() {
        for (Long recordingId : expirationService.findExpiredRecordingIds(
                expirationService.batchSize())) {
            try {
                expirationService.expire(recordingId);
            } catch (RuntimeException exception) {
                // 한 건의 실패가 남은 건을 막지 않도록 기록만 남기고 계속 진행한다.
                log.warn("녹화 만료 처리에 실패했습니다. 다음 주기에 다시 시도합니다. recordingId={}",
                        recordingId, exception);
            }
        }
    }
}

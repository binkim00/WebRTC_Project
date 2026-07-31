package com.ssafy.backend.recording.domain;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 영상통화 녹화 파일의 저장 정보와 처리 상태를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "recordings")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Recording extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "recording_id", nullable = false)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "call_session_id", nullable = false, unique = true)
    private CallSession callSession;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "storage_key", nullable = false, unique = true, length = 500)
    private String storageKey;

    @Column(name = "file_size_bytes")
    private Long fileSizeBytes;

    @Column(name = "duration_sec")
    private Integer durationSec;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private RecordingStatus status;

    @Column(name = "retry_count", nullable = false)
    private Integer retryCount;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "available_until")
    private LocalDateTime availableUntil;

    /**
     * 업로드가 끝난 녹화를 바로 재생 가능한 상태로 생성한다.
     *
     * <p>업로드는 통화가 끝난 뒤 한 번에 이루어지므로 중간 상태를 거치지 않고
     * {@link RecordingStatus#AVAILABLE}로 저장한다. 실제 저장 경로는 원본 파일명을 쓰지 않고
     * 호출자가 만든 UUID 기반 {@code storageKey}를 그대로 보관한다.
     *
     * @param callSession 녹화 대상 통화 세션
     * @param fileName 사용자가 올린 원본 파일명이며 표시와 다운로드 이름에만 사용한다
     * @param contentType 저장된 파일의 MIME 타입
     * @param storageKey 저장소 안의 상대 경로 키
     * @param fileSizeBytes 저장된 파일 크기
     * @param durationSec 녹화 길이(초)이며 알 수 없으면 null
     * @param completedAt 업로드 완료 시각
     * @param availableUntil 보관 만료 시각
     * @return 재생 가능한 녹화
     */
    public static Recording createAvailable(CallSession callSession, String fileName,
                                            String contentType, String storageKey,
                                            long fileSizeBytes, Integer durationSec,
                                            LocalDateTime completedAt,
                                            LocalDateTime availableUntil) {
        Recording recording = new Recording();
        recording.callSession = Objects.requireNonNull(callSession);
        recording.fileName = Objects.requireNonNull(fileName);
        recording.contentType = Objects.requireNonNull(contentType);
        recording.storageKey = Objects.requireNonNull(storageKey);
        recording.fileSizeBytes = fileSizeBytes;
        recording.durationSec = durationSec;
        recording.status = RecordingStatus.AVAILABLE;
        recording.retryCount = 0;
        recording.completedAt = Objects.requireNonNull(completedAt);
        recording.availableUntil = Objects.requireNonNull(availableUntil);
        return recording;
    }

    /**
     * 보관 기간이 지난 녹화를 만료 상태로 전환한다.
     *
     * <p>같은 녹화에 대해 여러 번 호출해도 안전하도록 이미 만료된 건은 아무것도 바꾸지 않는다.
     * 실제 파일 삭제는 호출자가 담당하며, 파일이 이미 없어도 상태 전환은 그대로 수행한다.
     *
     * @return 이번 호출로 상태가 바뀌었으면 true이며 이미 만료였으면 false
     */
    public boolean expire() {
        if (status == RecordingStatus.EXPIRED) {
            return false;
        }
        this.status = RecordingStatus.EXPIRED;
        return true;
    }

    /**
     * 지금 재생하거나 내려받을 수 있는 녹화인지 확인한다.
     *
     * @param now 판정 기준 시각
     * @return 상태가 AVAILABLE이고 보관 만료 시각을 넘기지 않았으면 true
     */
    public boolean isPlayableAt(LocalDateTime now) {
        return status == RecordingStatus.AVAILABLE
                && availableUntil != null
                && !now.isAfter(availableUntil);
    }
}

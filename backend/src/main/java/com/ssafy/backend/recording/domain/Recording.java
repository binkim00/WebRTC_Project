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
import jakarta.persistence.Index;
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
@Table(name = "recordings", indexes = {
        @Index(name = "idx_recordings_status_updated_at",
                columnList = "status, updated_at")
})
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
    @Column(name = "source", nullable = false, length = 30,
            columnDefinition = "VARCHAR(30) DEFAULT 'BROWSER_UPLOAD'")
    private RecordingSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private RecordingStatus status;

    @Column(name = "egress_id", unique = true, length = 128)
    private String egressId;

    @Column(name = "room_name", length = 255)
    private String roomName;

    @Column(name = "requested_at")
    private LocalDateTime requestedAt;

    @Column(name = "egress_started_at")
    private LocalDateTime egressStartedAt;

    @Column(name = "egress_ended_at")
    private LocalDateTime egressEndedAt;

    @Column(name = "failure_code", length = 100)
    private String failureCode;

    @Column(name = "failure_message", length = 1000)
    private String failureMessage;

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
        recording.source = RecordingSource.BROWSER_UPLOAD;
        recording.status = RecordingStatus.AVAILABLE;
        recording.retryCount = 0;
        recording.completedAt = Objects.requireNonNull(completedAt);
        recording.availableUntil = Objects.requireNonNull(availableUntil);
        return recording;
    }

    /**
     * LiveKit Egress 시작 요청을 보낼 녹화 메타데이터를 먼저 생성한다.
     *
     * @param callSession 녹화 대상 통화 세션
     * @param fileName 사용자에게 표시할 MP4 파일명
     * @param storageKey 녹화 저장소 안의 상대 경로
     * @param requestedAt 시작 요청을 확정한 서버 시각
     * @return 시작 대기 상태의 Egress 녹화
     */
    public static Recording createEgressStarting(CallSession callSession, String fileName,
                                                  String storageKey,
                                                  LocalDateTime requestedAt) {
        Recording recording = new Recording();
        recording.callSession = Objects.requireNonNull(callSession);
        recording.fileName = Objects.requireNonNull(fileName);
        recording.contentType = "video/mp4";
        recording.storageKey = Objects.requireNonNull(storageKey);
        recording.source = RecordingSource.LIVEKIT_EGRESS;
        recording.status = RecordingStatus.STARTING;
        recording.retryCount = 0;
        recording.roomName = Objects.requireNonNull(callSession.getRoomId());
        recording.requestedAt = Objects.requireNonNull(requestedAt);
        return recording;
    }

    /** LiveKit이 발급한 Egress ID를 멱등하게 연결한다. */
    public void assignEgressId(String egressId) {
        if (egressId == null || egressId.isBlank()) {
            throw new IllegalArgumentException("Egress ID는 비어 있을 수 없습니다.");
        }
        if (this.egressId != null && !this.egressId.equals(egressId)) {
            throw new IllegalStateException("이미 다른 Egress 작업이 연결되어 있습니다.");
        }
        this.egressId = egressId;
    }

    /** Egress가 실제 녹화를 시작한 상태를 반영한다. */
    public void markRecording(LocalDateTime startedAt) {
        if (isTerminal() || status == RecordingStatus.PROCESSING) {
            return;
        }
        if (status != RecordingStatus.STARTING && status != RecordingStatus.RECORDING) {
            throw new IllegalStateException("녹화 시작을 반영할 수 없는 상태입니다.");
        }
        status = RecordingStatus.RECORDING;
        if (egressStartedAt == null && startedAt != null) {
            egressStartedAt = startedAt;
        }
    }

    /** 통화 종료 또는 Egress 종료 준비 상태를 반영한다. */
    public void markProcessing() {
        if (isTerminal() || status == RecordingStatus.PROCESSING) {
            return;
        }
        if (status != RecordingStatus.STARTING && status != RecordingStatus.RECORDING) {
            throw new IllegalStateException("녹화 종료를 준비할 수 없는 상태입니다.");
        }
        status = RecordingStatus.PROCESSING;
    }

    /** Egress 작업이 끝난 시각을 기록하고 파일 검증 전 처리 상태를 유지한다. */
    public void markEgressEnded(LocalDateTime endedAt) {
        if (isTerminal()) {
            return;
        }
        markProcessing();
        if (egressEndedAt == null && endedAt != null) {
            egressEndedAt = endedAt;
        }
    }

    /** Egress output validation succeeded and the recording can now be served. */
    public void markAvailable(long fileSizeBytes, Integer durationSec,
                              LocalDateTime completedAt, LocalDateTime availableUntil) {
        if (status == RecordingStatus.AVAILABLE) {
            return;
        }
        if (source != RecordingSource.LIVEKIT_EGRESS
                || status != RecordingStatus.PROCESSING) {
            throw new IllegalStateException("Only a processed Egress recording can become available.");
        }
        if (fileSizeBytes <= 0) {
            throw new IllegalArgumentException("The recording file must not be empty.");
        }
        this.fileSizeBytes = fileSizeBytes;
        this.durationSec = durationSec;
        this.completedAt = Objects.requireNonNull(completedAt);
        this.availableUntil = Objects.requireNonNull(availableUntil);
        this.status = RecordingStatus.AVAILABLE;
        this.failureCode = null;
        this.failureMessage = null;
    }

    /** Egress 시작·진행·종료 실패를 녹화 실패로 확정한다. */
    public void markFailed(String failureCode, String failureMessage,
                           LocalDateTime endedAt) {
        if (status == RecordingStatus.AVAILABLE
                || status == RecordingStatus.EXPIRED
                || status == RecordingStatus.DELETED) {
            return;
        }
        status = RecordingStatus.FAILED;
        this.failureCode = normalize(failureCode, 100);
        this.failureMessage = normalize(failureMessage, 1000);
        if (egressEndedAt == null && endedAt != null) {
            egressEndedAt = endedAt;
        }
    }

    /** 외부 작업이 더 이상 상태를 바꿀 수 없는지 반환한다. */
    public boolean isTerminal() {
        return status == RecordingStatus.AVAILABLE
                || status == RecordingStatus.FAILED
                || status == RecordingStatus.EXPIRED
                || status == RecordingStatus.DELETED;
    }

    private String normalize(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        return normalized.length() <= maxLength
                ? normalized : normalized.substring(0, maxLength);
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

package com.ssafy.backend.recording.dto;

import com.ssafy.backend.recording.domain.Recording;

import java.time.LocalDateTime;

/**
 * 녹화 상세 정보를 전달한다.
 *
 * <p>저장 경로 키는 서버 내부 정보이므로 응답에 담지 않는다.
 *
 * @param recordingId 녹화 식별자
 * @param callSessionId 통화 세션 식별자
 * @param meetingId 통화가 속한 팬미팅 식별자
 * @param fileName 원본 파일명
 * @param contentType 저장된 파일의 MIME 타입
 * @param fileSizeBytes 저장된 파일 크기
 * @param durationSec 녹화 길이(초)이며 알 수 없으면 null
 * @param status 녹화 상태
 * @param completedAt 업로드 완료 시각
 * @param availableUntil 보관 만료 시각
 * @param playable 지금 재생·다운로드할 수 있는지 여부
 */
public record RecordingDetailResponse(
        Long recordingId,
        Long callSessionId,
        Long meetingId,
        String fileName,
        String contentType,
        Long fileSizeBytes,
        Integer durationSec,
        String status,
        LocalDateTime completedAt,
        LocalDateTime availableUntil,
        boolean playable
) {
    /**
     * 녹화와 재생 가능 여부를 상세 응답으로 변환한다.
     *
     * @param recording 통화·대기열을 함께 조회한 녹화
     * @param playable 지금 재생·다운로드할 수 있는지 여부
     * @return 녹화 상세 응답
     */
    public static RecordingDetailResponse of(Recording recording, boolean playable) {
        return new RecordingDetailResponse(
                recording.getId(),
                recording.getCallSession().getId(),
                recording.getCallSession().getQueueEntry().getMeeting().getId(),
                recording.getFileName(),
                recording.getContentType(),
                recording.getFileSizeBytes(),
                recording.getDurationSec(),
                recording.getStatus().name(),
                recording.getCompletedAt(),
                recording.getAvailableUntil(),
                playable
        );
    }
}

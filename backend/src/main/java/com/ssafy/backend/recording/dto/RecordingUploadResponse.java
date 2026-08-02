package com.ssafy.backend.recording.dto;

import com.ssafy.backend.recording.domain.Recording;

import java.time.LocalDateTime;

/**
 * 녹화 업로드 결과를 전달한다.
 *
 * <p>저장 경로 키는 서버 내부 정보이므로 응답에 담지 않는다.
 *
 * @param recordingId 생성된 녹화 식별자
 * @param callSessionId 녹화 대상 통화 세션 식별자
 * @param fileName 원본 파일명
 * @param contentType 저장된 파일의 MIME 타입
 * @param fileSizeBytes 저장된 파일 크기
 * @param status 녹화 상태
 * @param completedAt 업로드 완료 시각
 * @param availableUntil 보관 만료 시각
 */
public record RecordingUploadResponse(
        Long recordingId,
        Long callSessionId,
        String fileName,
        String contentType,
        Long fileSizeBytes,
        String status,
        LocalDateTime completedAt,
        LocalDateTime availableUntil
) {
    /**
     * 저장된 녹화를 업로드 응답으로 변환한다.
     *
     * @param recording 저장된 녹화
     * @return 녹화 업로드 응답
     */
    public static RecordingUploadResponse from(Recording recording) {
        return new RecordingUploadResponse(
                recording.getId(),
                recording.getCallSession().getId(),
                recording.getFileName(),
                recording.getContentType(),
                recording.getFileSizeBytes(),
                recording.getStatus().name(),
                recording.getCompletedAt(),
                recording.getAvailableUntil()
        );
    }
}

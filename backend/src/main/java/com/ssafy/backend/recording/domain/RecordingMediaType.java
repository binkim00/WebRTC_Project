package com.ssafy.backend.recording.domain;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;

import java.util.Locale;

/**
 * 업로드를 허용하는 녹화 파일 형식이다.
 *
 * <p>WEBM과 MP4만 허용하며 확장자와 MIME 타입이 서로 맞는지도 함께 검사한다.
 */
public enum RecordingMediaType {

    WEBM("webm", "video/webm"),
    MP4("mp4", "video/mp4");

    private final String extension;
    private final String mimeType;

    RecordingMediaType(String extension, String mimeType) {
        this.extension = extension;
        this.mimeType = mimeType;
    }

    /** 저장 키에 사용할 확장자를 반환한다. */
    public String extension() {
        return extension;
    }

    /** 저장하고 응답할 MIME 타입을 반환한다. */
    public String mimeType() {
        return mimeType;
    }

    /**
     * 원본 파일명과 선언된 MIME 타입이 모두 허용 형식인지 확인한다.
     *
     * <p>브라우저 MediaRecorder는 {@code video/webm;codecs=vp9,opus}처럼 파라미터를 붙여 보내므로
     * 세미콜론 앞의 기본 타입만 비교한다. 확장자와 MIME 타입이 서로 다른 형식을 가리키면 거부해
     * 확장자만 바꾼 파일이 통과하지 못하게 한다.
     *
     * @param originalFilename 업로드된 원본 파일명
     * @param contentType 요청이 선언한 MIME 타입
     * @return 확인된 녹화 형식
     * @throws BusinessException 확장자나 MIME 타입이 허용 형식이 아니거나 서로 맞지 않는 경우
     */
    public static RecordingMediaType resolve(String originalFilename, String contentType) {
        RecordingMediaType byExtension = fromExtension(originalFilename);
        RecordingMediaType byMimeType = fromMimeType(contentType);
        if (byExtension != byMimeType) {
            throw new BusinessException(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
        }
        return byExtension;
    }

    /**
     * 파일명 확장자로 허용 형식을 찾는다.
     *
     * @param originalFilename 업로드된 원본 파일명
     * @return 확장자가 가리키는 형식
     * @throws BusinessException 파일명이 없거나 허용 확장자가 아닌 경우
     */
    private static RecordingMediaType fromExtension(String originalFilename) {
        if (originalFilename == null) {
            throw new BusinessException(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            throw new BusinessException(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
        }
        String extension = originalFilename.substring(dot + 1).toLowerCase(Locale.ROOT);
        for (RecordingMediaType type : values()) {
            if (type.extension.equals(extension)) {
                return type;
            }
        }
        throw new BusinessException(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
    }

    /**
     * 선언된 MIME 타입으로 허용 형식을 찾는다.
     *
     * @param contentType 요청이 선언한 MIME 타입이며 파라미터가 붙어 있을 수 있다
     * @return MIME 타입이 가리키는 형식
     * @throws BusinessException MIME 타입이 없거나 허용 형식이 아닌 경우
     */
    private static RecordingMediaType fromMimeType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            throw new BusinessException(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
        }
        int parameterStart = contentType.indexOf(';');
        String baseType = (parameterStart < 0 ? contentType : contentType.substring(0, parameterStart))
                .trim().toLowerCase(Locale.ROOT);
        for (RecordingMediaType type : values()) {
            if (type.mimeType.equals(baseType)) {
                return type;
            }
        }
        throw new BusinessException(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
    }
}

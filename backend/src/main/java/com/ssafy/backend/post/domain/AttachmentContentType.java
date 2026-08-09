package com.ssafy.backend.post.domain;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;

import java.util.List;
import java.util.Locale;

/**
 * 공지 첨부파일로 업로드를 허용하는 파일 형식이다.
 *
 * <p>JPG, JPEG, PNG, WEBP, PDF만 허용하며 확장자와 MIME 타입이 서로 맞는지도 함께 검사한다.
 * JPG와 JPEG는 같은 형식이므로 하나의 값이 두 확장자를 함께 받는다.
 */
public enum AttachmentContentType {

    JPEG(List.of("jpg", "jpeg"), "image/jpeg"),
    PNG(List.of("png"), "image/png"),
    WEBP(List.of("webp"), "image/webp"),
    PDF(List.of("pdf"), "application/pdf");

    private final List<String> extensions;
    private final String mimeType;

    /**
     * 허용 확장자 목록과 MIME 타입으로 첨부 형식을 초기화한다.
     *
     * @param extensions 허용 확장자 목록이며 첫 번째 값을 저장 키에 사용한다
     * @param mimeType 이 형식의 MIME 타입
     */
    AttachmentContentType(List<String> extensions, String mimeType) {
        this.extensions = extensions;
        this.mimeType = mimeType;
    }

    /** 저장 키에 사용할 대표 확장자를 반환한다. */
    public String extension() {
        return extensions.get(0);
    }

    /** 저장하고 응답할 MIME 타입을 반환한다. */
    public String mimeType() {
        return mimeType;
    }

    /**
     * 화면에 그림으로 그릴 수 있는 형식인지 확인한다.
     *
     * <p>커버 이미지처럼 이미지만 받아야 하는 첨부 유형을 검증하는 데 사용한다.
     *
     * @return 이미지 형식이면 true
     */
    public boolean isImage() {
        return mimeType.startsWith("image/");
    }

    /**
     * 원본 파일명과 선언된 MIME 타입이 모두 허용 형식인지 확인한다.
     *
     * <p>확장자와 MIME 타입이 서로 다른 형식을 가리키면 거부해 확장자만 바꾼 파일이 통과하지
     * 못하게 한다. 브라우저가 {@code image/jpeg; charset=binary}처럼 파라미터를 붙여 보낼 수
     * 있으므로 세미콜론 앞의 기본 타입만 비교한다.
     *
     * @param originalFilename 업로드된 원본 파일명
     * @param contentType 요청이 선언한 MIME 타입
     * @return 확인된 첨부파일 형식
     * @throws BusinessException 확장자나 MIME 타입이 허용 형식이 아니거나 서로 맞지 않는 경우
     */
    public static AttachmentContentType resolve(String originalFilename, String contentType) {
        AttachmentContentType byExtension = fromExtension(originalFilename);
        AttachmentContentType byMimeType = fromMimeType(contentType);
        if (byExtension != byMimeType) {
            throw new BusinessException(ErrorCode.ATTACHMENT_FORMAT_NOT_ALLOWED);
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
    private static AttachmentContentType fromExtension(String originalFilename) {
        if (originalFilename == null) {
            throw new BusinessException(ErrorCode.ATTACHMENT_FORMAT_NOT_ALLOWED);
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            throw new BusinessException(ErrorCode.ATTACHMENT_FORMAT_NOT_ALLOWED);
        }
        String extension = originalFilename.substring(dot + 1).toLowerCase(Locale.ROOT);
        for (AttachmentContentType type : values()) {
            if (type.extensions.contains(extension)) {
                return type;
            }
        }
        throw new BusinessException(ErrorCode.ATTACHMENT_FORMAT_NOT_ALLOWED);
    }

    /**
     * 선언된 MIME 타입으로 허용 형식을 찾는다.
     *
     * @param contentType 요청이 선언한 MIME 타입이며 파라미터가 붙어 있을 수 있다
     * @return MIME 타입이 가리키는 형식
     * @throws BusinessException MIME 타입이 없거나 허용 형식이 아닌 경우
     */
    private static AttachmentContentType fromMimeType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            throw new BusinessException(ErrorCode.ATTACHMENT_FORMAT_NOT_ALLOWED);
        }
        int parameterStart = contentType.indexOf(';');
        String baseType = (parameterStart < 0
                ? contentType : contentType.substring(0, parameterStart))
                .trim().toLowerCase(Locale.ROOT);
        for (AttachmentContentType type : values()) {
            if (type.mimeType.equals(baseType)) {
                return type;
            }
        }
        throw new BusinessException(ErrorCode.ATTACHMENT_FORMAT_NOT_ALLOWED);
    }
}

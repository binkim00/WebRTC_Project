package com.ssafy.backend.recording.domain;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecordingMediaTypeTest {

    /** WEBM과 MP4 파일이 확장자·MIME 조합으로 통과하는지 검증한다. */
    @Test
    void resolvesAllowedFormats() {
        assertThat(RecordingMediaType.resolve("call.webm", "video/webm"))
                .isEqualTo(RecordingMediaType.WEBM);
        assertThat(RecordingMediaType.resolve("call.mp4", "video/mp4"))
                .isEqualTo(RecordingMediaType.MP4);
    }

    /** 대문자 확장자와 MIME 타입도 허용되는지 검증한다. */
    @Test
    void resolvesUpperCaseExtensionAndMimeType() {
        assertThat(RecordingMediaType.resolve("CALL.WEBM", "VIDEO/WEBM"))
                .isEqualTo(RecordingMediaType.WEBM);
    }

    /** MediaRecorder가 붙이는 코덱 파라미터가 있어도 통과하는지 검증한다. */
    @Test
    void resolvesMimeTypeWithCodecParameters() {
        assertThat(RecordingMediaType.resolve("call.webm", "video/webm;codecs=vp9,opus"))
                .isEqualTo(RecordingMediaType.WEBM);
        assertThat(RecordingMediaType.resolve("call.mp4", "video/mp4; codecs=\"avc1.42E01E\""))
                .isEqualTo(RecordingMediaType.MP4);
    }

    /** 허용하지 않는 확장자가 거부되는지 검증한다. */
    @Test
    void rejectsDisallowedExtensions() {
        List<String> names = List.of(
                "call.mov", "call.avi", "call.mkv", "call.exe", "call.txt", "call"
        );

        for (String name : names) {
            assertThat(rejectedErrorCode(name, "video/webm"))
                    .as("확장자 %s 는 거부해야 한다", name)
                    .isEqualTo(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
        }
    }

    /** 허용하지 않는 MIME 타입이 거부되는지 검증한다. */
    @Test
    void rejectsDisallowedMimeTypes() {
        List<String> mimeTypes = List.of(
                "video/quicktime", "application/octet-stream", "text/plain", "image/png", ""
        );

        for (String mimeType : mimeTypes) {
            assertThat(rejectedErrorCode("call.webm", mimeType))
                    .as("MIME %s 는 거부해야 한다", mimeType)
                    .isEqualTo(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
        }
    }

    /** 확장자만 허용 형식으로 바꾼 파일이 거부되는지 검증한다. */
    @Test
    void rejectsMismatchedExtensionAndMimeType() {
        assertThat(rejectedErrorCode("call.webm", "video/mp4"))
                .isEqualTo(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
        assertThat(rejectedErrorCode("call.mp4", "video/webm"))
                .isEqualTo(ErrorCode.RECORDING_FORMAT_NOT_ALLOWED);
    }

    /** 파일명과 MIME 타입이 없으면 거부되는지 검증한다. */
    @Test
    void rejectsMissingFileNameAndMimeType() {
        assertThatThrownBy(() -> RecordingMediaType.resolve(null, "video/webm"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> RecordingMediaType.resolve("call.webm", null))
                .isInstanceOf(BusinessException.class);
    }

    /** 확장자와 MIME 타입 조합이 거부될 때의 오류 코드를 돌려준다. */
    private ErrorCode rejectedErrorCode(String fileName, String contentType) {
        try {
            RecordingMediaType.resolve(fileName, contentType);
            return null;
        } catch (BusinessException exception) {
            return exception.getErrorCode();
        }
    }
}

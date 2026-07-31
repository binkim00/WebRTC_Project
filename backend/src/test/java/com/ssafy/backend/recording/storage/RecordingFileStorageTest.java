package com.ssafy.backend.recording.storage;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.recording.config.RecordingStorageProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecordingFileStorageTest {

    private static final long MAX_SIZE = 1024L;
    private static final LocalDate TODAY = LocalDate.of(2026, 7, 31);

    @TempDir
    Path root;

    private RecordingFileStorage storage;

    /** 임시 디렉터리를 저장 최상위 경로로 삼아 스토리지를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        storage = new RecordingFileStorage(properties(root));
    }

    /** 저장 키가 UUID 기반이고 원본 파일명을 포함하지 않는지 검증한다. */
    @Test
    void createsUuidStorageKeyWithoutOriginalFileName() {
        String key = storage.newStorageKey("webm", TODAY);

        assertThat(key).startsWith("2026/07/31/").endsWith(".webm");
        String fileName = key.substring(key.lastIndexOf('/') + 1);
        assertThat(fileName.replace(".webm", "")).hasSize(36);
        assertThat(storage.newStorageKey("webm", TODAY)).isNotEqualTo(key);
    }

    /** 저장한 파일이 최종 경로에 남고 임시 파일은 사라지는지 검증한다. */
    @Test
    void storesFileAtFinalPathAndLeavesNoTempFile() throws IOException {
        String key = storage.newStorageKey("mp4", TODAY);

        long written = storage.store(key, stream("녹화 내용"), MAX_SIZE);

        Path stored = root.resolve(key);
        assertThat(Files.isRegularFile(stored)).isTrue();
        assertThat(Files.readString(stored)).isEqualTo("녹화 내용");
        assertThat(written).isEqualTo("녹화 내용".getBytes(StandardCharsets.UTF_8).length);
        assertThat(tempFiles()).isEmpty();
    }

    /** 최대 크기를 넘으면 저장을 중단하고 최종 파일과 임시 파일을 남기지 않는지 검증한다. */
    @Test
    void rejectsOversizedStreamAndCleansUp() {
        String key = storage.newStorageKey("webm", TODAY);
        byte[] tooLarge = new byte[(int) MAX_SIZE + 1];

        assertThatThrownBy(() -> storage.store(key, new ByteArrayInputStream(tooLarge), MAX_SIZE))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.RECORDING_FILE_TOO_LARGE);

        assertThat(Files.exists(root.resolve(key))).isFalse();
        assertThat(tempFiles()).isEmpty();
    }

    /** 정확히 최대 크기인 파일은 저장되는지 검증한다. */
    @Test
    void storesFileAtExactlyMaxSize() {
        String key = storage.newStorageKey("webm", TODAY);
        byte[] exact = new byte[(int) MAX_SIZE];

        long written = storage.store(key, new ByteArrayInputStream(exact), MAX_SIZE);

        assertThat(written).isEqualTo(MAX_SIZE);
        assertThat(Files.exists(root.resolve(key))).isTrue();
    }

    /** 읽는 중 실패하면 임시 파일과 최종 파일을 남기지 않는지 검증한다. */
    @Test
    void cleansUpWhenSourceStreamFails() {
        String key = storage.newStorageKey("webm", TODAY);
        InputStream failing = new InputStream() {
            @Override
            public int read() throws IOException {
                throw new IOException("스트림 오류");
            }
        };

        assertThatThrownBy(() -> storage.store(key, failing, MAX_SIZE))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.RECORDING_STORAGE_FAILED);

        assertThat(Files.exists(root.resolve(key))).isFalse();
        assertThat(tempFiles()).isEmpty();
    }

    /** 상위 디렉터리로 탈출하려는 저장 키가 거부되는지 검증한다. */
    @Test
    void rejectsDirectoryTraversalKeys() {
        List<String> attacks = List.of(
                "../outside.webm",
                "2026/07/31/../../../outside.webm",
                "..\\..\\outside.webm",
                "./../outside.webm"
        );

        for (String attack : attacks) {
            assertThat(rejectedErrorCode(attack))
                    .as("탈출 키 %s 를 거부해야 한다", attack)
                    .isEqualTo(ErrorCode.RECORDING_NOT_FOUND);
        }
    }

    /** 빈 저장 키와 최상위 경로 자체를 가리키는 키가 거부되는지 검증한다. */
    @Test
    void rejectsBlankAndRootKeys() {
        List<String> invalid = List.of("", "   ", ".", "./");

        for (String key : invalid) {
            assertThatThrownBy(() -> storage.resolve(key))
                    .as("잘못된 키 %s", key)
                    .isInstanceOf(BusinessException.class);
        }
    }

    /** 절대 경로 저장 키가 최상위 경로 밖을 가리키면 거부되는지 검증한다. */
    @Test
    void rejectsAbsolutePathOutsideRoot() {
        Path outside = root.getParent().resolve("outside.webm").toAbsolutePath();

        assertThatThrownBy(() -> storage.resolve(outside.toString()))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.RECORDING_NOT_FOUND);
    }

    /** 파일이 없어도 삭제가 예외 없이 반복 실행되는지 검증한다. */
    @Test
    void deleteIsSafeToRepeat() {
        String key = storage.newStorageKey("webm", TODAY);
        storage.store(key, stream("내용"), MAX_SIZE);

        assertThat(storage.delete(key)).isTrue();
        assertThat(storage.delete(key)).isFalse();
        assertThat(storage.delete(key)).isFalse();
        assertThat(storage.exists(key)).isFalse();
    }

    /** 잘못된 키로 삭제해도 예외 없이 false를 돌려주는지 검증한다. */
    @Test
    void deleteReturnsFalseForInvalidKey() {
        assertThat(storage.delete("../outside.webm")).isFalse();
    }

    /** 저장된 파일 크기를 읽고 없는 파일은 재생 불가로 처리하는지 검증한다. */
    @Test
    void readsSizeAndRejectsMissingFile() {
        String stored = storage.newStorageKey("mp4", TODAY);
        storage.store(stored, stream("1234567890"), MAX_SIZE);
        String missing = storage.newStorageKey("mp4", TODAY);

        assertThat(storage.size(stored)).isEqualTo(10L);
        assertThatThrownBy(() -> storage.size(missing))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.RECORDING_NOT_AVAILABLE);
    }

    /** 저장 디렉터리가 없으면 만들어 두는지 검증한다. */
    @Test
    void createsStorageDirectoriesOnStartup() {
        Path nested = root.resolve("nested").resolve("uploads");

        RecordingFileStorage created = new RecordingFileStorage(properties(nested));

        assertThat(Files.isDirectory(nested)).isTrue();
        assertThat(created.storageRoot()).isEqualTo(nested.toAbsolutePath().normalize());
    }

    /**
     * 저장 키 해석이 거부되었을 때의 오류 코드를 돌려준다.
     *
     * <p>거부되지 않으면 어느 키가 통과했는지 알 수 있도록 null을 돌려준다.
     *
     * @param storageKey 검사할 저장 키
     * @return 거부 오류 코드이며 통과했으면 null
     */
    private ErrorCode rejectedErrorCode(String storageKey) {
        try {
            storage.resolve(storageKey);
            return null;
        } catch (BusinessException exception) {
            return exception.getErrorCode();
        }
    }

    /** 지정한 최상위 경로를 쓰는 설정을 만든다. */
    private RecordingStorageProperties properties(Path storageRoot) {
        return new RecordingStorageProperties(storageRoot.toString(), 7, 600L, 600_000L, MAX_SIZE);
    }

    /** 문자열을 입력 스트림으로 만든다. */
    private InputStream stream(String value) {
        return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));
    }

    /** 임시 디렉터리에 남아 있는 업로드 중 파일 목록을 읽는다. */
    private List<Path> tempFiles() {
        Path tempDirectory = root.resolve(".tmp");
        if (!Files.isDirectory(tempDirectory)) {
            return List.of();
        }
        try (var files = Files.list(tempDirectory)) {
            return files.toList();
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }
}

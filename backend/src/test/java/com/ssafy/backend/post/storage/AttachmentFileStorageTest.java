package com.ssafy.backend.post.storage;

import com.ssafy.backend.post.config.AttachmentStorageProperties;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 첨부파일 삭제 후 빈 날짜 디렉터리가 정리되는지 검증한다.
 *
 * <p>저장 키가 {@code yyyy/MM/dd} 구조라 정리하지 않으면 빈 디렉터리만 계속 쌓인다.
 */
class AttachmentFileStorageTest {

    private static final long MAX_SIZE = 1024L;
    private static final LocalDate TODAY = LocalDate.of(2026, 8, 3);

    @TempDir
    Path root;

    private AttachmentFileStorage storage;

    /** 임시 디렉터리를 저장 최상위 경로로 삼아 스토리지를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        storage = new AttachmentFileStorage(
                new AttachmentStorageProperties(root.toString(), MAX_SIZE));
    }

    /** 삭제로 비게 된 날짜 디렉터리가 최상위 경로까지 정리되는지 검증한다. */
    @Test
    void deleteRemovesEmptyDateDirectories() {
        String key = storage.newStorageKey("png", TODAY);
        storage.store(key, stream("내용"), MAX_SIZE);
        assertThat(Files.isDirectory(root.resolve("2026/08/03"))).isTrue();

        assertThat(storage.delete(key)).isTrue();

        assertThat(Files.exists(root.resolve("2026/08/03"))).isFalse();
        assertThat(Files.exists(root.resolve("2026/08"))).isFalse();
        assertThat(Files.exists(root.resolve("2026"))).isFalse();
        // 최상위 경로와 임시 디렉터리는 항상 남아 있어야 다음 업로드가 가능하다.
        assertThat(Files.isDirectory(root)).isTrue();
        assertThat(Files.isDirectory(root.resolve(".tmp"))).isTrue();
    }

    /** 같은 날짜에 다른 첨부가 남아 있으면 디렉터리를 지우지 않는지 검증한다. */
    @Test
    void keepsDateDirectoryWhenAnotherAttachmentRemains() {
        String first = storage.newStorageKey("png", TODAY);
        String second = storage.newStorageKey("pdf", TODAY);
        storage.store(first, stream("첫 번째"), MAX_SIZE);
        storage.store(second, stream("두 번째"), MAX_SIZE);

        storage.delete(first);

        assertThat(Files.isDirectory(root.resolve("2026/08/03"))).isTrue();
        assertThat(storage.exists(second)).isTrue();

        storage.delete(second);

        assertThat(Files.exists(root.resolve("2026"))).isFalse();
    }

    /** 다른 달의 첨부가 남아 있으면 연도 디렉터리를 지우지 않는지 검증한다. */
    @Test
    void keepsYearDirectoryWhenAnotherMonthRemains() {
        String august = storage.newStorageKey("png", TODAY);
        String september = storage.newStorageKey("png", LocalDate.of(2026, 9, 1));
        storage.store(august, stream("8월"), MAX_SIZE);
        storage.store(september, stream("9월"), MAX_SIZE);

        storage.delete(august);

        assertThat(Files.exists(root.resolve("2026/08"))).isFalse();
        assertThat(Files.isDirectory(root.resolve("2026/09/01"))).isTrue();
        assertThat(Files.isDirectory(root.resolve("2026"))).isTrue();
    }

    /** 파일이 이미 없어도 남은 빈 디렉터리를 정리하는지 검증한다. */
    @Test
    void prunesEmptyDirectoriesEvenWhenFileAlreadyGone() throws IOException {
        String key = storage.newStorageKey("png", TODAY);
        Files.createDirectories(root.resolve("2026/08/03"));

        assertThat(storage.delete(key)).isFalse();

        assertThat(Files.exists(root.resolve("2026"))).isFalse();
    }

    /** 정리 후 같은 날짜에 다시 업로드할 수 있는지 검증한다. */
    @Test
    void allowsUploadAfterDirectoryWasPruned() {
        String first = storage.newStorageKey("png", TODAY);
        storage.store(first, stream("첫 번째"), MAX_SIZE);
        storage.delete(first);
        assertThat(Files.exists(root.resolve("2026"))).isFalse();

        String second = storage.newStorageKey("png", TODAY);
        storage.store(second, stream("두 번째"), MAX_SIZE);

        assertThat(storage.exists(second)).isTrue();
    }

    /** 잘못된 저장 키로 삭제해도 예외 없이 false를 돌려주는지 검증한다. */
    @Test
    void deleteReturnsFalseForInvalidKey() {
        assertThat(storage.delete("../outside.png")).isFalse();
    }

    /** 문자열을 입력 스트림으로 만든다. */
    private InputStream stream(String value) {
        return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));
    }
}

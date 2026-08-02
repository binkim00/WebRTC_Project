package com.ssafy.backend.post.storage;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.post.config.AttachmentStorageProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 공지 첨부파일을 서버 디스크에 저장하고 읽고 지운다.
 *
 * <p>녹화 파일 저장과 같은 방식으로 설정된 최상위 경로 아래에만 파일을 둔다. 저장 경로에는 원본
 * 파일명을 쓰지 않고 UUID 기반 키를 사용하며, 모든 경로 계산은 최상위 경로를 벗어나지 않는지 검사한다.
 */
@Component
public class AttachmentFileStorage {

    private static final Logger log = LoggerFactory.getLogger(AttachmentFileStorage.class);

    /** 업로드 중인 파일을 두는 하위 디렉터리 이름이며 최종 경로와 같은 파일시스템을 쓴다. */
    private static final String TEMP_DIRECTORY = ".tmp";

    /** 업로드 중 임시 파일에 붙이는 접미사다. */
    private static final String TEMP_SUFFIX = ".part";

    private final Path storageRoot;

    /**
     * 설정된 최상위 경로를 절대 경로로 확정하고 저장 디렉터리를 준비한다.
     *
     * @param properties 첨부파일 저장 설정
     * @throws IllegalStateException 저장 디렉터리를 만들 수 없는 경우
     */
    public AttachmentFileStorage(AttachmentStorageProperties properties) {
        this.storageRoot = Paths.get(properties.storageRoot()).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.storageRoot);
            Files.createDirectories(this.storageRoot.resolve(TEMP_DIRECTORY));
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "첨부파일 저장 디렉터리를 준비하지 못했습니다: " + this.storageRoot, exception);
        }
        log.info("첨부파일 저장 경로를 사용합니다. path={}", this.storageRoot);
    }

    /**
     * 확장자를 유지한 UUID 기반 저장 키를 만든다.
     *
     * <p>한 디렉터리에 파일이 무한히 쌓이지 않도록 업로드 날짜로 하위 경로를 나눈다.
     * 파일명에는 사용자 입력을 넣지 않으므로 경로 조작 문자가 들어갈 수 없다.
     *
     * @param extension 확장자이며 점을 포함하지 않는다
     * @param today 저장 키에 사용할 날짜
     * @return {@code yyyy/MM/dd/<uuid>.<확장자>} 형태의 저장 키
     */
    public String newStorageKey(String extension, LocalDate today) {
        return "%04d/%02d/%02d/%s.%s".formatted(
                today.getYear(), today.getMonthValue(), today.getDayOfMonth(),
                UUID.randomUUID(), extension);
    }

    /**
     * 업로드 스트림을 임시 파일에 받은 뒤 최종 경로로 옮긴다.
     *
     * <p>중간에 실패하면 임시 파일을 지우고 최종 경로에는 아무것도 남기지 않는다.
     * 최대 크기를 넘으면 즉시 중단하므로 초과분을 디스크에 계속 쓰지 않는다.
     *
     * @param storageKey 저장 키
     * @param source 업로드 입력 스트림
     * @param maxSizeBytes 허용 최대 바이트
     * @return 실제 저장된 바이트 수
     * @throws BusinessException 최대 크기를 초과했거나 저장에 실패한 경우
     */
    public long store(String storageKey, InputStream source, long maxSizeBytes) {
        Path target = resolve(storageKey);
        Path temp = null;
        try {
            Files.createDirectories(target.getParent());
            temp = Files.createTempFile(
                    storageRoot.resolve(TEMP_DIRECTORY), "upload-", TEMP_SUFFIX);
            long written = copyWithLimit(source, temp, maxSizeBytes);
            move(temp, target);
            return written;
        } catch (BusinessException exception) {
            deleteQuietly(temp);
            throw exception;
        } catch (IOException exception) {
            deleteQuietly(temp);
            log.warn("첨부파일 저장에 실패했습니다. storageKey={}", storageKey, exception);
            throw new BusinessException(ErrorCode.ATTACHMENT_STORAGE_FAILED);
        }
    }

    /**
     * 저장 키에 해당하는 실제 파일 경로를 돌려준다.
     *
     * <p>저장 키는 서버가 만든 {@code yyyy/MM/dd/<uuid>.<확장자>} 형태뿐이므로 상위 참조나
     * 역슬래시가 들어 있으면 그 자체가 조작 신호로 보고 거부한다.
     *
     * @param storageKey 저장 키
     * @return 최상위 경로 안의 절대 경로
     * @throws BusinessException 저장 키가 비었거나 상위 참조를 담았거나 최상위 경로를 벗어나는 경우
     */
    public Path resolve(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            throw new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND);
        }
        if (storageKey.indexOf('\\') >= 0) {
            throw rejectedKey(storageKey);
        }
        for (Path element : Paths.get(storageKey)) {
            if (element.toString().equals("..")) {
                throw rejectedKey(storageKey);
            }
        }

        Path candidate = storageRoot.resolve(storageKey).normalize();
        if (!candidate.startsWith(storageRoot) || candidate.equals(storageRoot)) {
            throw rejectedKey(storageKey);
        }
        return candidate;
    }

    /**
     * 저장된 파일이 실제로 존재하는지 확인한다.
     *
     * @param storageKey 저장 키
     * @return 일반 파일로 존재하면 true
     */
    public boolean exists(String storageKey) {
        return Files.isRegularFile(resolve(storageKey));
    }

    /**
     * 저장된 파일 크기를 읽는다.
     *
     * @param storageKey 저장 키
     * @return 파일 크기(바이트)
     * @throws BusinessException 파일이 없거나 읽을 수 없는 경우
     */
    public long size(String storageKey) {
        try {
            return Files.size(resolve(storageKey));
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND);
        }
    }

    /**
     * 저장된 파일을 지운다.
     *
     * <p>파일이 이미 없어도 예외를 던지지 않아 실패 정리를 여러 번 실행해도 안전하다.
     *
     * @param storageKey 저장 키
     * @return 이번 호출로 실제 파일을 지웠으면 true
     */
    public boolean delete(String storageKey) {
        Path target;
        try {
            target = resolve(storageKey);
        } catch (BusinessException exception) {
            // 잘못된 키는 지울 대상이 없는 것과 같게 처리한다.
            return false;
        }

        try {
            return Files.deleteIfExists(target);
        } catch (IOException exception) {
            log.warn("첨부파일 삭제에 실패했습니다. storageKey={}", storageKey, exception);
            return false;
        }
    }

    /** 저장 최상위 경로를 반환한다. */
    public Path storageRoot() {
        return storageRoot;
    }

    /**
     * 허용하지 않는 저장 키를 기록하고 없는 파일과 같은 오류를 만든다.
     *
     * @param storageKey 거부한 저장 키
     * @return 던질 예외
     */
    private BusinessException rejectedKey(String storageKey) {
        log.warn("허용하지 않는 첨부파일 저장 키를 거부했습니다. storageKey={}", storageKey);
        return new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    /**
     * 최대 크기를 넘지 않는 범위에서 스트림을 임시 파일로 복사한다.
     *
     * @param source 업로드 입력 스트림
     * @param temp 임시 파일 경로
     * @param maxSizeBytes 허용 최대 바이트
     * @return 복사한 바이트 수
     * @throws BusinessException 허용 크기를 초과한 경우
     * @throws IOException 복사에 실패한 경우
     */
    private long copyWithLimit(InputStream source, Path temp, long maxSizeBytes)
            throws IOException {
        long written = 0L;
        byte[] buffer = new byte[8192];
        try (var output = Files.newOutputStream(
                temp, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
            int read;
            while ((read = source.read(buffer)) != -1) {
                written += read;
                if (written > maxSizeBytes) {
                    throw new BusinessException(ErrorCode.ATTACHMENT_FILE_TOO_LARGE);
                }
                output.write(buffer, 0, read);
            }
        }
        return written;
    }

    /**
     * 임시 파일을 최종 경로로 옮긴다.
     *
     * <p>같은 파일시스템이면 원자적으로 옮기고, 지원하지 않는 환경에서는 대체 이동으로 처리한다.
     *
     * @param temp 임시 파일 경로
     * @param target 최종 경로
     * @throws IOException 이동에 실패한 경우
     */
    private void move(Path temp, Path target) throws IOException {
        try {
            Files.move(temp, target,
                    StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /**
     * 실패한 업로드의 임시 파일을 조용히 지운다.
     *
     * @param temp 임시 파일 경로이며 아직 만들어지지 않았으면 null
     */
    private void deleteQuietly(Path temp) {
        if (temp == null) {
            return;
        }
        try {
            Files.deleteIfExists(temp);
        } catch (IOException exception) {
            log.warn("실패한 업로드의 임시 파일을 지우지 못했습니다. path={}", temp, exception);
        }
    }
}

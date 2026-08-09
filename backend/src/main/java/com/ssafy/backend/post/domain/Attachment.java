package com.ssafy.backend.post.domain;

import com.ssafy.backend.common.entity.BaseCreatedTimeEntity;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 게시글에 연결된 이미지와 파일의 저장 정보를 관리하는 엔티티다.
 *
 * <p>첨부파일은 공지를 작성하기 전에 먼저 업로드하므로 생성 시점에는 연결된 게시글이 없다.
 * 그래서 {@code post_id}는 비어 있을 수 있으며, 공지 작성·수정에서 {@code attachmentIds}로
 * 연결될 때 채워진다. 아직 연결되지 않은 파일에 아무나 접근하지 못하도록 업로더를 함께 저장한다.
 */
@Getter
@Entity
@Table(name = "attachments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Attachment extends BaseCreatedTimeEntity {

    /** 아직 게시글에 연결되지 않은 첨부파일이 사용하는 표시 순서다. */
    private static final int UNASSIGNED_DISPLAY_ORDER = 0;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "attachment_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "post_id")
    private Post post;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "uploader_user_id", nullable = false)
    private User uploader;

    @Column(name = "original_file_name", nullable = false, length = 255)
    private String originalFileName;

    @Column(name = "storage_key", nullable = false, unique = true, length = 500)
    private String storageKey;

    @Column(name = "file_size_bytes", nullable = false)
    private Long fileSizeBytes;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * 아직 게시글에 연결되지 않은 첨부파일을 초기화한다.
     *
     * @param uploader 파일을 올린 사용자
     * @param originalFileName 업로드 당시 원본 파일명
     * @param storageKey 서버 디스크 저장 키
     * @param fileSizeBytes 실제 저장된 파일 크기(바이트)
     * @param mimeType 파일 MIME type
     */
    private Attachment(User uploader, String originalFileName, String storageKey,
                       long fileSizeBytes, String mimeType) {
        this.post = null;
        this.uploader = Objects.requireNonNull(uploader);
        this.originalFileName = Objects.requireNonNull(originalFileName);
        this.storageKey = Objects.requireNonNull(storageKey);
        this.fileSizeBytes = fileSizeBytes;
        this.mimeType = Objects.requireNonNull(mimeType);
        this.displayOrder = UNASSIGNED_DISPLAY_ORDER;
        this.deletedAt = null;
    }

    /**
     * 공지 작성 전에 업로드된 첨부파일을 생성한다(ATTACH-001).
     *
     * <p>업로드 시점에는 연결할 공지가 없으므로 게시글 없이 저장하고, 나중에
     * {@link #attachTo(Post, int)}로 공지에 연결한다.
     *
     * @param uploader 파일을 올린 사용자
     * @param originalFileName 업로드 당시 원본 파일명
     * @param storageKey 서버 디스크 저장 키
     * @param fileSizeBytes 실제 저장된 파일 크기(바이트)
     * @param mimeType 파일 MIME type
     * @return 게시글에 연결되지 않은 첨부파일
     */
    public static Attachment createUploaded(User uploader, String originalFileName,
                                            String storageKey, long fileSizeBytes,
                                            String mimeType) {
        return new Attachment(uploader, originalFileName, storageKey, fileSizeBytes, mimeType);
    }

    /**
     * 업로드된 첨부파일을 게시글에 연결하고 표시 순서를 지정한다.
     *
     * <p>이미 다른 게시글에 연결된 파일을 다시 연결하면 원래 게시글에서 첨부가 사라지므로
     * 연결되지 않은 파일만 허용한다.
     *
     * @param post 연결할 게시글
     * @param displayOrder 화면 표시 순서
     * @throws IllegalStateException 이미 삭제되었거나 다른 게시글에 연결된 경우
     */
    public void attachTo(Post post, int displayOrder) {
        if (deletedAt != null) {
            throw new IllegalStateException("삭제된 첨부파일은 연결할 수 없습니다.");
        }
        if (this.post != null) {
            throw new IllegalStateException("이미 게시글에 연결된 첨부파일입니다.");
        }
        this.post = Objects.requireNonNull(post);
        this.displayOrder = displayOrder;
    }

    /**
     * 이미 연결된 첨부파일의 표시 순서를 바꾼다.
     *
     * <p>공지 수정에서 첨부 순서만 달라진 경우에 사용한다.
     *
     * @param displayOrder 새 표시 순서
     * @throws IllegalStateException 삭제되었거나 아직 게시글에 연결되지 않은 경우
     */
    public void changeDisplayOrder(int displayOrder) {
        if (deletedAt != null) {
            throw new IllegalStateException("삭제된 첨부파일은 순서를 바꿀 수 없습니다.");
        }
        if (this.post == null) {
            throw new IllegalStateException("게시글에 연결된 첨부파일만 순서를 바꿀 수 있습니다.");
        }
        this.displayOrder = displayOrder;
    }

    /**
     * 첨부파일을 게시글에서 떼어내고 삭제 상태로 바꾼다.
     *
     * <p>공지 수정에서 첨부 목록에 빠졌거나 공지가 삭제된 경우에 사용한다. 실제 행과 파일은
     * 남기고 삭제 시각만 기록해 조회에서 제외한다.
     *
     * @param deletedAt 삭제 시각
     * @throws IllegalStateException 이미 삭제된 경우
     */
    public void softDelete(LocalDateTime deletedAt) {
        if (this.deletedAt != null) {
            throw new IllegalStateException("이미 삭제된 첨부파일입니다.");
        }
        this.deletedAt = Objects.requireNonNull(deletedAt);
    }

    /**
     * 게시글에 연결된 첨부파일인지 확인한다.
     *
     * @return 연결된 게시글이 있으면 true
     */
    public boolean isAttached() {
        return post != null;
    }

    /**
     * 삭제 처리된 첨부파일인지 확인한다.
     *
     * @return 삭제 시각이 기록되어 있으면 true
     */
    public boolean isDeleted() {
        return deletedAt != null;
    }

    /**
     * 지정한 사용자가 이 첨부파일을 올린 사람인지 확인한다.
     *
     * @param user 확인할 사용자이며 비로그인 조회는 null
     * @return 업로더 본인이면 true
     */
    public boolean isUploadedBy(User user) {
        return user != null && uploader.getId().equals(user.getId());
    }
}

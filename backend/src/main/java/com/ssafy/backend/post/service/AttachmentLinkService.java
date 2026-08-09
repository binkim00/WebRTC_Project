package com.ssafy.backend.post.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 공지에 업로드된 첨부파일을 연결하고 해제한다(ATTACH-001).
 *
 * <p>공지 작성·수정이 받은 {@code attachmentIds}를 그대로 연결 상태로 만든다. 이 서비스는
 * 별도 트랜잭션을 열지 않고 호출한 공지 작성·수정 트랜잭션에 참여하므로, 첨부 연결이 실패하면
 * 공지 저장도 함께 롤백된다.
 */
@Service
public class AttachmentLinkService {

    /** 첨부파일 표시 순서의 시작 값이다. */
    private static final int FIRST_DISPLAY_ORDER = 1;

    private final AttachmentRepository attachmentRepository;

    /**
     * 첨부파일 저장소를 주입받는다.
     *
     * @param attachmentRepository 첨부파일 저장소
     */
    public AttachmentLinkService(AttachmentRepository attachmentRepository) {
        this.attachmentRepository = attachmentRepository;
    }

    /**
     * 요청한 첨부파일 목록이 게시글의 연결 상태 전체가 되도록 맞춘다.
     *
     * <p>목록에서 빠진 기존 첨부는 해제와 함께 삭제 처리하고, 새로 들어온 첨부는 연결하며,
     * 남아 있는 첨부는 보낸 순서대로 표시 순서를 다시 매긴다. {@code requestedIds}가 null이면
     * 첨부를 바꾸지 않으며, 빈 목록이면 연결된 첨부가 모두 해제된다.
     *
     * @param post 첨부를 연결할 게시글이며 이미 저장되어 식별자가 있어야 한다
     * @param requestedIds 연결할 첨부파일 식별자 목록이며 유지하려면 null
     * @param actor 공지를 작성·수정하는 사용자
     * @param now 해제된 첨부에 기록할 삭제 시각
     * @throws BusinessException 첨부가 없거나 중복이거나 다른 게시글·다른 업로더의 첨부인 경우
     */
    public void replaceLinks(Post post, List<Long> requestedIds, User actor, LocalDateTime now) {
        if (requestedIds == null) {
            return;
        }

        Set<Long> uniqueIds = requireUniqueIds(requestedIds);
        Map<Long, Attachment> requested = loadRequested(uniqueIds);
        detachMissing(post, uniqueIds, now);

        int displayOrder = FIRST_DISPLAY_ORDER;
        for (Long attachmentId : uniqueIds) {
            attach(post, requested.get(attachmentId), actor, displayOrder);
            displayOrder++;
        }
    }

    /**
     * 요청 목록에 같은 첨부파일이 중복해서 들어오지 않았는지 확인한다.
     *
     * @param requestedIds 연결할 첨부파일 식별자 목록
     * @return 보낸 순서를 유지한 식별자 집합
     * @throws BusinessException 같은 식별자가 두 번 이상 들어온 경우
     */
    private Set<Long> requireUniqueIds(List<Long> requestedIds) {
        Set<Long> uniqueIds = new LinkedHashSet<>(requestedIds);
        if (uniqueIds.size() != requestedIds.size()) {
            throw new BusinessException(ErrorCode.ATTACHMENT_DUPLICATED);
        }
        return uniqueIds;
    }

    /**
     * 요청한 첨부파일을 모두 조회한다.
     *
     * @param attachmentIds 연결할 첨부파일 식별자 집합
     * @return 식별자로 찾을 수 있는 첨부파일 맵
     * @throws BusinessException 삭제되었거나 존재하지 않는 첨부파일이 있는 경우
     */
    private Map<Long, Attachment> loadRequested(Set<Long> attachmentIds) {
        if (attachmentIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Attachment> found = new HashMap<>();
        for (Attachment attachment : attachmentRepository
                .findAllByIdInAndDeletedAtIsNull(attachmentIds)) {
            found.put(attachment.getId(), attachment);
        }
        if (found.size() != attachmentIds.size()) {
            throw new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND);
        }
        return found;
    }

    /**
     * 요청 목록에서 빠진 기존 첨부를 해제하고 삭제 처리한다.
     *
     * @param post 대상 게시글
     * @param requestedIds 이번 요청이 유지하려는 첨부파일 식별자 집합
     * @param now 삭제 시각
     */
    private void detachMissing(Post post, Set<Long> requestedIds, LocalDateTime now) {
        Set<Long> keeping = new HashSet<>(requestedIds);
        for (Attachment attachment : attachmentRepository
                .findAllByPost_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(post.getId())) {
            if (!keeping.contains(attachment.getId())) {
                attachment.softDelete(now);
            }
        }
    }

    /**
     * 첨부파일을 게시글에 연결하거나 이미 연결되어 있으면 표시 순서만 바꾼다.
     *
     * <p>다른 사람이 올린 첨부를 가로채 붙이지 못하도록, 아직 연결되지 않은 첨부는 업로더
     * 본인만 연결할 수 있다. 다른 게시글에 이미 연결된 첨부는 재사용할 수 없다.
     *
     * @param post 대상 게시글
     * @param attachment 연결할 첨부파일
     * @param actor 공지를 작성·수정하는 사용자
     * @param displayOrder 지정할 표시 순서
     * @throws BusinessException 다른 게시글에 연결되었거나 업로더 본인이 아닌 경우
     */
    private void attach(Post post, Attachment attachment, User actor, int displayOrder) {
        if (attachment.isAttached()) {
            if (!post.getId().equals(attachment.getPost().getId())) {
                throw new BusinessException(ErrorCode.ATTACHMENT_ALREADY_ATTACHED);
            }
            attachment.changeDisplayOrder(displayOrder);
            return;
        }
        if (!attachment.isUploadedBy(actor)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        attachment.attachTo(post, displayOrder);
    }
}

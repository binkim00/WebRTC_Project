package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.post.domain.CommentReport;
import com.ssafy.backend.post.domain.PostComment;
import com.ssafy.backend.post.dto.CommentReportCreateRequest;
import com.ssafy.backend.post.dto.CommentReportCreateResponse;
import com.ssafy.backend.post.repository.CommentReportRepository;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.LocalDateTime;

/** 댓글 신고 접수를 처리한다. */
@Service
public class CommentReportService {

    private final CurrentUserService currentUserService;
    private final PostCommentRepository postCommentRepository;
    private final CommentReportRepository commentReportRepository;
    private final Clock clock;

    /**
     * 신고 접수에 필요한 사용자 서비스와 댓글·신고 저장소, 서버 시계를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param postCommentRepository 댓글 저장소
     * @param commentReportRepository 댓글 신고 저장소
     * @param clock 신고 접수 시각을 계산할 서버 시계
     */
    public CommentReportService(CurrentUserService currentUserService,
                                PostCommentRepository postCommentRepository,
                                CommentReportRepository commentReportRepository,
                                Clock clock) {
        this.currentUserService = currentUserService;
        this.postCommentRepository = postCommentRepository;
        this.commentReportRepository = commentReportRepository;
        this.clock = clock;
    }

    /**
     * 로그인 사용자가 다른 사용자의 댓글을 신고해 접수 상태로 저장한다(COMMENT-004).
     *
     * <p>{@code comment_reports}의 유니크 제약이 확정되지 않았으므로(D-ERD-3)
     * 애플리케이션 계층에서 같은 사용자의 중복 신고를 차단한다.
     *
     * @param commentId 신고 대상 댓글 식별자
     * @param request 신고 사유와 상세 설명을 담은 요청
     * @param principal 로그인 사용자 정보
     * @return 접수된 신고 정보
     * @throws BusinessException 댓글이 없거나 본인 댓글이거나 이미 신고한 경우
     */
    @Transactional
    public CommentReportCreateResponse reportComment(Long commentId,
                                                     CommentReportCreateRequest request,
                                                     AuthenticatedUser principal) {
        User reporter = currentUserService.requireActiveUser(principal);
        PostComment comment = requireReportableComment(commentId);
        if (comment.getAuthor().getId().equals(reporter.getId())) {
            throw new BusinessException(ErrorCode.SELF_COMMENT_REPORT_NOT_ALLOWED);
        }
        if (commentReportRepository.existsByComment_IdAndReporter_Id(commentId, reporter.getId())) {
            throw new BusinessException(ErrorCode.COMMENT_REPORT_ALREADY_EXISTS);
        }

        LocalDateTime reportedAt = LocalDateTime.now(clock);
        CommentReport report = CommentReport.receive(
                comment, reporter, request.reason().trim(), normalizeDetail(request.detail()), reportedAt
        );
        return CommentReportCreateResponse.from(commentReportRepository.save(report));
    }

    /**
     * 신고할 수 있는 댓글을 조회한다.
     *
     * <p>삭제되거나 이미 숨겨진 댓글은 목록에 노출되지 않으므로 신고 대상으로 취급하지 않는다.
     *
     * @param commentId 댓글 식별자
     * @return 노출 가능한 댓글
     * @throws BusinessException 댓글이 없거나 삭제·숨김 상태인 경우
     */
    private PostComment requireReportableComment(Long commentId) {
        PostComment comment = postCommentRepository.findDetailById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));
        if (!comment.isVisibleToPublic()) {
            throw new BusinessException(ErrorCode.COMMENT_NOT_FOUND);
        }
        return comment;
    }

    /**
     * 선택 값인 상세 설명을 정리하고 내용이 없으면 null로 만든다.
     *
     * @param detail 요청으로 받은 상세 설명
     * @return 앞뒤 공백을 제거한 상세 설명이며 내용이 없으면 null
     */
    private String normalizeDetail(String detail) {
        if (!StringUtils.hasText(detail)) {
            return null;
        }
        return detail.trim();
    }
}

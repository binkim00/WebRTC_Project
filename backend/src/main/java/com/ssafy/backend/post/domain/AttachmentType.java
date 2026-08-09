package com.ssafy.backend.post.domain;

/**
 * 첨부파일을 어떤 기능에서 사용할지 구분하는 업로드 유형이다.
 *
 * <p>MVP에서는 첨부를 공지에만 허용하므로 {@link #NOTICE}만 사용한다. 문의 첨부처럼 다른 유형이
 * 생기면 그 도메인을 구현할 때 ERD와 함께 값을 추가한다. 업로드 요청을 검증하는 값이며 어떤
 * 게시글에 연결되었는지는 {@code attachments.post_id}가 이미 나타내므로 별도 컬럼으로 두지 않는다.
 */
public enum AttachmentType {

    /** 서비스 공지와 팬미팅 공지에 첨부하는 파일이다. */
    NOTICE
}

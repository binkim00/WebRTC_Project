package com.ssafy.backend.post.domain;

/**
 * 첨부파일을 어떤 기능에서 사용할지 구분하는 업로드 유형이다.
 *
 * <p>처음에는 공지 첨부만 있었고 어떤 게시글에 붙었는지는 {@code attachments.post_id}가
 * 알려 주므로 유형을 저장하지 않았다. 지금은 게시글에 붙지 않는
 * {@link #MEETING_COVER}가 생겨 {@code post_id}만으로는 용도를 알 수 없으므로
 * {@code attachments.attachment_type}에 함께 저장한다. 저장한 유형은 업로드 요청 검증뿐
 * 아니라 콘텐츠 조회의 공개 여부 판정({@link #isPubliclyReadable()})에도 사용한다.
 */
public enum AttachmentType {

    /** 서비스 공지와 팬미팅 공지에 첨부하는 파일이다. */
    NOTICE(false),

    /** 커뮤니티 게시글에 첨부하는 파일이다. */
    COMMUNITY(false),

    /**
     * 팬미팅 커버 이미지로 사용하는 파일이다.
     *
     * <p>게시글에 연결하지 않고 업로드 응답의 콘텐츠 URL을
     * {@code fan_meetings.cover_image_url}에 넣어 쓴다. 커버 이미지는 비로그인 팬에게도
     * 보여야 하는데 연결된 게시글이 없어 공개 여부를 판정할 근거가 없으므로 유형 자체를
     * 공개로 둔다. 대신 이미지 형식만 업로드할 수 있게 제한한다.
     */
    MEETING_COVER(true);

    private final boolean publiclyReadable;

    /**
     * 유형별 공개 조회 허용 여부로 첨부 유형을 초기화한다.
     *
     * @param publiclyReadable 연결된 게시글과 무관하게 누구나 내려받을 수 있으면 true
     */
    AttachmentType(boolean publiclyReadable) {
        this.publiclyReadable = publiclyReadable;
    }

    /**
     * 연결된 게시글의 공개 여부와 무관하게 누구나 내려받을 수 있는 유형인지 확인한다.
     *
     * @return 유형 자체가 공개면 true
     */
    public boolean isPubliclyReadable() {
        return publiclyReadable;
    }

    /**
     * 이미지 파일만 업로드할 수 있는 유형인지 확인한다.
     *
     * <p>커버 이미지는 화면에 {@code <img>}로 그려지므로 PDF를 받아도 쓸 수 없다.
     *
     * @return 이미지 형식만 허용하면 true
     */
    public boolean requiresImage() {
        return this == MEETING_COVER;
    }

    /**
     * 이 유형의 첨부를 연결할 수 있는 게시글 유형인지 확인한다.
     *
     * <p>공지에 올린 파일을 커뮤니티 글에 가로채 붙이는 것처럼 용도가 어긋난 연결을 막는다.
     * 게시글에 붙일 수 없는 {@link #MEETING_COVER}는 어떤 게시글에도 연결할 수 없다.
     *
     * @param postType 연결하려는 게시글 유형
     * @return 연결을 허용하는 조합이면 true
     */
    public boolean canAttachTo(PostType postType) {
        return switch (this) {
            case NOTICE -> postType == PostType.SERVICE_NOTICE || postType == PostType.MEETING_NOTICE;
            case COMMUNITY -> postType == PostType.COMMUNITY;
            case MEETING_COVER -> false;
        };
    }
}

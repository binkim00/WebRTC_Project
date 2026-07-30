package com.ssafy.backend.influencer.dto;

/**
 * 팬 메모 내용의 입력 제한 정책이다.
 * 메모 작성 화면의 입력 상한과 같은 값을 사용해 화면과 API 검증 기준을 일치시킨다.
 */
public final class FanMemoContentPolicy {

    /** 메모 내용의 최대 글자 수다. */
    public static final int MAX_LENGTH = 300;

    /** 상수 모음 클래스이므로 인스턴스를 만들지 못하게 한다. */
    private FanMemoContentPolicy() {
    }
}

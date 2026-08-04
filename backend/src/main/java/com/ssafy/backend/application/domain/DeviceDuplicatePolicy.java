package com.ssafy.backend.application.domain;

/**
 * 같은 기기 토큰으로 다른 계정이 이미 응모했을 때의 처리 정책이다.
 *
 * <p>기기 토큰은 사람 단위 식별이 아니라 보조 위험 신호다. 공용 PC와 가족 기기에서 오탐이
 * 생기므로 기본값은 {@link #FLAG}이며, 경쟁이 과열된 이벤트에서만 {@link #BLOCK}을 검토한다.
 */
public enum DeviceDuplicatePolicy {

    /** 응모를 허용하고 의심 기록만 남긴다. */
    FLAG,

    /** 응모를 거부한다. */
    BLOCK
}

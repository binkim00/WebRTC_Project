package com.ssafy.backend.application.domain;

/**
 * 응모의 부정 사용 의심 상태다.
 *
 * <p>기기 토큰은 사람 단위 식별자가 아니라 보조 신호이므로, 기본 정책에서는 차단하지 않고
 * 의심 표시만 남긴다. 공용 PC와 가족 기기의 정상 응모를 오탐으로 막지 않기 위해서다.
 */
public enum ApplicationRiskStatus {

    /** 의심 신호가 없는 일반 응모다. */
    NONE,

    /** 같은 팬미팅에서 다른 계정이 같은 기기 토큰을 사용한 의심 응모다. */
    FLAGGED
}

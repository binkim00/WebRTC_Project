package com.ssafy.backend.application.domain;

/**
 * 같은 팬미팅에서 다른 계정이 같은 기기 토큰으로 응모했을 때의 처리 정책이다.
 *
 * <p>기본값은 {@link #FLAG}다. 기기 토큰 하나만으로 자동 차단하면 공용 PC나 가족 기기의
 * 정상 사용자가 막히므로, 운영 데이터가 쌓이기 전까지는 탐지·표시만 한다.
 */
public enum DeviceDuplicatePolicy {

    /** 응모는 그대로 접수하고 의심 상태로만 표시한다. */
    FLAG,

    /** 응모를 거부한다. 경쟁이 과열된 이벤트에서만 검토한다. */
    BLOCK
}

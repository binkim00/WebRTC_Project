package com.ssafy.backend.common.support;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;

/** 요청 제한에 사용할 클라이언트 IP를 추출한다. */
public final class ClientIpResolver {

    private static final String FORWARDED_FOR_HEADER = "X-Forwarded-For";
    private static final String UNKNOWN = "unknown";

    /** 유틸리티 클래스이므로 인스턴스를 만들지 못하게 한다. */
    private ClientIpResolver() {
    }

    /**
     * 리버스 프록시를 거친 요청에서도 원 클라이언트 IP를 얻는다.
     *
     * <p>운영은 nginx가 {@code X-Forwarded-For}를 붙이므로 그 값의 첫 항목을 쓴다.
     * 헤더가 없으면 직접 접속으로 보고 원격 주소를 사용한다.
     *
     * @param request 현재 HTTP 요청
     * @return 클라이언트 IP이며 판별할 수 없으면 {@code unknown}
     */
    public static String resolve(HttpServletRequest request) {
        String forwardedFor = request.getHeader(FORWARDED_FOR_HEADER);
        if (StringUtils.hasText(forwardedFor)) {
            // 프록시를 여러 번 거치면 쉼표로 이어지며 맨 앞이 최초 요청자다.
            String first = forwardedFor.split(",")[0].trim();
            if (StringUtils.hasText(first)) {
                return first;
            }
        }
        String remoteAddress = request.getRemoteAddr();
        return StringUtils.hasText(remoteAddress) ? remoteAddress : UNKNOWN;
    }
}

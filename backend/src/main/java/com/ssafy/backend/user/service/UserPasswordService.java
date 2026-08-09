package com.ssafy.backend.user.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.LogoutService;
import com.ssafy.backend.auth.support.PasswordPolicy;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.dto.PasswordChangeRequest;
import com.ssafy.backend.user.dto.PasswordChangeResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 로그인한 사용자가 현재 비밀번호를 확인하고 새 비밀번호로 바꾸는 흐름을 처리한다. */
@Service
public class UserPasswordService {

    private final CurrentUserService currentUserService;
    private final PasswordEncoder passwordEncoder;
    private final LogoutService logoutService;
    private final Clock clock;

    /**
     * 본인 확인과 세션 종료에 필요한 협력 객체를 주입받는다.
     *
     * @param currentUserService 인증 사용자를 활성 사용자로 조회하는 서비스
     * @param passwordEncoder 비밀번호 비교기 겸 암호화기
     * @param logoutService 변경 후 세션을 끊을 로그아웃 서비스
     * @param clock 변경 시각 계산용 시계
     */
    public UserPasswordService(CurrentUserService currentUserService,
                               PasswordEncoder passwordEncoder,
                               LogoutService logoutService,
                               Clock clock) {
        this.currentUserService = currentUserService;
        this.passwordEncoder = passwordEncoder;
        this.logoutService = logoutService;
        this.clock = clock;
    }

    /**
     * 현재 비밀번호를 확인한 뒤 새 비밀번호로 교체하고 로그인 세션을 끊는다.
     *
     * <p>세션을 유지한 채 비밀번호만 바꾸면, 비밀번호가 새어 나갔다고 판단해 바꾼 경우에도 이미
     * 로그인해 있는 침입자를 내보내지 못한다. 단일 세션 구조라 세션 하나를 끊으면 모든 기기가 함께 끊긴다.
     *
     * @param request 현재 비밀번호와 새 비밀번호
     * @param accessToken 현재 요청에 사용된 Access Token
     * @param principal JWT 인증 사용자 정보
     * @return 변경 시각과 재로그인 필요 여부
     * @throws BusinessException 소셜 전용 계정이거나, 현재 비밀번호가 다르거나,
     *         새 비밀번호가 정책을 만족하지 않거나 현재 비밀번호와 같은 경우
     */
    @Transactional
    public PasswordChangeResponse changePassword(PasswordChangeRequest request, String accessToken,
                                                 AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.isSocialOnly()) {
            throw new BusinessException(ErrorCode.PASSWORD_CHANGE_NOT_AVAILABLE);
        }
        if (!passwordEncoder.matches(request.currentPassword(), user.getPassword())) {
            throw new BusinessException(ErrorCode.USER_PASSWORD_MISMATCH);
        }
        PasswordPolicy.validate(request.newPassword());
        if (passwordEncoder.matches(request.newPassword(), user.getPassword())) {
            throw new BusinessException(ErrorCode.PASSWORD_SAME_AS_CURRENT);
        }

        user.changePassword(passwordEncoder.encode(request.newPassword()));
        // Redis 작업은 트랜잭션 롤백 대상이 아니다. 이후 커밋이 실패하면 비밀번호는 그대로이고
        // 세션만 끊겨 재로그인이 필요한데, 사용자가 복구할 수 있는 상태라 허용한다.
        logoutService.logout(accessToken);
        return PasswordChangeResponse.of(LocalDateTime.now(clock));
    }
}

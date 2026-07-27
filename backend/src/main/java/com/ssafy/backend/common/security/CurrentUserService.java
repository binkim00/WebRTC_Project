package com.ssafy.backend.common.security;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** JWT principal을 현재 활성 사용자 엔티티로 변환한다. */
@Service
public class CurrentUserService {
    private final UserRepository userRepository;

    /** 사용자 저장소를 주입받는다. */
    public CurrentUserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * 인증 principal에 해당하는 활성 사용자를 조회한다.
     *
     * @param principal JWT 인증 필터가 생성한 사용자 정보
     * @return 활성 상태의 사용자
     * @throws BusinessException principal이 없거나 사용자가 활성 상태가 아닌 경우
     */
    @Transactional(readOnly = true)
    public User requireActiveUser(AuthenticatedUser principal) {
        if (principal == null) {
            throw new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED);
        }
        User user = userRepository.findById(principal.userId())
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVE_USER_NOT_FOUND));
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.ACTIVE_USER_NOT_FOUND);
        }
        return user;
    }
}

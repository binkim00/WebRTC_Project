package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.AvailabilityResponse;
import com.ssafy.backend.auth.dto.AvailabilityTarget;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회원가입 화면에서 아이디·닉네임이 이미 쓰이고 있는지 미리 확인한다.
 *
 * <p>가입 요청을 보내야만 중복을 알 수 있으면 사용자는 폼을 모두 채운 뒤에야 되돌아가야 한다.
 * 확인 결과는 그 순간의 상태이므로 가입 시점에 {@link SignupService}가 같은 검사를 다시 한다.
 */
@Service
public class AccountAvailabilityService {

    /** 로그인 ID 최대 길이이며 {@code users.login_id} 컬럼 길이와 같다. */
    private static final int MAX_LOGIN_ID_LENGTH = 100;

    /** 닉네임 최대 길이이며 {@code users.nickname} 컬럼 길이와 같다. */
    private static final int MAX_NICKNAME_LENGTH = 50;

    private final UserRepository userRepository;

    /**
     * 중복 여부를 조회할 사용자 저장소를 주입받는다.
     *
     * @param userRepository 사용자 저장소
     */
    public AccountAvailabilityService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * 전달된 값이 지금 가입에 사용할 수 있는 값인지 확인한다.
     *
     * @param rawTarget 확인할 항목 문자열(LOGIN_ID·NICKNAME)
     * @param rawValue 확인할 값
     * @return 정규화한 값과 사용 가능 여부
     * @throws BusinessException 항목이 지원 범위를 벗어났거나 값이 비어 있거나 길이를 초과한 경우
     */
    @Transactional(readOnly = true)
    public AvailabilityResponse check(String rawTarget, String rawValue) {
        AvailabilityTarget target = AvailabilityTarget.from(rawTarget)
                .orElseThrow(() -> new BusinessException(ErrorCode.DUPLICATE_CHECK_TARGET_NOT_SUPPORTED));
        // 가입에서도 앞뒤 공백을 제거한 값을 저장하므로 같은 값으로 확인해야 결과가 어긋나지 않는다.
        String value = rawValue == null ? "" : rawValue.trim();
        if (value.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }

        return switch (target) {
            case LOGIN_ID -> {
                requireWithinLength(value, MAX_LOGIN_ID_LENGTH);
                yield AvailabilityResponse.of(target, value, !userRepository.existsByLoginId(value));
            }
            case NICKNAME -> {
                requireWithinLength(value, MAX_NICKNAME_LENGTH);
                yield AvailabilityResponse.of(target, value, !userRepository.existsByNickname(value));
            }
        };
    }

    /**
     * 저장할 수 없는 길이의 값을 미리 거부한다.
     *
     * <p>길이를 넘긴 값을 "사용 가능"으로 돌려주면 가입 단계에서야 실패한다.
     *
     * @param value 확인할 값
     * @param maxLength 허용 최대 길이
     * @throws BusinessException 값이 최대 길이를 넘은 경우
     */
    private void requireWithinLength(String value, int maxLength) {
        if (value.length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}

package com.ssafy.backend.user.service;

import com.ssafy.backend.auth.exception.DuplicateEmailException;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.dto.MyProfileResponse;
import com.ssafy.backend.user.dto.MyProfileUpdateRequest;
import com.ssafy.backend.user.dto.MyProfileUpdateResponse;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

/** 현재 사용자의 공통 회원 정보 조회와 부분 수정을 처리한다. */
@Service
public class UserProfileService {

    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;

    /**
     * 현재 사용자 조회기와 사용자 저장소를 주입받는다.
     *
     * @param currentUserService 인증 사용자를 활성 사용자로 조회하는 서비스
     * @param userRepository 사용자 저장소
     */
    public UserProfileService(CurrentUserService currentUserService, UserRepository userRepository) {
        this.currentUserService = currentUserService;
        this.userRepository = userRepository;
    }

    /**
     * 현재 로그인한 활성 사용자의 공통 회원 정보를 조회한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 내 정보 조회 응답
     * @throws BusinessException 인증 사용자가 없거나 활성 상태가 아닌 경우
     */
    @Transactional(readOnly = true)
    public MyProfileResponse getMyProfile(AuthenticatedUser principal) {
        return MyProfileResponse.from(currentUserService.requireActiveUser(principal));
    }

    /**
     * 현재 로그인한 활성 사용자의 전달된 회원 정보만 수정한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @param request 부분 수정할 회원 정보
     * @return 수정 후 내 정보 응답
     * @throws BusinessException 인증 사용자가 없거나 요청 값이 비어 있는 경우
     * @throws DuplicateEmailException 다른 사용자가 이메일을 사용 중인 경우
     */
    @Transactional
    public MyProfileUpdateResponse updateMyProfile(
            AuthenticatedUser principal, MyProfileUpdateRequest request
    ) {
        User user = currentUserService.requireActiveUser(principal);
        String nickname = normalizeRequiredValue(request.nickname());
        String email = normalizeEmail(request.email());
        String profileImageUrl = normalizeRequiredValue(request.profileImageUrl());

        if (email != null
                && !email.equals(user.getEmail())
                && userRepository.existsByEmailAndIdNot(email, user.getId())) {
            throw new DuplicateEmailException();
        }

        user.updateProfile(nickname, email, profileImageUrl, request.preferredLanguage());
        return MyProfileUpdateResponse.from(userRepository.saveAndFlush(user));
    }

    /**
     * 선택 입력값이 전달된 경우 앞뒤 공백을 제거하고 빈 값은 거부한다.
     *
     * @param value 정규화할 선택 입력값
     * @return 미전달이면 {@code null}, 그 외에는 공백이 제거된 값
     * @throws BusinessException 공백만 전달된 경우
     */
    private String normalizeRequiredValue(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return normalized;
    }

    /**
     * 선택 이메일을 소문자로 정규화하고 빈 값은 거부한다.
     *
     * @param email 정규화할 선택 이메일
     * @return 미전달이면 {@code null}, 그 외에는 공백 제거와 소문자 변환을 적용한 이메일
     * @throws BusinessException 공백만 전달된 경우
     */
    private String normalizeEmail(String email) {
        String normalized = normalizeRequiredValue(email);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT);
    }
}

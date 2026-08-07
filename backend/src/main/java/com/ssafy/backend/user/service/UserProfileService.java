package com.ssafy.backend.user.service;

import com.ssafy.backend.auth.exception.DuplicateEmailException;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.repository.SocialAccountRepository;
import com.ssafy.backend.auth.service.LogoutService;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.dto.MyProfileResponse;
import com.ssafy.backend.user.dto.MyProfileUpdateRequest;
import com.ssafy.backend.user.dto.MyProfileUpdateResponse;
import com.ssafy.backend.user.dto.UserWithdrawRequest;
import com.ssafy.backend.user.dto.UserWithdrawResponse;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Set;

/** 현재 사용자의 공통 회원 정보 조회·부분 수정과 회원탈퇴를 처리한다. */
@Service
public class UserProfileService {

    /**
     * 탈퇴를 막을 팬미팅 상태다.
     * DRAFT는 공개하지 않은 임시 저장이라 운영 영향이 없고, ENDED·CANCELED는 남은 책임이 없어 제외한다.
     */
    private static final Set<FanMeetingStatus> BLOCKING_STATUSES = Set.of(
            FanMeetingStatus.PUBLISHED,
            FanMeetingStatus.APPLICATION_OPEN,
            FanMeetingStatus.APPLICATION_CLOSED,
            FanMeetingStatus.READY,
            FanMeetingStatus.LIVE
    );

    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;
    private final FanMeetingRepository fanMeetingRepository;
    private final InfluencerProfileRepository influencerProfileRepository;
    private final SocialAccountRepository socialAccountRepository;
    private final PasswordEncoder passwordEncoder;
    private final LogoutService logoutService;
    private final Clock clock;

    /**
     * 회원 정보 조회·수정과 탈퇴 검증에 필요한 저장소, 비밀번호 비교기, 로그아웃 서비스와 시계를 주입받는다.
     *
     * @param currentUserService 인증 사용자를 활성 사용자로 조회하는 서비스
     * @param userRepository 사용자 저장소
     * @param fanMeetingRepository 팬미팅 저장소
     * @param influencerProfileRepository 인플루언서 공개 프로필 저장소
     * @param socialAccountRepository 소셜 계정 연결 저장소
     * @param passwordEncoder 비밀번호 비교기
     * @param logoutService 토큰 세션 종료 서비스
     * @param clock 탈퇴 시각 계산용 시계
     */
    public UserProfileService(CurrentUserService currentUserService,
                              UserRepository userRepository,
                              FanMeetingRepository fanMeetingRepository,
                              InfluencerProfileRepository influencerProfileRepository,
                              SocialAccountRepository socialAccountRepository,
                              PasswordEncoder passwordEncoder,
                              LogoutService logoutService,
                              Clock clock) {
        this.currentUserService = currentUserService;
        this.userRepository = userRepository;
        this.fanMeetingRepository = fanMeetingRepository;
        this.influencerProfileRepository = influencerProfileRepository;
        this.socialAccountRepository = socialAccountRepository;
        this.passwordEncoder = passwordEncoder;
        this.logoutService = logoutService;
        this.clock = clock;
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
     * 비밀번호를 재확인하고 운영 책임이 없을 때만 계정을 탈퇴 상태로 전환한다.
     *
     * <p>연관 이력을 참조하는 외래 키가 많아 행을 삭제하지 않고 식별 가능한 값만 지운다.
     * 공개 프로필은 남길 이유가 없어 행째로 삭제한다.
     *
     * @param request 본인 확인용 비밀번호
     * @param accessToken 현재 요청에 사용된 Access Token
     * @param principal JWT 인증 사용자 정보
     * @return 탈퇴 시각과 성공 여부
     * @throws BusinessException 비밀번호가 다르거나, 운영 중인 팬미팅이 있거나, 마지막 관리자인 경우
     */
    @Transactional
    public UserWithdrawResponse withdraw(UserWithdrawRequest request, String accessToken,
                                         AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        // 소셜 전용 계정은 비밀번호가 없고 설정할 방법도 없다. 이미 소셜 인증으로 발급된 토큰으로
        // 요청이 들어온 상태이므로 비밀번호 재확인 없이 탈퇴를 허용한다.
        if (!user.isSocialOnly()) {
            if (request.password() == null || request.password().isBlank()) {
                throw new BusinessException(ErrorCode.USER_PASSWORD_MISMATCH,
                        "본인 확인을 위해 비밀번호를 입력해 주세요.");
            }
            if (!passwordEncoder.matches(request.password(), user.getPassword())) {
                throw new BusinessException(ErrorCode.USER_PASSWORD_MISMATCH);
            }
        }
        // 삭제하려는 유저에게 예정된 팬미팅이 있을 때 삭제를 거부한다.
        if (fanMeetingRepository.existsOperatingMeeting(user.getId(), BLOCKING_STATUSES)) {
            throw new BusinessException(ErrorCode.USER_WITHDRAW_MEETING_IN_PROGRESS);
        }
        // 관리자 계정을 만드는 API가 없어 마지막 ADMIN이 떠나면 시드 SQL 없이 복구할 수 없다.
        if (user.getRole() == UserRole.ADMIN
                && userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE) <= 1) {
            throw new BusinessException(ErrorCode.LAST_ADMIN_WITHDRAW_NOT_ALLOWED);
        }

        try {
            // requireActiveUser가 이미 활성 상태를 보장하므로 도달하지 않지만 엔티티 가드를 그대로 옮긴다.
            user.withdraw(LocalDateTime.now(clock));
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.USER_ALREADY_WITHDRAWN);
        }
        influencerProfileRepository.deleteByUser_Id(user.getId());
        // 연결을 남기면 (provider, provider_user_id) 유니크 제약 때문에 같은 소셜 계정으로 다시
        // 가입할 때 탈퇴 처리된 이 계정으로 로그인된다. 반드시 함께 지운다.
        socialAccountRepository.deleteByUser_Id(user.getId());
        // Redis 작업은 트랜잭션 롤백 대상이 아니다. 이후 커밋이 실패하면 계정은 살아 있고
        // 세션만 끊겨 재로그인이 필요한데, 데이터 정합성 문제는 아니라 허용한다.
        logoutService.logout(accessToken);
        return UserWithdrawResponse.from(user);
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

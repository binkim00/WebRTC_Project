package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.domain.SocialProvider;
import com.ssafy.backend.auth.dto.SocialAccountResponse;
import com.ssafy.backend.auth.dto.SocialLoginRequest;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.repository.SocialAccountRepository;
import com.ssafy.backend.auth.support.SocialProfile;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 마이페이지에서 소셜 계정 연결을 조회·추가·해제한다. (USER-004~006)
 *
 * <p>연결 추가는 공급자 HTTP 호출이 필요해 트랜잭션을 걸지 않는다. 대신 중복 연결은
 * {@code social_accounts}의 유니크 제약과 {@link SocialAuthService}의 검증이 함께 막는다.
 */
@Service
public class SocialAccountService {

    private final CurrentUserService currentUserService;
    private final SocialAuthService socialAuthService;
    private final SocialAccountRepository socialAccountRepository;

    /**
     * 연결 관리에 필요한 사용자 조회 서비스와 소셜 인증 서비스, 연결 저장소를 주입받는다.
     *
     * @param currentUserService 인증 사용자를 활성 사용자로 조회하는 서비스
     * @param socialAuthService 공급자 검증과 연결 저장을 공유할 소셜 인증 서비스
     * @param socialAccountRepository 소셜 연결 저장소
     */
    public SocialAccountService(CurrentUserService currentUserService,
                                SocialAuthService socialAuthService,
                                SocialAccountRepository socialAccountRepository) {
        this.currentUserService = currentUserService;
        this.socialAuthService = socialAuthService;
        this.socialAccountRepository = socialAccountRepository;
    }

    /**
     * 현재 사용자에게 연결된 소셜 계정 목록을 조회한다. (USER-004)
     *
     * @param principal JWT 인증 사용자 정보
     * @return 연결된 공급자 목록이며 없으면 빈 목록
     * @throws BusinessException 인증 사용자가 없거나 활성 상태가 아닌 경우
     */
    @Transactional(readOnly = true)
    public List<SocialAccountResponse> list(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        return socialAccountRepository.findAllByUser_IdOrderByProviderAsc(user.getId()).stream()
                .map(SocialAccountResponse::from)
                .toList();
    }

    /**
     * 로그인한 계정에 소셜 계정을 직접 연결한다. (USER-005)
     *
     * <p>이 경로는 이미 본인 인증이 끝난 상태이므로 비밀번호를 다시 받지 않는다.
     *
     * @param principal JWT 인증 사용자 정보
     * @param rawProvider 경로로 받은 공급자 문자열
     * @param request 인증 코드와 state
     * @return 새로 만들어진 연결 정보
     * @throws BusinessException 이미 다른 계정에 연결되었거나 같은 공급자가 이미 연결된 경우
     */
    public SocialAccountResponse link(AuthenticatedUser principal, String rawProvider,
                                      SocialLoginRequest request) {
        User user = currentUserService.requireActiveUser(principal);
        // 공급자 호출을 먼저 끝내고 DB 작업으로 넘어간다.
        SocialProfile profile = socialAuthService.verifyProfile(rawProvider, request);
        return SocialAccountResponse.from(socialAuthService.linkToUser(user, profile));
    }

    /**
     * 연결된 소셜 계정을 해제한다. (USER-006)
     *
     * <p>비밀번호가 없는 소셜 전용 계정이 마지막 연결까지 해제하면 로그인할 수단이 사라진다.
     * 비밀번호 설정 API가 없어 스스로 복구할 방법도 없으므로 그 경우에는 해제를 거부한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @param rawProvider 경로로 받은 공급자 문자열
     * @throws BusinessException 연결이 없거나 마지막 로그인 수단인 경우
     */
    @Transactional
    public void unlink(AuthenticatedUser principal, String rawProvider) {
        User user = currentUserService.requireActiveUser(principal);
        // 설정에서 공급자가 빠져도 이미 만들어진 연결은 해제할 수 있어야 하므로 설정 여부는 보지 않는다.
        SocialProvider provider = SocialProvider.from(rawProvider)
                .orElseThrow(() -> new BusinessException(ErrorCode.SOCIAL_PROVIDER_NOT_SUPPORTED,
                        "지원하지 않는 소셜 로그인이에요."));

        var account = socialAccountRepository.findByUser_IdAndProvider(user.getId(), provider)
                .orElseThrow(() -> new BusinessException(ErrorCode.SOCIAL_ACCOUNT_NOT_LINKED,
                        "연결된 " + provider.displayName() + " 계정이 없어요."));

        if (user.isSocialOnly() && socialAccountRepository.countByUser_Id(user.getId()) <= 1) {
            throw new BusinessException(ErrorCode.SOCIAL_LAST_LOGIN_METHOD,
                    "이 연결을 해제하면 로그인할 방법이 없어져요. 다른 소셜 계정을 먼저 연결한 뒤 해제해 주세요.");
        }
        socialAccountRepository.delete(account);
    }
}

package com.ssafy.backend.user.support;

import com.ssafy.backend.user.config.AdminBootstrapProperties;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 활성 ADMIN이 하나도 없을 때 설정값으로 서비스 운영자 계정을 만든다.
 *
 * <p>ADMIN은 회원가입으로 만들 수 없어서 DB를 초기화하면 서비스 공지 작성이나 조직 구성원 추가
 * 같은 운영자 전용 기능을 아무도 쓸 수 없게 된다. 기동할 때마다 계정 유무를 확인해 없을 때만
 * 만들어 두면 초기화 뒤에도 재기동만으로 복구된다.
 *
 * <p>설정값이 비어 있으면 아무 일도 하지 않으므로, 계정을 자동으로 만들 필요가 없는 환경은
 * 값을 넣지 않으면 된다.
 */
@Component
public class AdminBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);

    private final AdminBootstrapProperties properties;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * 계정 생성에 필요한 설정과 저장소, 비밀번호 인코더를 주입받는다.
     *
     * @param properties 자동 생성할 운영자 계정 설정
     * @param userRepository 사용자 저장소
     * @param passwordEncoder 비밀번호 암호화 인코더
     */
    public AdminBootstrapRunner(AdminBootstrapProperties properties,
                                UserRepository userRepository,
                                PasswordEncoder passwordEncoder) {
        this.properties = properties;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * 기동 시 활성 ADMIN이 없으면 설정값으로 운영자 계정을 하나 만든다.
     *
     * <p>이미 활성 ADMIN이 있거나 설정값이 비어 있으면 아무 일도 하지 않는다. 계정 생성에
     * 실패해도 애플리케이션 기동을 막지 않도록 예외 대신 경고 로그로 남긴다.
     *
     * @param args 애플리케이션 실행 인자이며 사용하지 않는다
     */
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!hasRequiredSettings()) {
            return;
        }
        if (userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE) > 0) {
            return;
        }
        // 탈퇴 계정도 로그인 아이디·이메일을 그대로 갖고 있을 수 있어 유니크 제약에 걸린다.
        // 저장이 실패하면 기동 자체가 막히므로 미리 확인하고 안내만 남긴다.
        if (userRepository.existsByLoginId(properties.loginId())
                || userRepository.existsByEmail(properties.email())) {
            log.warn("운영자 계정을 만들지 못했습니다. 같은 로그인 아이디나 이메일을 쓰는 계정이 이미 있습니다. loginId={}",
                    properties.loginId());
            return;
        }

        User admin = User.createActive(
                properties.loginId(),
                properties.email(),
                passwordEncoder.encode(properties.password()),
                nickname(),
                UserRole.ADMIN,
                PreferredLanguage.KOREAN
        );
        userRepository.save(admin);
        log.info("활성 운영자 계정이 없어 설정값으로 새로 만들었습니다. loginId={}", properties.loginId());
    }

    /**
     * 계정을 만들 수 있을 만큼 설정값이 채워졌는지 확인한다.
     *
     * @return 로그인 아이디·비밀번호·이메일이 모두 있으면 true
     */
    private boolean hasRequiredSettings() {
        return StringUtils.hasText(properties.loginId())
                && StringUtils.hasText(properties.password())
                && StringUtils.hasText(properties.email());
    }

    /**
     * 설정된 표시 이름을 반환하고 비어 있으면 로그인 아이디로 대신한다.
     *
     * @return 생성할 계정의 표시 이름
     */
    private String nickname() {
        return StringUtils.hasText(properties.nickname())
                ? properties.nickname()
                : properties.loginId();
    }
}

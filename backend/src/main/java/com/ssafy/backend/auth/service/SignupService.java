package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.SignupRequest;
import com.ssafy.backend.auth.dto.SignupResponse;
import com.ssafy.backend.auth.exception.DuplicateEmailException;
import com.ssafy.backend.auth.exception.DuplicateLoginIdException;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SignupService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /** 사용자 저장소와 비밀번호 암호화기를 주입받는다. */
    public SignupService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    /** 중복값을 검사하고 비밀번호를 암호화한 뒤 신규 사용자를 저장한다. */
    public SignupResponse signup(SignupRequest request) {
        // 앞뒤 공백과 이메일 대소문자 차이로 중복 검사가 우회되지 않도록 값을 정규화한다.
        String loginId = request.loginId().trim();
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByLoginId(loginId)) {
            throw new DuplicateLoginIdException();
        }
        if (userRepository.existsByEmail(email)) {
            throw new DuplicateEmailException();
        }
        // 비밀번호 원문은 저장하지 않고 PasswordEncoder가 만든 해시만 엔티티에 전달한다.
        User user = User.createActive(
                loginId,
                email,
                passwordEncoder.encode(request.password()),
                request.nickname().trim(),
                request.role(),
                request.preferredLanguage().trim()
        );
        // 저장 과정에서 생성된 ID와 createdAt을 포함하도록 저장 결과로 응답 DTO를 만든다.
        return SignupResponse.from(userRepository.save(user));
    }
}

package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationQuestionType;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.domain.DeviceDuplicatePolicy;
import com.ssafy.backend.application.dto.ApplicationSubmitRequest;
import com.ssafy.backend.application.dto.ApplicationSubmitResponse;
import com.ssafy.backend.application.dto.ApplicationWithdrawResponse;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.DeviceTokenService;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.common.support.RequestRateLimiter;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 팬의 응모 제출, 취소, 재응모 흐름을 처리한다. */
@Service
public class ApplicationService {

    private static final Logger log = LoggerFactory.getLogger(ApplicationService.class);

    /** 응모 요청 제한을 관리하는 제한 이름이다. */
    private static final String SUBMIT_SCOPE = "application:submit";

    private final CurrentUserService currentUserService;
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final ApplicationRepository applicationRepository;
    private final ApplicationFormRepository applicationFormRepository;
    private final ApplicationQuestionRepository applicationQuestionRepository;
    private final ApplicationAnswerRepository applicationAnswerRepository;
    private final DeviceTokenService deviceTokenService;
    private final RequestRateLimiter rateLimiter;
    private final Clock clock;
    private final boolean emailVerificationRequired;
    private final DeviceDuplicatePolicy deviceDuplicatePolicy;
    private final int submitRateLimitCount;
    private final Duration submitRateLimitWindow;

    /**
     * 응모 처리에 필요한 사용자, 팬미팅, 폼, 답변 저장소와 남용 방지 구성 요소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param applicationRepository 응모 저장소
     * @param applicationFormRepository 응모 폼 저장소
     * @param applicationQuestionRepository 응모 질문 저장소
     * @param applicationAnswerRepository 응모 답변 저장소
     * @param deviceTokenService 기기 토큰 해시 계산 서비스
     * @param rateLimiter 요청 제한기
     * @param clock 현재 시각 공급자
     * @param emailVerificationRequired 응모 전 이메일 인증 강제 여부
     * @param deviceDuplicatePolicy 같은 기기 중복 응모 처리 정책
     * @param submitRateLimitCount 구간당 허용할 응모 요청 수
     * @param submitRateLimitWindowSeconds 응모 요청을 집계할 구간(초)
     */
    public ApplicationService(
            CurrentUserService currentUserService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            ApplicationRepository applicationRepository,
            ApplicationFormRepository applicationFormRepository,
            ApplicationQuestionRepository applicationQuestionRepository,
            ApplicationAnswerRepository applicationAnswerRepository,
            DeviceTokenService deviceTokenService,
            RequestRateLimiter rateLimiter,
            Clock clock,
            @Value("${app.application.email-verification-required}") boolean emailVerificationRequired,
            @Value("${app.application.device-duplicate-policy}") DeviceDuplicatePolicy deviceDuplicatePolicy,
            @Value("${app.application.submit-rate-limit-count}") int submitRateLimitCount,
            @Value("${app.application.submit-rate-limit-window-seconds}") long submitRateLimitWindowSeconds
    ) {
        this.currentUserService = currentUserService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.applicationRepository = applicationRepository;
        this.applicationFormRepository = applicationFormRepository;
        this.applicationQuestionRepository = applicationQuestionRepository;
        this.applicationAnswerRepository = applicationAnswerRepository;
        this.deviceTokenService = deviceTokenService;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
        this.emailVerificationRequired = emailVerificationRequired;
        this.deviceDuplicatePolicy = deviceDuplicatePolicy;
        this.submitRateLimitCount = submitRateLimitCount;
        this.submitRateLimitWindow = Duration.ofSeconds(submitRateLimitWindowSeconds);
    }

    /**
     * 팬의 최초 응모를 생성하거나 취소된 기존 응모를 새 답변으로 다시 접수한다.
     *
     * <p>다계정 대량 응모를 억제하기 위해 이메일 인증을 하드 게이트로 두고, 기기 토큰 중복은
     * 정책에 따라 기록하거나 거부한다. 검사 순서는 비용이 낮은 것부터 두어 불필요한 조회를 줄인다.
     *
     * @param meetingId 응모 대상 팬미팅 식별자
     * @param request 개인정보 동의와 질문 답변
     * @param principal JWT 인증 사용자 정보
     * @param deviceToken 기기 토큰 쿠키 값이며 쿠키가 없으면 {@code null}
     * @return 접수된 응모 정보
     * @throws BusinessException 팬 권한, 이메일 인증, 요청 제한, 응모 기간, 동의, 답변 또는
     *         기기 중복 정책을 위반한 경우
     */
    @Transactional
    public ApplicationSubmitResponse submit(
            Long meetingId, ApplicationSubmitRequest request, AuthenticatedUser principal,
            String deviceToken
    ) {
        User fan = requireFan(principal);
        requireVerifiedEmail(fan);
        requireSubmitAllowance(fan, meetingId);

        FanMeeting meeting = requireMeeting(meetingId);
        LocalDateTime now = LocalDateTime.now(clock);
        requireApplicationPeriod(meeting, now);
        if (!request.personalInformationConsent()) {
            throw new BusinessException(ErrorCode.APPLICATION_CONSENT_REQUIRED);
        }

        List<ApplicationQuestion> questions = activeQuestions(meetingId);
        Map<Long, String> answers = validateAnswers(questions, request.answers());
        String deviceHash = deviceTokenService.hash(deviceToken);
        applyDeviceDuplicatePolicy(meetingId, fan, deviceHash);

        Application application = applicationRepository
                .findByMeeting_IdAndFan_Id(meetingId, fan.getId())
                .map(existing -> resubmit(existing, now))
                .orElseGet(() -> applicationRepository.save(Application.submit(meeting, fan, now)));
        // 최초 응모와 재응모 모두 그 시점의 기기를 남긴다.
        application.recordDeviceHash(deviceHash);
        saveAnswers(application, questions, answers);
        return ApplicationSubmitResponse.from(application);
    }

    /**
     * 응모 전 이메일 소유 확인을 마쳤는지 검증한다.
     *
     * <p>기능이 안정화되기 전까지 설정으로 끌 수 있게 두었고, 꺼져 있으면 검사를 건너뛴다.
     *
     * @param fan 응모하려는 팬
     * @throws BusinessException 인증이 필요한데 완료하지 않은 경우
     */
    private void requireVerifiedEmail(User fan) {
        if (emailVerificationRequired && !fan.isEmailVerified()) {
            throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_REQUIRED);
        }
    }

    /**
     * 같은 팬이 같은 팬미팅에 반복 요청하는 것을 제한한다.
     *
     * @param fan 응모하려는 팬
     * @param meetingId 응모 대상 팬미팅 식별자
     * @throws BusinessException 짧은 구간의 요청 수가 상한을 넘은 경우
     */
    private void requireSubmitAllowance(User fan, Long meetingId) {
        String key = fan.getId() + ":" + meetingId;
        if (!rateLimiter.tryConsume(SUBMIT_SCOPE, key, submitRateLimitCount, submitRateLimitWindow)) {
            throw new BusinessException(
                    ErrorCode.TOO_MANY_REQUESTS, rateLimiter.retryAfterSeconds(SUBMIT_SCOPE, key));
        }
    }

    /**
     * 같은 기기로 다른 계정이 이미 응모했는지 확인하고 정책에 따라 처리한다.
     *
     * <p>팬 응답에는 의심 여부를 담지 않는다. 탐지 사실을 노출하면 우회 방법을 학습할 수 있고,
     * 개인정보 정책상 의심 표시는 운영자에게만 보여야 한다.
     *
     * @param meetingId 응모 대상 팬미팅 식별자
     * @param fan 응모하려는 팬
     * @param deviceHash 응모 시점 기기 토큰 해시이며 쿠키가 없으면 {@code null}
     * @throws BusinessException 정책이 BLOCK 이고 같은 기기의 다른 계정 응모가 있는 경우
     */
    private void applyDeviceDuplicatePolicy(Long meetingId, User fan, String deviceHash) {
        if (deviceHash == null) {
            // 쿠키를 차단한 브라우저까지 막으면 정상 사용자가 응모할 수 없으므로 통과시키고 기록만 남긴다.
            log.info("기기 토큰 없이 응모가 접수되었습니다. meetingId={}, fanId={}", meetingId, fan.getId());
            return;
        }
        boolean duplicated = applicationRepository
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(meetingId, deviceHash, fan.getId());
        if (!duplicated) {
            return;
        }
        if (deviceDuplicatePolicy == DeviceDuplicatePolicy.BLOCK) {
            throw new BusinessException(ErrorCode.DEVICE_DUPLICATE_APPLICATION);
        }
        log.warn("같은 기기에서 다른 계정의 응모가 확인되었습니다. meetingId={}, fanId={}",
                meetingId, fan.getId());
    }

    /**
     * 응모 기간 중인 현재 팬의 접수 건을 취소 상태로 전환한다.
     *
     * @param meetingId 취소할 응모의 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 응모 취소 정보
     * @throws BusinessException 응모가 없거나 취소할 수 없는 상태 또는 기간인 경우
     */
    @Transactional
    public ApplicationWithdrawResponse withdraw(
            Long meetingId, AuthenticatedUser principal
    ) {
        User fan = requireFan(principal);
        FanMeeting meeting = requireMeeting(meetingId);
        LocalDateTime now = LocalDateTime.now(clock);
        requireApplicationPeriod(meeting, now);
        Application application = applicationRepository
                .findByMeeting_IdAndFan_Id(meetingId, fan.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.APPLICATION_NOT_FOUND));
        if (application.getStatus() == ApplicationStatus.WITHDRAWN) {
            throw new BusinessException(ErrorCode.APPLICATION_ALREADY_WITHDRAWN);
        }
        if (application.getStatus() != ApplicationStatus.SUBMITTED) {
            throw new BusinessException(ErrorCode.APPLICATION_STATE_CONFLICT);
        }
        application.withdraw(now);
        return ApplicationWithdrawResponse.from(application);
    }

    /** 현재 인증 사용자가 팬 역할인지 확인하고 활성 사용자 엔티티를 반환한다. */
    private User requireFan(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.getRole() != UserRole.FAN) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /** 삭제되지 않은 팬미팅을 조회하고 없으면 공통 예외를 발생시킨다. */
    private FanMeeting requireMeeting(Long meetingId) {
        return fanMeetingRepository.findById(meetingId)
                .filter(meeting -> meeting.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 팬미팅이 현재 응모 제출과 취소를 허용하는 기간인지 검증한다. */
    private void requireApplicationPeriod(FanMeeting meeting, LocalDateTime now) {
        MeetingApplicationSetting setting = applicationSettingRepository.findById(meeting.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.APPLICATION_SETTING_NOT_FOUND));
        if (!setting.isEnabled()
                || meeting.getStatus() != FanMeetingStatus.APPLICATION_OPEN
                || setting.getApplicationOpenAt() == null
                || setting.getApplicationCloseAt() == null
                || now.isBefore(setting.getApplicationOpenAt())
                || !now.isBefore(setting.getApplicationCloseAt())) {
            throw new BusinessException(ErrorCode.APPLICATION_PERIOD_CLOSED);
        }
    }

    /** 팬미팅에 폼이 있으면 삭제되지 않은 질문을 표시 순서대로 반환한다. */
    private List<ApplicationQuestion> activeQuestions(Long meetingId) {
        return applicationFormRepository.findByMeeting_Id(meetingId)
                .map(ApplicationForm::getId)
                .map(applicationQuestionRepository
                        ::findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc)
                .orElseGet(List::of);
    }

    /** 제출 답변의 중복, 소속, 질문 유형과 필수 질문 누락 여부를 검증한다. */
    private Map<Long, String> validateAnswers(
            List<ApplicationQuestion> questions,
            List<ApplicationSubmitRequest.AnswerRequest> requests
    ) {
        Map<Long, ApplicationQuestion> questionById = new HashMap<>();
        for (ApplicationQuestion question : questions) {
            questionById.put(question.getId(), question);
        }
        Map<Long, String> answers = new HashMap<>();
        Set<Long> submittedQuestionIds = new HashSet<>();
        for (ApplicationSubmitRequest.AnswerRequest request : requests) {
            ApplicationQuestion question = questionById.get(request.questionId());
            if (question == null
                    || !submittedQuestionIds.add(request.questionId())
                    || question.getQuestionType() != ApplicationQuestionType.SHORT_TEXT
                    && question.getQuestionType() != ApplicationQuestionType.LONG_TEXT) {
                throw new BusinessException(ErrorCode.APPLICATION_ANSWER_INVALID);
            }
            answers.put(request.questionId(), request.value().trim());
        }
        boolean missingRequired = questions.stream()
                .anyMatch(question -> question.isRequired()
                        && !submittedQuestionIds.contains(question.getId()));
        if (missingRequired) {
            throw new BusinessException(ErrorCode.APPLICATION_ANSWER_INVALID);
        }
        return answers;
    }

    /** 취소 상태만 재접수하고 기존 답변을 새 답변으로 교체할 수 있도록 삭제한다. */
    private Application resubmit(Application application, LocalDateTime now) {
        if (application.getStatus() == ApplicationStatus.SUBMITTED) {
            throw new BusinessException(ErrorCode.APPLICATION_ALREADY_SUBMITTED);
        }
        if (application.getStatus() != ApplicationStatus.WITHDRAWN) {
            throw new BusinessException(ErrorCode.APPLICATION_STATE_CONFLICT);
        }
        applicationAnswerRepository.deleteAllByApplication_Id(application.getId());
        application.resubmit(now);
        return application;
    }

    /** 검증된 질문 순서에 따라 제출된 텍스트 답변을 저장한다. */
    private void saveAnswers(
            Application application,
            List<ApplicationQuestion> questions,
            Map<Long, String> answers
    ) {
        List<ApplicationAnswer> entities = questions.stream()
                .filter(question -> answers.containsKey(question.getId()))
                .map(question -> ApplicationAnswer.createTextAnswer(
                        application, question, answers.get(question.getId())
                ))
                .toList();
        applicationAnswerRepository.saveAll(entities);
    }
}

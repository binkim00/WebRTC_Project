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
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
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

    /** 의심 응모에 남길 사유이며 원문 쿠키·토큰은 담지 않는다. */
    private static final String DEVICE_DUPLICATE_REASON = "같은 팬미팅에서 다른 계정이 동일 기기 토큰으로 응모";

    private final CurrentUserService currentUserService;
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final ApplicationRepository applicationRepository;
    private final ApplicationFormRepository applicationFormRepository;
    private final ApplicationQuestionRepository applicationQuestionRepository;
    private final ApplicationAnswerRepository applicationAnswerRepository;
    private final Clock clock;
    private final boolean emailVerificationRequired;
    private final DeviceDuplicatePolicy deviceDuplicatePolicy;

    /**
     * 응모 처리에 필요한 사용자, 팬미팅, 폼, 답변 저장소와 부정 응모 정책을 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param applicationRepository 응모 저장소
     * @param applicationFormRepository 응모 폼 저장소
     * @param applicationQuestionRepository 응모 질문 저장소
     * @param applicationAnswerRepository 응모 답변 저장소
     * @param clock 현재 시각 공급자
     * @param emailVerificationRequired 응모 전 이메일 인증을 강제할지 여부
     * @param deviceDuplicatePolicy 동일 기기 다계정 응모 처리 정책
     */
    public ApplicationService(
            CurrentUserService currentUserService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            ApplicationRepository applicationRepository,
            ApplicationFormRepository applicationFormRepository,
            ApplicationQuestionRepository applicationQuestionRepository,
            ApplicationAnswerRepository applicationAnswerRepository,
            Clock clock,
            @Value("${app.application.email-verification-required:true}")
            boolean emailVerificationRequired,
            @Value("${app.application.device-duplicate-policy:FLAG}")
            DeviceDuplicatePolicy deviceDuplicatePolicy
    ) {
        this.currentUserService = currentUserService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.applicationRepository = applicationRepository;
        this.applicationFormRepository = applicationFormRepository;
        this.applicationQuestionRepository = applicationQuestionRepository;
        this.applicationAnswerRepository = applicationAnswerRepository;
        this.clock = clock;
        this.emailVerificationRequired = emailVerificationRequired;
        this.deviceDuplicatePolicy = deviceDuplicatePolicy;
    }

    /**
     * 팬의 최초 응모를 생성하거나 취소된 기존 응모를 새 답변으로 다시 접수한다.
     *
     * @param meetingId 응모 대상 팬미팅 식별자
     * @param request 개인정보 동의와 질문 답변
     * @param principal JWT 인증 사용자 정보
     * @param deviceHash 서버가 발급한 기기 토큰의 HMAC 해시이며 쿠키가 없으면 {@code null}
     * @return 접수된 응모 정보
     * @throws BusinessException 팬 권한, 이메일 인증, 응모 기간, 동의 또는 답변이 유효하지 않은 경우
     */
    @Transactional
    public ApplicationSubmitResponse submit(
            Long meetingId, ApplicationSubmitRequest request, AuthenticatedUser principal,
            String deviceHash
    ) {
        User fan = requireFan(principal);
        FanMeeting meeting = requireMeeting(meetingId);
        LocalDateTime now = LocalDateTime.now(clock);
        requireApplicationPeriod(meeting, now);
        requireVerifiedEmail(fan);
        if (!request.personalInformationConsent()) {
            throw new BusinessException(ErrorCode.APPLICATION_CONSENT_REQUIRED);
        }

        List<ApplicationQuestion> questions = activeQuestions(meetingId);
        Map<Long, String> answers = validateAnswers(questions, request.answers());
        Application application = applicationRepository
                .findByMeeting_IdAndFan_Id(meetingId, fan.getId())
                .map(existing -> resubmit(existing, now))
                .orElseGet(() -> saveNewApplication(meeting, fan, now));
        applyDeviceRisk(application, meetingId, fan, deviceHash);
        saveAnswers(application, questions, answers);
        return ApplicationSubmitResponse.from(application);
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
        FanMeeting meeting = fanMeetingRepository.findById(meetingId)
                .filter(found -> found.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
        // 외부 선별 팬미팅은 응모를 운영하지 않으므로 기간 검증 이전에 명확히 차단한다.
        if (meeting.isExternalSelection()) {
            throw new BusinessException(ErrorCode.APPLICATION_NOT_SUPPORTED);
        }
        return meeting;
    }

    /**
     * 응모 전에 이메일 소유 확인을 마쳤는지 검증한다.
     *
     * <p>다계정 대량 응모를 막는 하드 게이트다. 기존 회원 인증 유도 기간에는
     * {@code app.application.email-verification-required=false}로 잠시 끌 수 있다.
     *
     * @param fan 응모하려는 팬
     * @throws BusinessException 이메일 인증을 마치지 않은 경우
     */
    private void requireVerifiedEmail(User fan) {
        if (emailVerificationRequired && !fan.isEmailVerified()) {
            throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_REQUIRED);
        }
    }

    /**
     * 새 응모를 저장하고 DB 유니크 제약 위반은 중복 응모로 변환한다.
     *
     * <p>동시에 들어온 두 요청은 애플리케이션 조회만으로 걸러지지 않으므로
     * {@code uk_applications_meeting_fan} 제약을 최종 방어선으로 삼는다.
     *
     * @param meeting 응모 대상 팬미팅
     * @param fan 응모한 팬
     * @param now 제출 시각
     * @return 저장된 응모
     * @throws BusinessException 같은 팬미팅에 이미 응모가 있는 경우
     */
    private Application saveNewApplication(FanMeeting meeting, User fan, LocalDateTime now) {
        try {
            return applicationRepository.saveAndFlush(Application.submit(meeting, fan, now));
        } catch (DataIntegrityViolationException exception) {
            throw new BusinessException(ErrorCode.APPLICATION_ALREADY_SUBMITTED);
        }
    }

    /**
     * 응모에 사용된 기기 토큰을 기록하고 동일 기기 다계정 여부를 판정한다.
     *
     * <p>기본 정책 FLAG에서는 차단하지 않고 의심 표시만 남긴다. 공용 PC와 가족 기기의 정상 응모를
     * 오탐으로 막지 않기 위해서이며, 경쟁이 과열된 이벤트에 한해 BLOCK을 검토한다.
     *
     * @param application 판정 대상 응모
     * @param meetingId 팬미팅 식별자
     * @param fan 응모한 팬
     * @param deviceHash 기기 토큰 해시이며 쿠키가 없으면 {@code null}
     * @throws BusinessException BLOCK 정책에서 동일 기기 다계정 응모가 확인된 경우
     */
    private void applyDeviceRisk(
            Application application, Long meetingId, User fan, String deviceHash
    ) {
        application.recordDeviceHash(deviceHash);
        if (deviceHash == null) {
            return;
        }
        boolean usedByAnotherFan = applicationRepository
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(meetingId, deviceHash, fan.getId());
        if (!usedByAnotherFan) {
            return;
        }
        if (deviceDuplicatePolicy == DeviceDuplicatePolicy.BLOCK) {
            throw new BusinessException(ErrorCode.DEVICE_DUPLICATE_APPLICATION);
        }
        application.flagAsSuspicious(DEVICE_DUPLICATE_REASON);
        // 운영자가 쓸 신호이므로 해시 원문이 아니라 식별자만 남긴다.
        log.warn("동일 기기 다계정 응모 의심: meetingId={} fanId={}", meetingId, fan.getId());
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

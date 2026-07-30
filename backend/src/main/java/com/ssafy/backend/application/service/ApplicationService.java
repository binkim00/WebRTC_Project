package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationQuestionType;
import com.ssafy.backend.application.domain.ApplicationStatus;
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

    private final CurrentUserService currentUserService;
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final ApplicationRepository applicationRepository;
    private final ApplicationFormRepository applicationFormRepository;
    private final ApplicationQuestionRepository applicationQuestionRepository;
    private final ApplicationAnswerRepository applicationAnswerRepository;
    private final Clock clock;

    /**
     * 응모 처리에 필요한 사용자, 팬미팅, 폼, 답변 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param applicationRepository 응모 저장소
     * @param applicationFormRepository 응모 폼 저장소
     * @param applicationQuestionRepository 응모 질문 저장소
     * @param applicationAnswerRepository 응모 답변 저장소
     * @param clock 현재 시각 공급자
     */
    public ApplicationService(
            CurrentUserService currentUserService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            ApplicationRepository applicationRepository,
            ApplicationFormRepository applicationFormRepository,
            ApplicationQuestionRepository applicationQuestionRepository,
            ApplicationAnswerRepository applicationAnswerRepository,
            Clock clock
    ) {
        this.currentUserService = currentUserService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.applicationRepository = applicationRepository;
        this.applicationFormRepository = applicationFormRepository;
        this.applicationQuestionRepository = applicationQuestionRepository;
        this.applicationAnswerRepository = applicationAnswerRepository;
        this.clock = clock;
    }

    /**
     * 팬의 최초 응모를 생성하거나 취소된 기존 응모를 새 답변으로 다시 접수한다.
     *
     * @param meetingId 응모 대상 팬미팅 식별자
     * @param request 개인정보 동의와 질문 답변
     * @param principal JWT 인증 사용자 정보
     * @return 접수된 응모 정보
     * @throws BusinessException 팬 권한, 응모 기간, 동의 또는 답변이 유효하지 않은 경우
     */
    @Transactional
    public ApplicationSubmitResponse submit(
            Long meetingId, ApplicationSubmitRequest request, AuthenticatedUser principal
    ) {
        User fan = requireFan(principal);
        FanMeeting meeting = requireMeeting(meetingId);
        LocalDateTime now = LocalDateTime.now(clock);
        requireApplicationPeriod(meeting, now);
        if (!request.personalInformationConsent()) {
            throw new BusinessException(ErrorCode.APPLICATION_CONSENT_REQUIRED);
        }

        List<ApplicationQuestion> questions = activeQuestions(meetingId);
        Map<Long, String> answers = validateAnswers(questions, request.answers());
        Application application = applicationRepository
                .findByMeeting_IdAndFan_Id(meetingId, fan.getId())
                .map(existing -> resubmit(existing, now))
                .orElseGet(() -> applicationRepository.save(Application.submit(meeting, fan, now)));
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

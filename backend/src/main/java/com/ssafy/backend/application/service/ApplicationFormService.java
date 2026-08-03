package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationQuestionType;
import com.ssafy.backend.application.dto.ApplicationFormResponse;
import com.ssafy.backend.application.dto.ApplicationFormSaveRequest;
import com.ssafy.backend.application.dto.ApplicationFormSaveResponse;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 팬미팅별 응모 폼 조회와 운영자의 폼 저장을 처리한다. */
@Service
public class ApplicationFormService {

    /** 서버가 허용하는 응모 질문 최대 개수다. */
    private static final int MAX_QUESTION_COUNT = 10;

    /** 응모 폼에서 지원하는 질문 유형이다. */
    private static final Set<ApplicationQuestionType> SUPPORTED_QUESTION_TYPES = EnumSet.of(
            ApplicationQuestionType.SHORT_TEXT,
            ApplicationQuestionType.LONG_TEXT
    );

    /** 응모 폼을 아직 수정할 수 있는 팬미팅 상태다. */
    private static final Set<FanMeetingStatus> EDITABLE_MEETING_STATUSES = EnumSet.of(
            FanMeetingStatus.DRAFT,
            FanMeetingStatus.PUBLISHED
    );

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final ApplicationFormRepository applicationFormRepository;
    private final ApplicationQuestionRepository applicationQuestionRepository;
    private final Clock clock;

    /**
     * 응모 폼 처리에 필요한 사용자, 권한, 팬미팅, 폼, 질문 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param applicationFormRepository 응모 폼 저장소
     * @param applicationQuestionRepository 응모 질문 저장소
     * @param clock 현재 시각 공급자
     */
    public ApplicationFormService(
            CurrentUserService currentUserService,
            MeetingAccessService meetingAccessService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            ApplicationFormRepository applicationFormRepository,
            ApplicationQuestionRepository applicationQuestionRepository,
            Clock clock
    ) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.applicationFormRepository = applicationFormRepository;
        this.applicationQuestionRepository = applicationQuestionRepository;
        this.clock = clock;
    }

    /**
     * 팬미팅의 응모 안내문과 활성 질문을 표시 순서대로 조회한다.
     *
     * @param meetingId 응모 폼을 조회할 팬미팅 식별자
     * @return 응모 폼 조회 응답
     * @throws BusinessException 팬미팅이 없거나 응모 폼이 등록되지 않은 경우
     */
    @Transactional(readOnly = true)
    public ApplicationFormResponse getForm(Long meetingId) {
        requireMeeting(meetingId);
        ApplicationForm form = applicationFormRepository.findByMeeting_Id(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.APPLICATION_FORM_NOT_FOUND));
        return ApplicationFormResponse.of(form, activeQuestions(form.getId()));
    }

    /**
     * 소유 운영자가 응모 시작 전 팬미팅의 응모 안내문과 질문 전체를 저장한다.
     *
     * <p>질문 목록은 전체 교체다. 요청에 없는 기존 질문은 이미 제출된 답변을 보존하기 위해
     * 실제 삭제하지 않고 삭제 시각만 기록한다.
     *
     * @param meetingId 응모 폼을 저장할 팬미팅 식별자
     * @param request 저장할 안내문과 질문 전체 목록
     * @param principal JWT 인증 사용자 정보
     * @return 저장된 응모 폼 응답
     * @throws BusinessException 팬미팅이 없거나 운영 권한이 없는 경우,
     *         응모가 이미 시작된 경우, 질문 개수·순서·유형이 올바르지 않은 경우
     */
    @Transactional
    public ApplicationFormSaveResponse saveForm(
            Long meetingId, ApplicationFormSaveRequest request, AuthenticatedUser principal
    ) {
        User operator = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, operator);
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }
        LocalDateTime now = LocalDateTime.now(clock);
        requireEditable(meeting, now);
        validateQuestions(request.questions());

        ApplicationForm form = applicationFormRepository.findByMeeting_Id(meetingId)
                .orElseGet(() -> applicationFormRepository.save(
                        ApplicationForm.create(meeting, request.formDescription())
                ));
        form.updateDescription(request.formDescription());
        List<ApplicationQuestion> questions = replaceQuestions(form, request.questions(), now);
        return ApplicationFormSaveResponse.of(form, questions, now);
    }

    /** 삭제되지 않은 팬미팅을 조회하고 없으면 공통 예외를 발생시킨다. */
    private FanMeeting requireMeeting(Long meetingId) {
        return fanMeetingRepository.findById(meetingId)
                .filter(meeting -> meeting.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /**
     * 응모가 아직 시작되지 않아 폼을 수정할 수 있는지 검증한다.
     *
     * <p>상태 전이가 늦어져 팬미팅이 아직 PUBLISHED로 남아 있더라도 응모 시작 시각이 지났으면
     * 수정을 거부한다.
     */
    private void requireEditable(FanMeeting meeting, LocalDateTime now) {
        if (!EDITABLE_MEETING_STATUSES.contains(meeting.getStatus())) {
            throw new BusinessException(ErrorCode.APPLICATION_FORM_NOT_EDITABLE);
        }
        LocalDateTime openAt = applicationSettingRepository.findById(meeting.getId())
                .map(MeetingApplicationSetting::getApplicationOpenAt)
                .orElse(null);
        if (openAt != null && !now.isBefore(openAt)) {
            throw new BusinessException(ErrorCode.APPLICATION_FORM_NOT_EDITABLE);
        }
    }

    /** 질문 개수 상한, 표시 순서 중복, 질문 식별자 중복과 지원 유형을 검증한다. */
    private void validateQuestions(List<ApplicationFormSaveRequest.QuestionRequest> questions) {
        if (questions.size() > MAX_QUESTION_COUNT) {
            throw new BusinessException(ErrorCode.APPLICATION_QUESTION_LIMIT_EXCEEDED);
        }
        Set<Integer> displayOrders = new HashSet<>();
        Set<Long> questionIds = new HashSet<>();
        for (ApplicationFormSaveRequest.QuestionRequest question : questions) {
            if (!displayOrders.add(question.displayOrder())) {
                throw new BusinessException(ErrorCode.APPLICATION_QUESTION_ORDER_DUPLICATED);
            }
            if (!SUPPORTED_QUESTION_TYPES.contains(question.questionType())
                    || question.questionId() != null && !questionIds.add(question.questionId())) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST);
            }
        }
    }

    /** 기존 질문을 요청 내용으로 수정하고, 새 질문은 추가하고, 빠진 질문은 삭제 처리한다. */
    private List<ApplicationQuestion> replaceQuestions(
            ApplicationForm form,
            List<ApplicationFormSaveRequest.QuestionRequest> requests,
            LocalDateTime now
    ) {
        Map<Long, ApplicationQuestion> existingById = new HashMap<>();
        for (ApplicationQuestion question : activeQuestions(form.getId())) {
            existingById.put(question.getId(), question);
        }

        List<ApplicationQuestion> result = new ArrayList<>();
        List<ApplicationQuestion> created = new ArrayList<>();
        for (ApplicationFormSaveRequest.QuestionRequest request : requests) {
            if (request.questionId() == null) {
                created.add(ApplicationQuestion.create(
                        form,
                        request.questionText().trim(),
                        request.questionType(),
                        request.required(),
                        request.displayOrder()
                ));
                continue;
            }
            ApplicationQuestion question = existingById.remove(request.questionId());
            if (question == null) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST);
            }
            question.update(
                    request.questionText().trim(),
                    request.questionType(),
                    request.required(),
                    request.displayOrder()
            );
            result.add(question);
        }
        existingById.values().forEach(question -> question.delete(now));

        result.addAll(applicationQuestionRepository.saveAll(created));
        result.sort(Comparator.comparing(ApplicationQuestion::getDisplayOrder));
        return result;
    }

    /** 응모 폼의 삭제되지 않은 질문을 표시 순서대로 조회한다. */
    private List<ApplicationQuestion> activeQuestions(Long formId) {
        return applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(formId);
    }
}

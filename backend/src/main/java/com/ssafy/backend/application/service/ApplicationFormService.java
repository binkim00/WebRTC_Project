package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationOption;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.dto.ApplicationFormResponse;
import com.ssafy.backend.application.dto.ApplicationFormSaveRequest;
import com.ssafy.backend.application.dto.ApplicationFormSaveResponse;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationOptionRepository;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 팬미팅별 응모 폼 조회와 운영자의 폼 저장을 처리한다. */
@Service
public class ApplicationFormService {

    /** 서버가 허용하는 응모 질문 최대 개수다. */
    private static final int MAX_QUESTION_COUNT = 10;

    /** 객관식 질문에 필요한 최소 선택지 개수다. 하나뿐인 선택지는 고를 이유가 없다. */
    private static final int MIN_OPTION_COUNT = 2;

    /** 객관식 질문 하나가 가질 수 있는 최대 선택지 개수다. */
    private static final int MAX_OPTION_COUNT = 10;

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
    private final ApplicationOptionRepository applicationOptionRepository;
    private final Clock clock;

    /**
     * 응모 폼 처리에 필요한 사용자, 권한, 팬미팅, 폼, 질문, 선택지 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param applicationFormRepository 응모 폼 저장소
     * @param applicationQuestionRepository 응모 질문 저장소
     * @param applicationOptionRepository 응모 선택지 저장소
     * @param clock 현재 시각 공급자
     */
    public ApplicationFormService(
            CurrentUserService currentUserService,
            MeetingAccessService meetingAccessService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            ApplicationFormRepository applicationFormRepository,
            ApplicationQuestionRepository applicationQuestionRepository,
            ApplicationOptionRepository applicationOptionRepository,
            Clock clock
    ) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.applicationFormRepository = applicationFormRepository;
        this.applicationQuestionRepository = applicationQuestionRepository;
        this.applicationOptionRepository = applicationOptionRepository;
        this.clock = clock;
    }

    /**
     * 팬미팅의 응모 안내문과 활성 질문을 선택지까지 포함해 표시 순서대로 조회한다.
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
        List<ApplicationQuestion> questions = activeQuestions(form.getId());
        return ApplicationFormResponse.of(form, questions, activeOptions(
                questions.stream().map(ApplicationQuestion::getId).toList()
        ));
    }

    /**
     * 소유 운영자가 응모 시작 전 팬미팅의 응모 안내문과 질문 전체를 저장한다.
     *
     * <p>질문 목록은 전체 교체다. 요청에 없는 기존 질문은 이미 제출된 답변을 보존하기 위해
     * 실제 삭제하지 않고 삭제 시각만 기록하며, 선택지도 같은 방식으로 처리한다.
     *
     * @param meetingId 응모 폼을 저장할 팬미팅 식별자
     * @param request 저장할 안내문과 질문 전체 목록
     * @param principal JWT 인증 사용자 정보
     * @return 저장된 응모 폼 응답
     * @throws BusinessException 팬미팅이 없거나 운영 권한이 없는 경우,
     *         응모가 이미 시작된 경우, 질문 개수·순서·유형·선택지가 올바르지 않은 경우
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
        List<QuestionBinding> bindings = replaceQuestions(form, request.questions(), now);
        Map<Long, List<ApplicationOption>> options = replaceOptions(bindings, now);
        List<ApplicationQuestion> questions = bindings.stream()
                .map(QuestionBinding::question)
                .sorted(Comparator.comparing(ApplicationQuestion::getDisplayOrder))
                .toList();
        return ApplicationFormSaveResponse.of(form, questions, options, now);
    }

    /** 삭제되지 않은 팬미팅을 조회하고 없으면 공통 예외를 발생시킨다. */
    private FanMeeting requireMeeting(Long meetingId) {
        FanMeeting meeting = fanMeetingRepository.findById(meetingId)
                .filter(found -> found.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
        // 외부 선별 팬미팅은 응모 폼을 사용하지 않으므로 조회와 저장을 모두 차단한다.
        if (meeting.isExternalSelection()) {
            throw new BusinessException(ErrorCode.APPLICATION_NOT_SUPPORTED);
        }
        return meeting;
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

    /** 질문 개수 상한, 표시 순서 중복, 질문 식별자 중복과 유형별 선택지 구성을 검증한다. */
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
            if (question.questionId() != null && !questionIds.add(question.questionId())) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST);
            }
            validateOptions(question);
        }
    }

    /**
     * 질문 유형에 맞는 선택지 구성인지 검증한다.
     *
     * <p>객관식은 고를 수 있는 선택지가 2개 이상 있어야 하고, 주관식은 선택지를 가질 수 없다.
     */
    private void validateOptions(ApplicationFormSaveRequest.QuestionRequest question) {
        List<ApplicationFormSaveRequest.OptionRequest> options = question.optionsOrEmpty();
        if (question.questionType().isText()) {
            if (!options.isEmpty()) {
                throw new BusinessException(ErrorCode.APPLICATION_QUESTION_OPTION_INVALID);
            }
            return;
        }
        if (options.size() < MIN_OPTION_COUNT || options.size() > MAX_OPTION_COUNT) {
            throw new BusinessException(ErrorCode.APPLICATION_QUESTION_OPTION_INVALID);
        }
        Set<Integer> displayOrders = new HashSet<>();
        Set<Long> optionIds = new HashSet<>();
        for (ApplicationFormSaveRequest.OptionRequest option : options) {
            if (!displayOrders.add(option.displayOrder())
                    || option.optionId() != null && !optionIds.add(option.optionId())) {
                throw new BusinessException(ErrorCode.APPLICATION_QUESTION_OPTION_INVALID);
            }
        }
    }

    /** 기존 질문을 요청 내용으로 수정하고, 새 질문은 추가하고, 빠진 질문은 삭제 처리한다. */
    private List<QuestionBinding> replaceQuestions(
            ApplicationForm form,
            List<ApplicationFormSaveRequest.QuestionRequest> requests,
            LocalDateTime now
    ) {
        Map<Long, ApplicationQuestion> existingById = new HashMap<>();
        for (ApplicationQuestion question : activeQuestions(form.getId())) {
            existingById.put(question.getId(), question);
        }

        List<QuestionBinding> bindings = new ArrayList<>();
        List<ApplicationQuestion> created = new ArrayList<>();
        List<ApplicationFormSaveRequest.QuestionRequest> createdRequests = new ArrayList<>();
        for (ApplicationFormSaveRequest.QuestionRequest request : requests) {
            if (request.questionId() == null) {
                created.add(ApplicationQuestion.create(
                        form,
                        request.questionText().trim(),
                        request.questionType(),
                        request.required(),
                        request.displayOrder()
                ));
                createdRequests.add(request);
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
            bindings.add(new QuestionBinding(question, request));
        }
        existingById.values().forEach(question -> question.delete(now));

        // 새 질문은 선택지를 붙이기 전에 식별자를 받아야 하므로 먼저 저장한다.
        List<ApplicationQuestion> savedNewQuestions = applicationQuestionRepository.saveAll(created);
        for (int index = 0; index < savedNewQuestions.size(); index++) {
            bindings.add(new QuestionBinding(
                    savedNewQuestions.get(index), createdRequests.get(index)
            ));
        }
        return bindings;
    }

    /**
     * 질문별 선택지를 요청 내용으로 교체하고 질문 식별자별 최종 선택지를 반환한다.
     *
     * <p>주관식으로 유형이 바뀐 질문의 남은 선택지도 함께 삭제 처리해야 하므로 객관식 질문만이
     * 아니라 전체 질문의 기존 선택지를 조회한다.
     */
    private Map<Long, List<ApplicationOption>> replaceOptions(
            List<QuestionBinding> bindings, LocalDateTime now
    ) {
        Map<Long, List<ApplicationOption>> existingByQuestionId = activeOptions(
                bindings.stream().map(binding -> binding.question().getId()).toList()
        );
        Map<Long, List<ApplicationOption>> result = new LinkedHashMap<>();
        List<ApplicationOption> created = new ArrayList<>();
        List<Long> createdQuestionIds = new ArrayList<>();
        for (QuestionBinding binding : bindings) {
            Map<Long, ApplicationOption> existingById = new HashMap<>();
            for (ApplicationOption option
                    : existingByQuestionId.getOrDefault(binding.question().getId(), List.of())) {
                existingById.put(option.getId(), option);
            }

            List<ApplicationOption> kept = new ArrayList<>();
            for (ApplicationFormSaveRequest.OptionRequest request
                    : binding.request().optionsOrEmpty()) {
                if (request.optionId() == null) {
                    created.add(ApplicationOption.create(
                            binding.question(), request.optionText().trim(), request.displayOrder()
                    ));
                    createdQuestionIds.add(binding.question().getId());
                    continue;
                }
                ApplicationOption option = existingById.remove(request.optionId());
                if (option == null) {
                    throw new BusinessException(ErrorCode.APPLICATION_QUESTION_OPTION_INVALID);
                }
                option.update(request.optionText().trim(), request.displayOrder());
                kept.add(option);
            }
            existingById.values().forEach(option -> option.delete(now));
            result.put(binding.question().getId(), kept);
        }

        List<ApplicationOption> savedNewOptions = applicationOptionRepository.saveAll(created);
        for (int index = 0; index < savedNewOptions.size(); index++) {
            result.get(createdQuestionIds.get(index)).add(savedNewOptions.get(index));
        }
        result.values().forEach(options ->
                options.sort(Comparator.comparing(ApplicationOption::getDisplayOrder)));
        return result;
    }

    /** 응모 폼의 삭제되지 않은 질문을 표시 순서대로 조회한다. */
    private List<ApplicationQuestion> activeQuestions(Long formId) {
        return applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(formId);
    }

    /** 질문 식별자 목록의 삭제되지 않은 선택지를 질문 식별자별로 모아 조회한다. */
    private Map<Long, List<ApplicationOption>> activeOptions(List<Long> questionIds) {
        if (questionIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, List<ApplicationOption>> result = new LinkedHashMap<>();
        for (ApplicationOption option : applicationOptionRepository
                .findAllByQuestion_IdInAndDeletedAtIsNullOrderByDisplayOrderAsc(questionIds)) {
            result.computeIfAbsent(option.getQuestion().getId(), key -> new ArrayList<>())
                    .add(option);
        }
        return result;
    }

    /**
     * 저장 대상 질문 엔티티와 그 질문을 만든 요청을 함께 들고 다닌다.
     *
     * <p>새 질문은 저장 후에야 식별자가 생기므로 선택지를 붙이려면 요청과의 짝을 유지해야 한다.
     *
     * @param question 저장된 응모 질문
     * @param request 이 질문을 만든 저장 요청
     */
    private record QuestionBinding(
            ApplicationQuestion question, ApplicationFormSaveRequest.QuestionRequest request
    ) {
    }
}

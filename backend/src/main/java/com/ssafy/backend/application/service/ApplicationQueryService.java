package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.dto.ApplicantAnswerResponse;
import com.ssafy.backend.application.dto.ApplicantListResponse;
import com.ssafy.backend.application.dto.ApplicantResponse;
import com.ssafy.backend.application.dto.ApplicationStatisticsResponse;
import com.ssafy.backend.application.dto.MyApplicationResponse;
import com.ssafy.backend.application.dto.MyApplicationSummaryResponse;
import com.ssafy.backend.application.dto.ParticipantAssignment;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 팬의 응모 결과 조회와 운영자의 응모자 목록·통계 조회를 처리한다. */
@Service
public class ApplicationQueryService {

    /** 목록 조회에서 허용하는 페이지 크기 상한이다. */
    private static final int MAX_PAGE_SIZE = 100;

    /**
     * 유효 응모 집계에서 제외하는 상태다.
     *
     * <p>취소한 응모는 실제 삭제하지 않고 보관하므로 응모자 목록과 통계의 기본 집계에서 제외한다.
     */
    private static final ApplicationStatus EXCLUDED_STATUS = ApplicationStatus.WITHDRAWN;

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final FanMeetingRepository fanMeetingRepository;
    private final ApplicationRepository applicationRepository;
    private final ApplicationFormRepository applicationFormRepository;
    private final ApplicationQuestionRepository applicationQuestionRepository;
    private final ApplicationAnswerRepository applicationAnswerRepository;

    /**
     * 응모 조회에 필요한 사용자, 권한, 팬미팅, 응모, 폼, 질문, 답변 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationRepository 응모 저장소
     * @param applicationFormRepository 응모 폼 저장소
     * @param applicationQuestionRepository 응모 질문 저장소
     * @param applicationAnswerRepository 응모 답변 저장소
     */
    public ApplicationQueryService(
            CurrentUserService currentUserService,
            MeetingAccessService meetingAccessService,
            FanMeetingRepository fanMeetingRepository,
            ApplicationRepository applicationRepository,
            ApplicationFormRepository applicationFormRepository,
            ApplicationQuestionRepository applicationQuestionRepository,
            ApplicationAnswerRepository applicationAnswerRepository
    ) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationRepository = applicationRepository;
        this.applicationFormRepository = applicationFormRepository;
        this.applicationQuestionRepository = applicationQuestionRepository;
        this.applicationAnswerRepository = applicationAnswerRepository;
    }

    /**
     * 팬이 특정 팬미팅에 제출한 자신의 응모 결과와 호출 순서를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 내 응모 결과
     * @throws BusinessException 팬이 아니거나 팬미팅 또는 응모 내역이 없는 경우
     */
    @Transactional(readOnly = true)
    public MyApplicationResponse getMyApplication(Long meetingId, AuthenticatedUser principal) {
        User fan = requireFan(principal);
        requireMeeting(meetingId);
        Application application = applicationRepository
                .findWithMeetingByMeeting_IdAndFan_Id(meetingId, fan.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.APPLICATION_NOT_FOUND));
        return MyApplicationResponse.of(
                application, participantAssignments(List.of(application.getId()))
                        .get(application.getId())
        );
    }

    /**
     * 팬 자신의 전체 응모 내역을 최근 제출 순으로 페이지 조회한다.
     *
     * @param status 조회할 응모 상태이며 null이면 전체 상태를 조회한다
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 내 응모 내역 페이지
     * @throws BusinessException 팬이 아니거나 페이지 값이 허용 범위를 벗어난 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<MyApplicationSummaryResponse> getMyApplications(
            ApplicationStatus status, int page, int size, AuthenticatedUser principal
    ) {
        validatePage(page, size);
        User fan = requireFan(principal);
        Pageable pageable = pageableByRecentSubmission(page, size);
        Page<Application> applications = status == null
                ? applicationRepository.findAllByFan_Id(fan.getId(), pageable)
                : applicationRepository.findAllByFan_IdAndStatus(fan.getId(), status, pageable);

        Map<Long, ParticipantAssignment> assignments = participantAssignments(
                applications.getContent().stream().map(Application::getId).toList()
        );
        return PageResponse.from(applications.map(application -> MyApplicationSummaryResponse.of(
                application, assignments.get(application.getId())
        )));
    }

    /**
     * 소유 운영자가 팬미팅 응모자 목록과 제출 답변을 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 조회할 응모 상태이며 null이면 취소를 제외한 전체를 조회한다
     * @param keyword 팬 닉네임 검색어이며 비어 있으면 전체를 조회한다
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 응모자 목록 응답
     * @throws BusinessException 팬미팅이 없거나 운영 권한이 없는 경우,
     *         페이지 값이 허용 범위를 벗어난 경우
     */
    @Transactional(readOnly = true)
    public ApplicantListResponse getApplicants(
            Long meetingId, ApplicationStatus status, String keyword,
            int page, int size, AuthenticatedUser principal
    ) {
        validatePage(page, size);
        requireOperatorMeeting(meetingId, principal);
        String nickname = StringUtils.hasText(keyword) ? keyword.trim() : "";
        Pageable pageable = pageableByRecentSubmission(page, size);
        Page<Application> applications = status == null
                ? applicationRepository
                .findAllByMeeting_IdAndStatusNotAndFan_NicknameContainingIgnoreCase(
                        meetingId, EXCLUDED_STATUS, nickname, pageable)
                : applicationRepository
                .findAllByMeeting_IdAndStatusAndFan_NicknameContainingIgnoreCase(
                        meetingId, status, nickname, pageable);

        Map<Long, List<ApplicantAnswerResponse>> answers = answersByApplication(
                applications.getContent().stream().map(Application::getId).toList()
        );
        PageResponse<ApplicantResponse> content = PageResponse.from(
                applications.map(application -> ApplicantResponse.of(
                        application, answers.getOrDefault(application.getId(), List.of())
                ))
        );
        return ApplicantListResponse.of(
                applicationRepository.countByMeeting_IdAndStatusNot(meetingId, EXCLUDED_STATUS),
                content
        );
    }

    /**
     * 소유 운영자가 팬미팅의 응모 현황과 질문별 응답 통계를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 응모 현황·통계 응답
     * @throws BusinessException 팬미팅이 없거나 운영 권한이 없는 경우
     */
    @Transactional(readOnly = true)
    public ApplicationStatisticsResponse getStatistics(
            Long meetingId, AuthenticatedUser principal
    ) {
        requireOperatorMeeting(meetingId, principal);
        return new ApplicationStatisticsResponse(
                applicationRepository.countByMeeting_IdAndStatusNot(meetingId, EXCLUDED_STATUS),
                applicationRepository.countByMeeting_IdAndStatus(
                        meetingId, ApplicationStatus.SUBMITTED),
                applicationRepository.countByMeeting_IdAndStatus(
                        meetingId, ApplicationStatus.SELECTED),
                applicationRepository.countByMeeting_IdAndStatus(
                        meetingId, ApplicationStatus.NOT_SELECTED),
                questionStats(meetingId)
        );
    }

    /** 응모 폼의 활성 질문별 응답 수를 표시 순서대로 집계한다. */
    private List<ApplicationStatisticsResponse.QuestionStatResponse> questionStats(Long meetingId) {
        ApplicationForm form = applicationFormRepository.findByMeeting_Id(meetingId).orElse(null);
        if (form == null) {
            return List.of();
        }
        Map<Long, Long> responseCounts = new HashMap<>();
        applicationAnswerRepository
                .countResponsesByQuestion(form.getId(), EXCLUDED_STATUS)
                .forEach(count -> responseCounts.put(
                        count.getQuestionId(), count.getResponseCount()
                ));
        List<ApplicationQuestion> questions = applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(form.getId());
        List<ApplicationStatisticsResponse.QuestionStatResponse> stats =
                new ArrayList<>(questions.size());
        for (ApplicationQuestion question : questions) {
            stats.add(new ApplicationStatisticsResponse.QuestionStatResponse(
                    question.getId(),
                    question.getQuestionText(),
                    responseCounts.getOrDefault(question.getId(), 0L),
                    null
            ));
        }
        return stats;
    }

    /** 응모 식별자별 확정 참가자 배정 정보를 한 번의 조회로 모은다. */
    private Map<Long, ParticipantAssignment> participantAssignments(List<Long> applicationIds) {
        if (applicationIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, ParticipantAssignment> result = new HashMap<>();
        for (ParticipantAssignment assignment
                : applicationRepository.findParticipantAssignments(applicationIds)) {
            result.put(assignment.applicationId(), assignment);
        }
        return result;
    }

    /** 응모 식별자별 제출 답변을 한 번의 조회로 모아 질문 표시 순서를 유지한다. */
    private Map<Long, List<ApplicantAnswerResponse>> answersByApplication(
            List<Long> applicationIds
    ) {
        if (applicationIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, List<ApplicantAnswerResponse>> result = new HashMap<>();
        List<ApplicationAnswer> answers = applicationAnswerRepository
                .findAllByApplication_IdInOrderByQuestion_DisplayOrderAsc(applicationIds);
        for (ApplicationAnswer answer : answers) {
            result.computeIfAbsent(answer.getApplication().getId(), key -> new ArrayList<>())
                    .add(ApplicantAnswerResponse.from(answer));
        }
        return result;
    }

    /** 현재 인증 사용자가 팬 역할인지 확인하고 활성 사용자 엔티티를 반환한다. */
    private User requireFan(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.getRole() != UserRole.FAN) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /** 현재 인증 사용자가 해당 팬미팅의 운영자인지 확인하고 팬미팅을 반환한다. */
    private FanMeeting requireOperatorMeeting(Long meetingId, AuthenticatedUser principal) {
        User operator = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, operator);
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }
        return meeting;
    }

    /** 삭제되지 않은 팬미팅을 조회하고 없으면 공통 예외를 발생시킨다. */
    private FanMeeting requireMeeting(Long meetingId) {
        return fanMeetingRepository.findById(meetingId)
                .filter(meeting -> meeting.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 최근 제출 순으로 정렬하는 페이지 요청을 생성한다. */
    private Pageable pageableByRecentSubmission(int page, int size) {
        return PageRequest.of(page, size, Sort.by(
                Sort.Order.desc("submittedAt"), Sort.Order.desc("id")
        ));
    }

    /** 페이지 번호와 크기가 허용 범위인지 검증한다. */
    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}

package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.dto.DrawResultResponse;
import com.ssafy.backend.application.dto.ResultPublishResponse;
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
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.service.QueueInitializationService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Random;

/**
 * 운영자의 당첨자 추첨과 응모 결과 공개를 처리한다.
 *
 * <p>추첨은 참가자 생성과 대기열 초기화까지 한 트랜잭션에서 처리해 응모부터 대기열까지의
 * 흐름이 코드만으로 이어지도록 한다.
 */
@Service
public class ApplicationDrawService {

    /** 추첨 대상 집계에서 제외하는 응모 상태다. */
    private static final ApplicationStatus EXCLUDED_STATUS = ApplicationStatus.WITHDRAWN;

    /** 응모 결과 알림의 제목이다. */
    private static final String RESULT_NOTIFICATION_TITLE = "응모 결과 안내";

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final ApplicationRepository applicationRepository;
    private final ParticipantRepository participantRepository;
    private final NotificationRepository notificationRepository;
    private final QueueInitializationService queueInitializationService;
    private final Clock clock;
    private final Random random;

    /**
     * 추첨과 결과 공개에 필요한 구성 요소를 주입받고 실제 추첨에는 보안 난수를 사용한다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param applicationRepository 응모 저장소
     * @param participantRepository 참가자 저장소
     * @param notificationRepository 알림 저장소
     * @param queueInitializationService 대기열 초기화 서비스
     * @param clock 현재 시각 공급자
     */
    @Autowired
    public ApplicationDrawService(
            CurrentUserService currentUserService,
            MeetingAccessService meetingAccessService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            ApplicationRepository applicationRepository,
            ParticipantRepository participantRepository,
            NotificationRepository notificationRepository,
            QueueInitializationService queueInitializationService,
            Clock clock
    ) {
        this(currentUserService, meetingAccessService, fanMeetingRepository,
                applicationSettingRepository, applicationRepository, participantRepository,
                notificationRepository, queueInitializationService, clock, new SecureRandom());
    }

    /**
     * 난수 생성기까지 지정해 추첨 결과를 재현할 수 있게 한다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 응모 설정 저장소
     * @param applicationRepository 응모 저장소
     * @param participantRepository 참가자 저장소
     * @param notificationRepository 알림 저장소
     * @param queueInitializationService 대기열 초기화 서비스
     * @param clock 현재 시각 공급자
     * @param random 당첨자 순서를 섞을 난수 생성기
     */
    ApplicationDrawService(
            CurrentUserService currentUserService,
            MeetingAccessService meetingAccessService,
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            ApplicationRepository applicationRepository,
            ParticipantRepository participantRepository,
            NotificationRepository notificationRepository,
            QueueInitializationService queueInitializationService,
            Clock clock,
            Random random
    ) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.applicationRepository = applicationRepository;
        this.participantRepository = participantRepository;
        this.notificationRepository = notificationRepository;
        this.queueInitializationService = queueInitializationService;
        this.clock = clock;
        this.random = random;
    }

    /**
     * 유효 응모자 중 모집 정원만큼 무작위로 추첨해 참가자와 대기열을 만든다.
     *
     * <p>응모 마감 시각이 지난 뒤에만 추첨할 수 있고, 응모 접수 중인 팬미팅은 추첨 직전에
     * 응모 마감 상태로 전환한다. 당첨자는 뽑힌 무작위 순서대로 1부터 연속된 호출 순번을 받고,
     * 남은 응모는 미당첨으로 확정된다. 참가자를 저장한 직후 같은 트랜잭션에서 대기열을
     * 초기화하므로 추첨이 성공하면 대기열까지 준비된 상태가 된다.
     *
     * @param meetingId 추첨할 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 당첨·미당첨 수와 생성된 참가자 수
     * @throws BusinessException 운영 권한이 없거나 추첨할 수 없는 상태, 아직 응모 마감 시각 전인
     *         경우, 이미 추첨이 끝난 경우, 이미 대기열이 초기화된 경우
     */
    @Transactional
    public DrawResultResponse draw(Long meetingId, AuthenticatedUser principal) {
        FanMeeting meeting = requireOperatorMeetingForUpdate(meetingId, principal);
        requireNotDrawn(meetingId);

        MeetingApplicationSetting setting = requireApplicationSetting(meetingId);
        LocalDateTime drawCompletedAt = LocalDateTime.now(clock);
        requireApplicationsFinished(meeting, setting, drawCompletedAt);

        Integer capacity = setting.getCapacity();
        List<Application> candidates = eligibleApplications(meetingId);
        if (capacity == null || capacity <= 0 || candidates.isEmpty()) {
            throw new BusinessException(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED);
        }

        closeApplicationsIfOpen(meeting);
        Collections.shuffle(candidates, random);
        int winnerCount = Math.min(capacity, candidates.size());
        List<Participant> participants = decideResults(
                meeting, candidates, winnerCount, drawCompletedAt
        );

        participantRepository.saveAllAndFlush(participants);
        queueInitializationService.initializeAfterDraw(meeting);
        return new DrawResultResponse(
                winnerCount, candidates.size() - winnerCount, participants.size(), drawCompletedAt
        );
    }

    /**
     * 추첨이 끝난 팬미팅의 응모 결과를 공개하고 응모자에게 결과 알림을 생성한다.
     *
     * <p>알림 생성에 성공하면 같은 트랜잭션에서 팬미팅을 시작 대기 상태로 전환해 이후 팬미팅
     * 시작 흐름으로 이어지게 한다. 전환에 실패하면 결과 공개 전체가 취소된다.
     *
     * @param meetingId 결과를 공개할 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공개 시각과 생성된 알림 수
     * @throws BusinessException 운영 권한이 없거나 추첨 전인 경우, 이미 결과를 공개한 경우,
     *         응모 마감 상태가 아니어서 준비 완료 처리할 수 없는 경우
     */
    @Transactional
    public ResultPublishResponse publishResults(Long meetingId, AuthenticatedUser principal) {
        FanMeeting meeting = requireOperatorMeetingForUpdate(meetingId, principal);
        if (notificationRepository.existsByMeeting_IdAndType(
                meetingId, NotificationType.APPLICATION_RESULT)) {
            throw new BusinessException(ErrorCode.APPLICATION_RESULT_ALREADY_PUBLISHED);
        }

        List<Application> decided = applicationRepository
                .findAllByMeeting_IdAndStatusNot(meetingId, EXCLUDED_STATUS)
                .stream()
                .filter(application -> application.getStatus() == ApplicationStatus.SELECTED
                        || application.getStatus() == ApplicationStatus.NOT_SELECTED)
                .toList();
        if (decided.isEmpty()) {
            throw new BusinessException(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED);
        }

        List<Notification> notifications = decided.stream()
                .map(application -> Notification.create(
                        application.getFan(), meeting, NotificationType.APPLICATION_RESULT,
                        RESULT_NOTIFICATION_TITLE, resultMessage(meeting, application)
                ))
                .toList();
        notificationRepository.saveAll(notifications);
        markMeetingReady(meeting);
        return ResultPublishResponse.published(
                LocalDateTime.now(clock), notifications.size()
        );
    }

    /**
     * 무작위로 섞인 응모를 앞에서부터 당첨 처리하고 나머지를 미당첨으로 확정한다.
     *
     * @param meeting 추첨 대상 팬미팅
     * @param candidates 무작위로 섞인 유효 응모 목록
     * @param winnerCount 당첨시킬 응모 수
     * @param drawCompletedAt 추첨 완료 시각
     * @return 당첨자 순서대로 생성된 참가자 목록
     * @throws BusinessException 접수 상태가 아닌 응모가 섞여 있는 경우
     */
    private List<Participant> decideResults(FanMeeting meeting, List<Application> candidates,
                                            int winnerCount, LocalDateTime drawCompletedAt) {
        List<Participant> participants = new ArrayList<>(winnerCount);
        try {
            for (int index = 0; index < candidates.size(); index++) {
                Application application = candidates.get(index);
                if (index < winnerCount) {
                    application.select(drawCompletedAt);
                    participants.add(Participant.createFromApplication(
                            meeting, application.getFan(), application, index + 1
                    ));
                } else {
                    application.reject(drawCompletedAt);
                }
            }
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.APPLICATION_STATE_CONFLICT);
        }
        return participants;
    }

    /**
     * 취소되지 않고 활성 팬이 제출한 접수 상태의 응모를 식별자 순서로 모은다.
     *
     * <p>난수를 고정하면 같은 결과가 나오도록 섞기 전 순서를 응모 식별자로 확정한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 추첨 대상이 되는 유효 응모 목록
     */
    private List<Application> eligibleApplications(Long meetingId) {
        return new ArrayList<>(applicationRepository
                .findAllByMeeting_IdAndStatusNot(meetingId, EXCLUDED_STATUS)
                .stream()
                .filter(application -> application.getStatus() == ApplicationStatus.SUBMITTED)
                .filter(application -> application.getFan().getStatus() == UserStatus.ACTIVE)
                .sorted(Comparator.comparing(Application::getId))
                .toList());
    }

    /**
     * 현재 사용자의 운영 권한을 검증하고 팬미팅을 비관적 잠금으로 조회한다.
     *
     * <p>같은 팬미팅에 대한 추첨과 결과 공개 요청이 동시에 들어와도 순서대로 처리되게 한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 잠금이 적용된 팬미팅
     * @throws BusinessException 팬미팅이 없거나 삭제되었거나 운영 권한이 없는 경우
     */
    private FanMeeting requireOperatorMeetingForUpdate(
            Long meetingId, AuthenticatedUser principal
    ) {
        User operator = currentUserService.requireActiveUser(principal);
        meetingAccessService.requireOperator(meetingId, operator);
        FanMeeting meeting = fanMeetingRepository.findByIdForUpdate(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }
        // 외부 선별 팬미팅은 응모가 없어 추첨과 결과 공개 대상이 아니다.
        if (meeting.isExternalSelection()) {
            throw new BusinessException(ErrorCode.APPLICATION_NOT_SUPPORTED);
        }
        return meeting;
    }

    /**
     * 응모가 끝나 추첨을 시작할 수 있는 상태인지 검증한다.
     *
     * <p>응모 마감 시각 전에 추첨하면 추첨 직후 접수된 응모가 결과에서 누락되므로
     * 응모 접수 중인 팬미팅은 마감 시각이 지난 뒤에만 추첨을 허용한다. 이미 응모가 마감된
     * 팬미팅은 마감 시각과 무관하게 추첨할 수 있다. 마감 시각 판단은 응모 제출 검증과 동일한
     * {@link Clock} 기준을 사용한다.
     *
     * @param meeting 추첨 대상 팬미팅
     * @param setting 응모 마감 시각을 담은 응모 설정
     * @param now 추첨을 요청한 시각
     * @throws BusinessException 응모 접수·마감 상태가 아니거나 아직 응모 마감 시각 전인 경우
     */
    private void requireApplicationsFinished(FanMeeting meeting,
                                             MeetingApplicationSetting setting,
                                             LocalDateTime now) {
        if (meeting.getStatus() == FanMeetingStatus.APPLICATION_CLOSED) {
            return;
        }
        if (meeting.getStatus() != FanMeetingStatus.APPLICATION_OPEN) {
            throw new BusinessException(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED);
        }
        LocalDateTime applicationCloseAt = setting.getApplicationCloseAt();
        if (applicationCloseAt == null || now.isBefore(applicationCloseAt)) {
            throw new BusinessException(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED);
        }
    }

    /**
     * 응모 접수 중인 팬미팅을 추첨 직전에 응모 마감 상태로 전환한다.
     *
     * <p>추첨과 같은 트랜잭션에서 전환하므로 추첨이 실패하면 마감 전환도 함께 취소된다.
     * 이미 마감된 팬미팅은 상태를 다시 바꾸지 않는다.
     *
     * @param meeting 추첨 대상 팬미팅
     * @throws BusinessException 응모를 마감할 수 없는 상태인 경우
     */
    private void closeApplicationsIfOpen(FanMeeting meeting) {
        if (meeting.getStatus() != FanMeetingStatus.APPLICATION_OPEN) {
            return;
        }
        try {
            meeting.closeApplications();
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
    }

    /**
     * 결과 공개를 마친 팬미팅을 시작 대기 상태로 전환한다.
     *
     * <p>전환에 실패하면 예외가 트랜잭션을 되돌려 결과 알림 생성까지 함께 취소된다.
     *
     * @param meeting 결과를 공개한 팬미팅
     * @throws BusinessException 응모 마감 상태가 아니어서 준비 완료 처리할 수 없는 경우
     */
    private void markMeetingReady(FanMeeting meeting) {
        try {
            meeting.markReady();
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
    }

    /**
     * 아직 추첨하지 않은 팬미팅인지 검증해 재추첨을 막는다.
     *
     * @param meetingId 팬미팅 식별자
     * @throws BusinessException 참가자가 있거나 결과가 확정된 응모가 있는 경우
     */
    private void requireNotDrawn(Long meetingId) {
        if (participantRepository.countByMeeting_Id(meetingId) > 0
                || applicationRepository.countByMeeting_IdAndStatus(
                        meetingId, ApplicationStatus.SELECTED) > 0
                || applicationRepository.countByMeeting_IdAndStatus(
                        meetingId, ApplicationStatus.NOT_SELECTED) > 0) {
            throw new BusinessException(ErrorCode.APPLICATION_DRAW_ALREADY_COMPLETED);
        }
    }

    /**
     * 모집 정원을 확인할 응모 설정을 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 팬미팅 응모 설정
     * @throws BusinessException 응모 설정이 없는 경우
     */
    private MeetingApplicationSetting requireApplicationSetting(Long meetingId) {
        return applicationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.APPLICATION_SETTING_NOT_FOUND));
    }

    /**
     * 응모 결과에 맞는 알림 본문을 만든다.
     *
     * @param meeting 결과를 공개한 팬미팅
     * @param application 알림 대상 응모
     * @return 당첨 여부에 따른 알림 본문
     */
    private String resultMessage(FanMeeting meeting, Application application) {
        return application.getStatus() == ApplicationStatus.SELECTED
                ? meeting.getTitle() + " 팬미팅 응모에 당첨되었습니다."
                : meeting.getTitle() + " 팬미팅 응모에 당첨되지 않았습니다.";
    }
}

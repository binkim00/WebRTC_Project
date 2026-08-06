package com.ssafy.backend.device.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.device.domain.DeviceCheck;
import com.ssafy.backend.device.dto.DeviceCheckRequest;
import com.ssafy.backend.device.dto.DeviceCheckResponse;
import com.ssafy.backend.device.repository.DeviceCheckRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 팬미팅 입장 전 수행한 장비 점검 결과를 저장한다. */
@Service
public class DeviceCheckService {

    /** 장비 이상이 있어도 입장을 막지 않기로 확정되어 입장 가능 여부는 항상 참이다. */
    private static final boolean ALWAYS_CAN_ENTER = true;

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final ParticipantRepository participantRepository;
    private final DeviceCheckRepository deviceCheckRepository;
    private final Clock clock;

    /**
     * 장비 점검 저장에 필요한 권한 검증기와 저장소를 주입받는다.
     *
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 조회 서비스
     * @param participantRepository 참가자 저장소
     * @param deviceCheckRepository 장비 점검 저장소
     * @param clock 점검 시각 계산에 사용하는 시계
     */
    public DeviceCheckService(CurrentUserService currentUserService,
                              MeetingAccessService meetingAccessService,
                              ParticipantRepository participantRepository,
                              DeviceCheckRepository deviceCheckRepository,
                              Clock clock) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.participantRepository = participantRepository;
        this.deviceCheckRepository = deviceCheckRepository;
        this.clock = clock;
    }

    /**
     * 참가 팬 또는 배정 인플루언서의 장비 점검 결과를 저장한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param request 카메라·마이크·스피커·네트워크 점검 결과
     * @param principal JWT 인증 사용자 정보
     * @return 저장된 점검 결과와 경고 표시 여부
     * @throws BusinessException 팬미팅이 없거나 이미 종료·취소되었거나 점검 권한이 없거나
     *                          요청 값이 잘못된 경우
     */
    @Transactional
    public DeviceCheckResponse saveDeviceCheck(
            Long meetingId, DeviceCheckRequest request, AuthenticatedUser principal
    ) {
        validateRequest(request);
        User user = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = meetingAccessService.requireMeeting(meetingId);
        if (!canCheckDevice(meeting, user)) {
            throw new BusinessException(ErrorCode.DEVICE_CHECK_NOT_ALLOWED);
        }
        // 종료·취소 확인은 권한 검증 뒤에 둔다. 무관한 사용자에게는 팬미팅 진행 상태 대신
        // 기존과 같은 권한 오류만 알려 준다.
        meetingAccessService.requireJoinable(meeting);

        DeviceCheck saved = deviceCheckRepository.save(DeviceCheck.record(
                meeting,
                user,
                request.cameraOk(),
                request.microphoneOk(),
                request.speakerOk(),
                request.networkOk(),
                LocalDateTime.now(clock)
        ));
        return DeviceCheckResponse.of(saved, warningRequired(request), ALWAYS_CAN_ENTER);
    }

    /**
     * 필수 점검 항목이 모두 전달되었는지 검증한다.
     *
     * @param request 장비 점검 저장 요청
     * @throws BusinessException 요청이 없거나 필수 점검 항목이 비어 있는 경우
     */
    private void validateRequest(DeviceCheckRequest request) {
        if (request == null || request.cameraOk() == null || request.microphoneOk() == null
                || request.networkOk() == null) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    /**
     * 사용자가 해당 팬미팅의 참가 팬이거나 배정 인플루언서인지 확인한다.
     *
     * @param meeting 점검 대상 팬미팅
     * @param user 점검을 요청한 사용자
     * @return 장비 점검 결과를 저장할 수 있으면 참
     */
    private boolean canCheckDevice(FanMeeting meeting, User user) {
        if (meeting.getInfluencer() != null
                && meeting.getInfluencer().getId().equals(user.getId())) {
            return true;
        }
        return participantRepository
                .findByMeeting_IdAndFan_Id(meeting.getId(), user.getId())
                .isPresent();
    }

    /**
     * 실패한 점검 항목이 있어 경고를 표시해야 하는지 판단한다.
     *
     * <p>스피커는 선택 항목이므로 점검하지 않은 경우에는 경고 대상으로 보지 않는다.
     *
     * @param request 장비 점검 저장 요청
     * @return 경고를 표시해야 하면 참
     */
    private boolean warningRequired(DeviceCheckRequest request) {
        return !request.cameraOk() || !request.microphoneOk() || !request.networkOk()
                || Boolean.FALSE.equals(request.speakerOk());
    }
}

package com.ssafy.backend.meeting.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 팬미팅 조회와 행사 운영 권한 검증을 공통으로 처리한다. */
@Service
public class MeetingAccessService {
    private final FanMeetingRepository fanMeetingRepository;
    private final OrganizationMemberRepository organizationMemberRepository;

    /** 팬미팅과 조직 구성원 저장소를 주입받는다. */
    public MeetingAccessService(FanMeetingRepository fanMeetingRepository,
                                OrganizationMemberRepository organizationMemberRepository) {
        this.fanMeetingRepository = fanMeetingRepository;
        this.organizationMemberRepository = organizationMemberRepository;
    }

    /** 팬미팅을 조회하고 존재하지 않으면 공통 오류를 발생시킨다. */
    @Transactional(readOnly = true)
    public FanMeeting requireMeeting(Long meetingId) {
        return fanMeetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /**
     * 팬미팅을 조회하고 대기실 입장·장비 점검을 이어갈 수 있는 상태인지까지 검증한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 아직 종료·취소되지 않은 팬미팅
     * @throws BusinessException 팬미팅이 없거나 이미 종료·취소된 경우
     */
    @Transactional(readOnly = true)
    public FanMeeting requireJoinableMeeting(Long meetingId) {
        FanMeeting meeting = requireMeeting(meetingId);
        requireJoinable(meeting);
        return meeting;
    }

    /**
     * 팬미팅이 종료·취소된 뒤에도 남아 있는 진입 동선을 막는다.
     *
     * <p>ENDED와 CANCELED는 되돌릴 수 없는 최종 상태이며, 이 두 상태에서는 팬에게
     * 녹화 다시보기와 기념 카드만 남겨야 한다. 그 앞 단계(READY 이전)는 아직 참가자가
     * 없어 각 기능의 참가자 검증에서 걸리므로 여기서 따로 좁히지 않는다.
     *
     * @param meeting 검증할 팬미팅
     * @throws BusinessException 이미 종료·취소된 팬미팅인 경우
     */
    public void requireJoinable(FanMeeting meeting) {
        if (meeting.getStatus() == FanMeetingStatus.ENDED
                || meeting.getStatus() == FanMeetingStatus.CANCELED) {
            throw new BusinessException(ErrorCode.FAN_MEETING_CLOSED);
        }
    }

    /** 사용자가 해당 팬미팅의 인플루언서·관리자·활성 조직 구성원인지 검증한다. */
    @Transactional(readOnly = true)
    public FanMeeting requireOperator(Long meetingId, User user) {
        FanMeeting meeting = requireMeeting(meetingId);
        if (user.getRole() == UserRole.ADMIN || sameUser(meeting.getInfluencer(), user)
                || sameUser(meeting.getManager(), user)) {
            return meeting;
        }
        if (meeting.getOrganization() != null && organizationMemberRepository
                .existsByOrganization_IdAndUser_IdAndStatus(
                        meeting.getOrganization().getId(), user.getId(), OrganizationMemberStatus.ACTIVE)) {
            return meeting;
        }
        throw new BusinessException(ErrorCode.ACCESS_DENIED);
    }

    /**
     * 사용자가 해당 팬미팅을 주최한 인플루언서 본인인지 검증한다.
     * 매니저나 조직 구성원은 통과하지 못하므로 인플루언서 전용 기능에만 사용한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param user 검증할 활성 사용자
     * @return 권한 검증을 통과한 팬미팅
     * @throws BusinessException 팬미팅이 없거나 해당 팬미팅의 인플루언서가 아닌 경우
     */
    @Transactional(readOnly = true)
    public FanMeeting requireInfluencer(Long meetingId, User user) {
        FanMeeting meeting = requireMeeting(meetingId);
        if (!sameUser(meeting.getInfluencer(), user)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return meeting;
    }

    /**
     * 사용자가 해당 팬미팅의 매니저인지 검증한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param user 검증할 활성 사용자
     * @return 권한 검증을 통과한 팬미팅
     * @throws BusinessException 해당 팬미팅의 매니저가 아닌 경우
     */
    @Transactional(readOnly = true)
    public FanMeeting requireManager(Long meetingId, User user) {
        FanMeeting meeting = requireMeeting(meetingId);
        if (user.getRole() == UserRole.SOLO_INFLUENCER
                && sameUser(meeting.getInfluencer(), user)) {
            return meeting;
        }
        if (user.getRole() != UserRole.MANAGER) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        if (sameUser(meeting.getManager(), user)) {
            return meeting;
        }
        if (meeting.getOrganization() != null && organizationMemberRepository
                .existsByOrganization_IdAndUser_IdAndMemberTypeAndStatus(
                        meeting.getOrganization().getId(),
                        user.getId(),
                        OrganizationMemberType.MANAGER,
                        OrganizationMemberStatus.ACTIVE)) {
            return meeting;
        }
        throw new BusinessException(ErrorCode.ACCESS_DENIED);
    }

    /** 두 사용자의 영속 식별자가 같은지 확인한다. */
    private boolean sameUser(User left, User right) {
        return left != null && left.getId().equals(right.getId());
    }
}

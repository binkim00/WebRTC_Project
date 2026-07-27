package com.ssafy.backend.meeting.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
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

    /** 두 사용자의 영속 식별자가 같은지 확인한다. */
    private boolean sameUser(User left, User right) {
        return left != null && left.getId().equals(right.getId());
    }
}

package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.dto.ParticipantFanSummaryResponse;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 인플루언서가 개최한 팬미팅에 실제로 참가한 팬을 중복 없이 조회한다. */
@Service
public class ParticipantFanService {

    private static final int MAX_PAGE_SIZE = 100;

    /**
     * 집계 대상으로 삼는 팬미팅 상태다.
     *
     * <p>아직 열리지 않은 팬미팅의 참가자도 추첨 시점에 이미 확정되지만, 실제로 만난 팬만 보여야
     * 하고 미래 개최일이 최근 참여일로 올라오는 것도 막아야 하므로 종료된 팬미팅만 집계한다.
     */
    private static final FanMeetingStatus TARGET_MEETING_STATUS = FanMeetingStatus.ENDED;

    private final CurrentUserService currentUserService;
    private final ParticipantRepository participantRepository;

    /**
     * 참가 팬 조회에 필요한 협력 객체를 주입받는다.
     *
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param participantRepository 참가자 집계 조회 저장소
     */
    public ParticipantFanService(CurrentUserService currentUserService,
                                 ParticipantRepository participantRepository) {
        this.currentUserService = currentUserService;
        this.participantRepository = participantRepository;
    }

    /**
     * 로그인한 인플루언서가 개최한 팬미팅에 참가한 팬을 중복 없이 조회한다.
     *
     * <p>팔로우 관계가 아니라 참가 이력만으로 집계하므로 팔로워 목록과 결과가 다르다. 개최자
     * 조건을 팬미팅에 걸기 때문에 다른 인플루언서가 개최한 팬미팅의 참가자는 포함되지 않는다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 최근 참여일 내림차순으로 정렬한 참가 팬 요약 페이지
     * @throws BusinessException 인플루언서 역할이 아니거나 페이지 요청 값이 허용 범위를 벗어난 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<ParticipantFanSummaryResponse> getMyParticipantFans(
            int page, int size, AuthenticatedUser principal
    ) {
        User influencer = requireCurrentInfluencer(principal);
        Page<ParticipantFanSummaryResponse> summaries =
                participantRepository.findParticipantFanSummaries(
                        influencer.getId(), TARGET_MEETING_STATUS, pageRequest(page, size)
                );
        return PageResponse.from(summaries);
    }

    /**
     * 현재 사용자가 참가 팬 목록을 조회할 수 있는 인플루언서 역할인지 검증한다.
     *
     * <p>URL 단위 역할 검사와 별개로, 다른 역할이 토큰만 바꿔 접근하는 경우까지 막는다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 검증을 통과한 인플루언서 사용자
     * @throws BusinessException 인플루언서 또는 1인 인플루언서가 아닌 경우
     */
    private User requireCurrentInfluencer(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        UserRole role = user.getRole();
        if (role != UserRole.INFLUENCER && role != UserRole.SOLO_INFLUENCER) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /**
     * 목록 API의 페이지 번호와 크기를 검증해 페이지 요청을 생성한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @return 검증을 통과한 페이지 요청
     * @throws BusinessException 페이지 번호가 음수이거나 크기가 허용 범위를 벗어난 경우
     */
    private PageRequest pageRequest(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return PageRequest.of(page, size);
    }
}

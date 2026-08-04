package com.ssafy.backend.participant.service;

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
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.dto.ExternalParticipantConfirmResponse;
import com.ssafy.backend.participant.dto.ExternalParticipantPreviewResponse;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.participant.support.ExternalParticipantCsvParser;
import com.ssafy.backend.participant.support.ExternalParticipantCsvRow;
import com.ssafy.backend.participant.support.ExternalParticipantFileError;
import com.ssafy.backend.participant.support.ExternalParticipantRowError;
import com.ssafy.backend.queue.dto.QueueInitializationResponse;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.queue.service.QueueInitializationService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 외부에서 선별한 참가자 명단 CSV를 검증하고 참가자로 확정한다.
 *
 * <p>CSV 원본 파일은 저장하지 않고 요청 처리 중에만 사용한다. 명단은 한 번만 확정할 수 있으며
 * 확정 시 참가자 생성과 대기열 초기화, 팬미팅 준비 완료 전환을 한 트랜잭션에서 처리한다.
 */
@Service
public class ExternalParticipantService {

    /** 명단 이메일의 형식을 확인하는 최소 패턴이다. */
    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final ParticipantRepository participantRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final UserRepository userRepository;
    private final QueueInitializationService queueInitializationService;
    private final ExternalParticipantCsvParser csvParser;
    private final Clock clock;

    /**
     * 명단 검증과 확정에 필요한 구성 요소를 주입받는다.
     *
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 팬미팅 응모 설정 저장소
     * @param participantRepository 참가자 저장소
     * @param queueEntryRepository 대기열 항목 저장소
     * @param userRepository 사용자 저장소
     * @param queueInitializationService 대기열 초기화 서비스
     * @param csvParser 명단 CSV 파서
     * @param clock 확정 시각 기준 시계
     */
    public ExternalParticipantService(CurrentUserService currentUserService,
                                      MeetingAccessService meetingAccessService,
                                      FanMeetingRepository fanMeetingRepository,
                                      MeetingApplicationSettingRepository applicationSettingRepository,
                                      ParticipantRepository participantRepository,
                                      QueueEntryRepository queueEntryRepository,
                                      UserRepository userRepository,
                                      QueueInitializationService queueInitializationService,
                                      ExternalParticipantCsvParser csvParser,
                                      Clock clock) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.participantRepository = participantRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.userRepository = userRepository;
        this.queueInitializationService = queueInitializationService;
        this.csvParser = csvParser;
        this.clock = clock;
    }

    /**
     * 명단 CSV를 검증만 하고 확정하지 않은 결과를 돌려준다.
     *
     * @param meetingId 팬미팅 식별자
     * @param file 업로드된 명단 CSV
     * @param principal JWT 인증 사용자 정보
     * @return 행별 검증 결과와 확정 가능 여부
     * @throws BusinessException 운영 권한이 없거나 외부 선별 팬미팅이 아니거나
     *                          공개 상태가 아니거나 이미 명단이 확정된 경우
     */
    @Transactional(readOnly = true)
    public ExternalParticipantPreviewResponse preview(
            Long meetingId, MultipartFile file, AuthenticatedUser principal
    ) {
        User operator = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireUploadableMeeting(meetingId, operator);
        return validate(meeting, file).toPreview();
    }

    /**
     * 명단 CSV를 다시 검증하고 오류가 하나도 없을 때만 참가자와 대기열을 생성한다.
     *
     * <p>검증에 실패하면 참가자를 한 명도 만들지 않고 전체를 취소한다. 참가자 생성, 대기열 초기화,
     * 준비 완료 전환은 한 트랜잭션에서 처리하며, 같은 팬미팅에 동시에 들어온 확정 요청은
     * 팬미팅 행 잠금과 참가자 유일 제약으로 중복 생성을 막는다.
     *
     * @param meetingId 팬미팅 식별자
     * @param file 업로드된 명단 CSV
     * @param principal JWT 인증 사용자 정보
     * @return 생성된 참가자 수와 확정 후 팬미팅 상태
     * @throws BusinessException 검증에 실패했거나 이미 명단이 확정된 경우
     */
    @Transactional
    public ExternalParticipantConfirmResponse confirm(
            Long meetingId, MultipartFile file, AuthenticatedUser principal
    ) {
        User operator = currentUserService.requireActiveUser(principal);
        requireUploadableMeeting(meetingId, operator);

        // 동시 확정 요청을 직렬화하기 위해 팬미팅 행을 잠그고 상태를 다시 확인한다.
        FanMeeting meeting = fanMeetingRepository.findByIdForUpdate(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));
        requireExternalSelection(meeting);
        requirePublished(meeting);
        requireNotConfirmed(meetingId);

        ValidationResult result = validate(meeting, file);
        if (!result.confirmable()) {
            throw new BusinessException(ErrorCode.EXTERNAL_PARTICIPANT_CSV_INVALID);
        }

        List<Participant> participants = result.rows().stream()
                .map(row -> Participant.createFromExternalSelection(
                        meeting, row.user(), row.callOrder()))
                .toList();
        participantRepository.saveAllAndFlush(participants);

        QueueInitializationResponse queue = queueInitializationService.initializeAfterDraw(meeting);
        try {
            meeting.markReady();
        } catch (IllegalStateException exception) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
        return new ExternalParticipantConfirmResponse(
                meetingId,
                participants.size(),
                queue.initializedCount(),
                meeting.getStatus(),
                LocalDateTime.now(clock)
        );
    }

    /**
     * 운영 권한과 팬미팅 상태를 확인해 명단을 올릴 수 있는 팬미팅인지 검증한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param operator 요청한 운영자
     * @return 명단 등록이 가능한 팬미팅
     * @throws BusinessException 권한이 없거나 외부 선별 팬미팅이 아니거나
     *                          공개 상태가 아니거나 이미 명단이 확정된 경우
     */
    private FanMeeting requireUploadableMeeting(Long meetingId, User operator) {
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, operator);
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }
        requireExternalSelection(meeting);
        requirePublished(meeting);
        requireNotConfirmed(meetingId);
        return meeting;
    }

    /**
     * 외부 선별 방식으로 만든 팬미팅인지 확인한다.
     *
     * @param meeting 확인할 팬미팅
     * @throws BusinessException 외부 선별 방식이 아닌 경우
     */
    private void requireExternalSelection(FanMeeting meeting) {
        if (!meeting.isExternalSelection()) {
            throw new BusinessException(ErrorCode.PARTICIPANT_SELECTION_TYPE_MISMATCH);
        }
    }

    /**
     * 명단 등록이 허용되는 공개 상태인지 확인한다.
     *
     * @param meeting 확인할 팬미팅
     * @throws BusinessException 공개 상태가 아닌 경우
     */
    private void requirePublished(FanMeeting meeting) {
        if (meeting.getStatus() != FanMeetingStatus.PUBLISHED) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
    }

    /**
     * 아직 명단이 확정되지 않았는지 확인한다.
     *
     * <p>참가자나 대기열이 이미 있으면 재등록을 허용하지 않는다.
     *
     * @param meetingId 팬미팅 식별자
     * @throws BusinessException 이미 참가자나 대기열이 생성된 경우
     */
    private void requireNotConfirmed(Long meetingId) {
        if (participantRepository.existsByMeeting_Id(meetingId)
                || queueEntryRepository.existsByMeeting_Id(meetingId)) {
            throw new BusinessException(ErrorCode.EXTERNAL_PARTICIPANTS_ALREADY_CONFIRMED);
        }
    }

    /**
     * 명단 CSV의 행 단위와 파일 단위 검증을 모두 수행한다.
     *
     * @param meeting 명단을 등록할 팬미팅
     * @param file 업로드된 명단 CSV
     * @return 행별 검증 결과와 파일 단위 오류를 담은 검증 결과
     * @throws BusinessException CSV를 읽을 수 없거나 응모 설정이 없는 경우
     */
    private ValidationResult validate(FanMeeting meeting, MultipartFile file) {
        List<ExternalParticipantCsvRow> rawRows = csvParser.parse(file);
        MeetingApplicationSetting setting = applicationSettingRepository.findById(meeting.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.APPLICATION_SETTING_NOT_FOUND));

        List<RowCandidate> candidates = toCandidates(rawRows);
        matchUsers(candidates);
        markExistingParticipants(meeting.getId(), candidates);

        List<ExternalParticipantFileError> fileErrors =
                fileErrors(candidates, setting.getCapacity());
        return new ValidationResult(candidates, fileErrors);
    }

    /**
     * 원본 행을 형식 검증하고 CSV 내부 중복까지 표시한 후보 목록으로 바꾼다.
     *
     * @param rawRows CSV에서 읽은 원본 행 목록
     * @return 형식 검증과 중복 검사를 마친 후보 목록
     */
    private List<RowCandidate> toCandidates(List<ExternalParticipantCsvRow> rawRows) {
        List<RowCandidate> candidates = new ArrayList<>(rawRows.size());
        Set<String> seenEmails = new HashSet<>();
        Set<Integer> seenCallOrders = new HashSet<>();

        for (ExternalParticipantCsvRow rawRow : rawRows) {
            String email = rawRow.email() == null
                    ? "" : rawRow.email().trim().toLowerCase(Locale.ROOT);
            Integer callOrder = parseCallOrder(rawRow.callOrder());
            RowCandidate candidate = new RowCandidate(rawRow.rowNumber(), email, callOrder);

            if (email.isEmpty()) {
                candidate.fail(ExternalParticipantRowError.EMAIL_REQUIRED);
            } else if (!EMAIL_PATTERN.matcher(email).matches()) {
                candidate.fail(ExternalParticipantRowError.EMAIL_INVALID);
            } else if (!seenEmails.add(email)) {
                candidate.fail(ExternalParticipantRowError.EMAIL_DUPLICATED);
            }

            if (rawRow.callOrder() == null || rawRow.callOrder().isBlank()) {
                candidate.fail(ExternalParticipantRowError.CALL_ORDER_REQUIRED);
            } else if (callOrder == null || callOrder < 1) {
                candidate.fail(ExternalParticipantRowError.CALL_ORDER_INVALID);
            } else if (!seenCallOrders.add(callOrder)) {
                candidate.fail(ExternalParticipantRowError.CALL_ORDER_DUPLICATED);
            }
            candidates.add(candidate);
        }
        return candidates;
    }

    /**
     * 형식 검증을 통과한 이메일을 한 번에 조회해 회원을 연결한다.
     *
     * @param candidates 검증 후보 목록
     */
    private void matchUsers(List<RowCandidate> candidates) {
        Set<String> emails = candidates.stream()
                .filter(candidate -> !candidate.hasError())
                .map(RowCandidate::email)
                .collect(Collectors.toSet());
        if (emails.isEmpty()) {
            return;
        }
        Map<String, User> usersByEmail = userRepository.findAllByEmailIn(emails).stream()
                .collect(Collectors.toMap(
                        user -> user.getEmail().toLowerCase(Locale.ROOT),
                        Function.identity(),
                        (left, right) -> left,
                        HashMap::new));

        for (RowCandidate candidate : candidates) {
            if (candidate.hasError()) {
                continue;
            }
            User user = usersByEmail.get(candidate.email());
            if (user == null) {
                candidate.fail(ExternalParticipantRowError.USER_NOT_FOUND);
                continue;
            }
            if (user.getStatus() != UserStatus.ACTIVE) {
                candidate.fail(ExternalParticipantRowError.USER_NOT_ACTIVE);
                continue;
            }
            if (user.getRole() != UserRole.FAN) {
                candidate.fail(ExternalParticipantRowError.USER_NOT_FAN);
                continue;
            }
            candidate.match(user);
        }
    }

    /**
     * 이미 해당 팬미팅의 참가자로 등록된 회원을 오류로 표시한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param candidates 검증 후보 목록
     */
    private void markExistingParticipants(Long meetingId, List<RowCandidate> candidates) {
        Set<Long> matchedUserIds = candidates.stream()
                .filter(candidate -> candidate.user() != null)
                .map(candidate -> candidate.user().getId())
                .collect(Collectors.toSet());
        if (matchedUserIds.isEmpty()) {
            return;
        }
        Set<Long> existingFanIds = participantRepository
                .findByMeeting_IdOrderByAssignedOrderAsc(meetingId).stream()
                .map(participant -> participant.getFan().getId())
                .collect(Collectors.toSet());
        if (existingFanIds.isEmpty()) {
            return;
        }
        for (RowCandidate candidate : candidates) {
            if (candidate.user() != null && existingFanIds.contains(candidate.user().getId())) {
                candidate.fail(ExternalParticipantRowError.ALREADY_PARTICIPANT);
            }
        }
    }

    /**
     * 명단 전체를 봐야 알 수 있는 오류를 모은다.
     *
     * @param candidates 검증 후보 목록
     * @param capacity 팬미팅 모집 인원
     * @return 파일 단위 오류 목록이며 문제가 없으면 비어 있다
     */
    private List<ExternalParticipantFileError> fileErrors(List<RowCandidate> candidates,
                                                          Integer capacity) {
        List<ExternalParticipantFileError> errors = new ArrayList<>();
        if (candidates.isEmpty()) {
            errors.add(ExternalParticipantFileError.EMPTY_ROWS);
            return errors;
        }
        if (capacity != null && capacity > 0 && candidates.size() > capacity) {
            errors.add(ExternalParticipantFileError.CAPACITY_EXCEEDED);
        }
        if (!hasSequentialCallOrders(candidates)) {
            errors.add(ExternalParticipantFileError.CALL_ORDER_NOT_SEQUENTIAL);
        }
        return errors;
    }

    /**
     * 호출 순번이 1부터 시작하는 연속된 정수인지 확인한다.
     *
     * @param candidates 검증 후보 목록
     * @return 1부터 행 수까지 빠짐없이 채워져 있으면 true
     */
    private boolean hasSequentialCallOrders(List<RowCandidate> candidates) {
        Set<Integer> callOrders = new HashSet<>();
        for (RowCandidate candidate : candidates) {
            if (candidate.callOrder() == null) {
                return false;
            }
            callOrders.add(candidate.callOrder());
        }
        if (callOrders.size() != candidates.size()) {
            return false;
        }
        for (int order = 1; order <= candidates.size(); order++) {
            if (!callOrders.contains(order)) {
                return false;
            }
        }
        return true;
    }

    /**
     * 호출 순번 문자열을 정수로 바꾼다.
     *
     * @param rawCallOrder 호출 순번 원본 값
     * @return 정수로 읽은 호출 순번이며 숫자가 아니면 null
     */
    private Integer parseCallOrder(String rawCallOrder) {
        if (rawCallOrder == null || rawCallOrder.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(rawCallOrder.trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    /** 검증 중인 명단 한 행의 상태를 담는 가변 후보다. */
    private static final class RowCandidate {
        private final int rowNumber;
        private final String email;
        private final Integer callOrder;
        private User user;
        private ExternalParticipantRowError error;

        /**
         * 행 번호와 정규화된 값으로 후보를 만든다.
         *
         * @param rowNumber CSV 파일 기준 행 번호
         * @param email 정규화된 이메일
         * @param callOrder 정수로 읽은 호출 순번이며 실패하면 null
         */
        private RowCandidate(int rowNumber, String email, Integer callOrder) {
            this.rowNumber = rowNumber;
            this.email = email;
            this.callOrder = callOrder;
        }

        /**
         * 첫 번째 실패 사유만 기록한다.
         *
         * @param candidateError 기록할 실패 사유
         */
        private void fail(ExternalParticipantRowError candidateError) {
            if (this.error == null) {
                this.error = candidateError;
            }
        }

        /**
         * 이메일로 찾은 회원을 연결한다.
         *
         * @param matchedUser 연결할 회원
         */
        private void match(User matchedUser) {
            this.user = matchedUser;
        }

        /** 이 행에 실패 사유가 기록되었는지 확인한다. */
        private boolean hasError() {
            return error != null;
        }

        /** CSV 파일 기준 행 번호를 반환한다. */
        private int rowNumber() {
            return rowNumber;
        }

        /** 정규화된 이메일을 반환한다. */
        private String email() {
            return email;
        }

        /** 정수로 읽은 호출 순번을 반환한다. */
        private Integer callOrder() {
            return callOrder;
        }

        /** 연결된 회원을 반환하며 없으면 null이다. */
        private User user() {
            return user;
        }

        /** 기록된 실패 사유를 반환하며 없으면 null이다. */
        private ExternalParticipantRowError error() {
            return error;
        }
    }

    /** 명단 전체의 검증 결과다. */
    private record ValidationResult(List<RowCandidate> candidates,
                                    List<ExternalParticipantFileError> fileErrors) {

        /**
         * 오류가 하나도 없어 그대로 확정할 수 있는지 확인한다.
         *
         * @return 행 오류와 파일 오류가 모두 없으면 true
         */
        private boolean confirmable() {
            return fileErrors.isEmpty()
                    && candidates.stream().noneMatch(RowCandidate::hasError);
        }

        /**
         * 확정 대상 행만 추린다.
         *
         * @return 회원까지 연결된 유효한 행 목록
         */
        private List<RowCandidate> rows() {
            return candidates.stream()
                    .filter(candidate -> !candidate.hasError())
                    .toList();
        }

        /**
         * 검증 결과를 미리보기 응답으로 변환한다.
         *
         * @return 행별 결과와 확정 가능 여부를 담은 응답
         */
        private ExternalParticipantPreviewResponse toPreview() {
            List<ExternalParticipantPreviewResponse.Row> rows = candidates.stream()
                    .map(candidate -> new ExternalParticipantPreviewResponse.Row(
                            candidate.rowNumber(),
                            candidate.email(),
                            candidate.callOrder(),
                            candidate.user() == null ? null : candidate.user().getId(),
                            candidate.user() == null ? null : candidate.user().getNickname(),
                            !candidate.hasError(),
                            candidate.hasError() ? candidate.error().name() : null,
                            candidate.hasError() ? candidate.error().message() : null
                    ))
                    .toList();
            int validCount = (int) candidates.stream().filter(row -> !row.hasError()).count();
            List<ExternalParticipantPreviewResponse.FileError> errors = fileErrors.stream()
                    .map(fileError -> new ExternalParticipantPreviewResponse.FileError(
                            fileError.name(), fileError.message()))
                    .toList();
            return new ExternalParticipantPreviewResponse(
                    candidates.size(),
                    validCount,
                    candidates.size() - validCount,
                    confirmable(),
                    errors,
                    rows
            );
        }
    }
}

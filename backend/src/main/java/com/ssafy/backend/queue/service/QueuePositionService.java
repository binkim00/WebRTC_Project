package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueuePositionChangeRequest;
import com.ssafy.backend.queue.dto.QueuePositionChangeResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.redis.QueueReorderResult;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 매니저가 요청한 참가자 한 명의 대기 순서 이동을 Redis와 DB에 함께 반영한다. */
@Service
public class QueuePositionService {
    private static final Set<QueueEntryStatus> MOVABLE_STATUSES =
            Set.of(QueueEntryStatus.NOT_ENTERED, QueueEntryStatus.WAITING);

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final QueueEntryRepository queueEntryRepository;
    private final QueueRealtimeStore realtimeStore;
    private final Clock clock;

    /**
     * 순서 이동에 필요한 권한 검증기와 저장소를 주입받는다.
     *
     * @param currentUserService 현재 로그인 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 운영 권한 검증 서비스
     * @param queueEntryRepository 대기열 항목 저장소
     * @param realtimeStore Redis 실시간 대기열 저장소
     * @param clock 순서 변경 시각 기준 시계
     */
    public QueuePositionService(CurrentUserService currentUserService,
                                MeetingAccessService meetingAccessService,
                                QueueEntryRepository queueEntryRepository,
                                QueueRealtimeStore realtimeStore,
                                Clock clock) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.queueEntryRepository = queueEntryRepository;
        this.realtimeStore = realtimeStore;
        this.clock = clock;
    }

    /**
     * 팬미팅 매니저가 지정한 참가자를 새 대기 순번으로 이동시킨다.
     *
     * @param entryId 이동할 대기열 항목 식별자
     * @param request 이동할 새 대기 순번
     * @param principal JWT 인증 사용자 정보
     * @return 이동 전후 순번과 반영 시각
     * @throws BusinessException 대기열 항목이 없거나 매니저 권한, 순번 범위, 상태 검증에 실패한 경우
     */
    @Transactional
    public QueuePositionChangeResponse changePosition(Long entryId,
                                                     QueuePositionChangeRequest request,
                                                     AuthenticatedUser principal) {
        User manager = currentUserService.requireActiveUser(principal);
        QueueEntry entry = queueEntryRepository.findById(entryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        Long meetingId = entry.getMeeting().getId();
        meetingAccessService.requireManager(meetingId, manager);
        return moveEntry(meetingId, entryId, request.newPosition());
    }

    /**
     * 권한 검증을 마친 호출자를 위해 대기열 항목을 지정 순번 또는 대기열 마지막으로 이동시킨다.
     *
     * <p>이동 가능한 참가자의 순번 집합 안에서만 순서를 재배치하므로 호출·통화·완료 참가자의
     * 순번은 유지된다. Redis Sorted Set을 Lua 스크립트로 먼저 재정렬하고 DB 반영이 실패하면
     * 이전 순번으로 되돌려 두 저장소의 순번을 일치시킨다.
     *
     * @param meetingId 팬미팅 식별자
     * @param entryId 이동할 대기열 항목 식별자
     * @param requestedPosition 이동할 순번이며 {@code null}이면 대기열 마지막으로 이동한다
     * @return 이동 전후 순번과 반영 시각
     * @throws BusinessException 대기열 미초기화, 순번 범위 초과 또는 이동 불가 상태인 경우
     */
    @Transactional
    public QueuePositionChangeResponse moveEntry(Long meetingId, Long entryId, Integer requestedPosition) {
        if (!realtimeStore.isInitialized(meetingId)) {
            throw new BusinessException(ErrorCode.QUEUE_NOT_INITIALIZED);
        }
        List<QueueEntry> lockedEntries =
                queueEntryRepository.findAllByMeetingIdOrderByIdForUpdate(meetingId);
        QueueEntry target = lockedEntries.stream()
                .filter(entry -> entry.getId().equals(entryId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
        if (!MOVABLE_STATUSES.contains(target.getStatus())) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }

        List<QueueEntry> movableEntries = lockedEntries.stream()
                .filter(entry -> MOVABLE_STATUSES.contains(entry.getStatus()))
                .sorted(Comparator.comparing(QueueEntry::getQueuePosition))
                .toList();
        List<Integer> slots = movableEntries.stream().map(QueueEntry::getQueuePosition).toList();
        int targetSlotIndex = resolveSlotIndex(slots, requestedPosition);
        int previousPosition = target.getQueuePosition();
        Map<Long, Integer> previousPositions = collectPositions(movableEntries);
        Map<Long, Integer> newPositions =
                buildReorderedPositions(movableEntries, slots, target, targetSlotIndex);

        applyToRealtimeStore(meetingId, target.getId(), newPositions);
        try {
            applyToDatabase(movableEntries, newPositions);
        } catch (RuntimeException exception) {
            realtimeStore.restorePositions(meetingId, previousPositions);
            if (exception instanceof BusinessException businessException) {
                throw businessException;
            }
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
        return new QueuePositionChangeResponse(
                previousPosition, slots.get(targetSlotIndex), LocalDateTime.now(clock));
    }

    /**
     * 요청한 순번이 이동 가능한 순번 집합에 있는지 확인하고 배치할 위치를 결정한다.
     *
     * @param slots 이동 가능한 참가자가 사용 중인 순번 목록
     * @param requestedPosition 요청 순번이며 {@code null}이면 마지막 순번을 사용한다
     * @return 재배치할 위치의 목록 색인
     * @throws BusinessException 요청 순번이 이동 가능한 순번 집합을 벗어난 경우
     */
    private int resolveSlotIndex(List<Integer> slots, Integer requestedPosition) {
        if (requestedPosition == null) {
            return slots.size() - 1;
        }
        int index = slots.indexOf(requestedPosition);
        if (index < 0) {
            throw new BusinessException(ErrorCode.QUEUE_POSITION_OUT_OF_RANGE);
        }
        return index;
    }

    /**
     * 이동 대상을 지정 위치에 넣고 나머지 참가자의 순서를 앞뒤로 밀어 새 순번을 계산한다.
     *
     * @param movableEntries 순번 오름차순으로 정렬된 이동 가능한 대기열 항목
     * @param slots 이동 가능한 참가자가 사용 중인 순번 목록
     * @param target 이동 대상 대기열 항목
     * @param targetSlotIndex 이동 대상을 배치할 위치의 목록 색인
     * @return 대기열 항목 식별자별 새 순번
     */
    private Map<Long, Integer> buildReorderedPositions(List<QueueEntry> movableEntries,
                                                      List<Integer> slots,
                                                      QueueEntry target,
                                                      int targetSlotIndex) {
        List<QueueEntry> reordered = new ArrayList<>(movableEntries);
        reordered.removeIf(entry -> entry.getId().equals(target.getId()));
        reordered.add(targetSlotIndex, target);
        Map<Long, Integer> positions = new LinkedHashMap<>();
        for (int index = 0; index < reordered.size(); index++) {
            positions.put(reordered.get(index).getId(), slots.get(index));
        }
        return positions;
    }

    /**
     * 되돌리기에 사용할 현재 순번을 대기열 항목 식별자별로 수집한다.
     *
     * @param entries 순번을 수집할 대기열 항목
     * @return 대기열 항목 식별자별 현재 순번
     */
    private Map<Long, Integer> collectPositions(List<QueueEntry> entries) {
        Map<Long, Integer> positions = new LinkedHashMap<>();
        for (QueueEntry entry : entries) {
            positions.put(entry.getId(), entry.getQueuePosition());
        }
        return positions;
    }

    /**
     * Redis Sorted Set의 순번을 원자적으로 재정렬한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param targetEntryId 이동 대상 대기열 항목 식별자
     * @param newPositions 대기열 항목 식별자별 새 순번
     * @throws BusinessException 대기열이 초기화되지 않았거나 실시간 상태가 이동을 허용하지 않는 경우
     */
    private void applyToRealtimeStore(Long meetingId, Long targetEntryId,
                                      Map<Long, Integer> newPositions) {
        QueueReorderResult result = realtimeStore.reorder(meetingId, targetEntryId, newPositions);
        if (result == QueueReorderResult.NOT_INITIALIZED) {
            throw new BusinessException(ErrorCode.QUEUE_NOT_INITIALIZED);
        }
        if (result != QueueReorderResult.REORDERED) {
            throw new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT);
        }
    }

    /**
     * 순번이 바뀐 대기열 항목만 DB에 반영하고 즉시 flush 하여 실패를 조기에 확인한다.
     *
     * @param movableEntries 이동 가능한 대기열 항목
     * @param newPositions 대기열 항목 식별자별 새 순번
     */
    private void applyToDatabase(List<QueueEntry> movableEntries, Map<Long, Integer> newPositions) {
        for (QueueEntry entry : movableEntries) {
            int newPosition = newPositions.get(entry.getId());
            if (entry.getQueuePosition() != newPosition) {
                entry.changePosition(newPosition);
            }
        }
        queueEntryRepository.flush();
    }
}

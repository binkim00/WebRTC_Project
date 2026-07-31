import {
  CalendarBlank,
  ChatCircleText,
  ClockCounterClockwise,
  NotePencil,
  Trash,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  AlertBanner,
  Avatar,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Spinner,
  Tabs,
  Textarea,
} from '../../components'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchFanMemos,
  fetchParticipants,
  type FanMeetingParticipant,
  type FanMemo,
} from '../../api/fanMeetingParticipants'
import {
  createFanMemo,
  deleteFanMemo,
  updateFanMemo,
} from '../../api/fanMemos'

type RecordTab = 'memo' | 'summary'

const MEMO_MAX_LENGTH = 300
const PARTICIPANT_LOOKUP_SIZE = 50
const PARTICIPANT_LOOKUP_MAX_PAGES = 5

function formatDate(value?: string) {
  if (!value) return '확인 불가'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof TypeError
    ? reason.message
    : fallback
}

/**
 * 팬 리스트(InfluencerFanListPage)는 participant.fanId(팬 회원 ID)를 경로에 전달한다.
 * 메모 API(/influencers/me/fans/{fanId}/memos)는 팬 회원 ID를 그대로 사용하고,
 * 팬 헤더 정보는 참가자 목록에서 fanId가 일치하는 참가자를 찾아 표시한다.
 */
export function InfluencerFanRecordPage() {
  const { fanMeetingId, fanId } = useParams<{ fanMeetingId: string; fanId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const authToken = getAuthSession()?.accessToken

  const tab = searchParams.get('tab')
  const activeTab: RecordTab = tab === 'summary' ? 'summary' : 'memo'
  const isMemoTab = activeTab === 'memo'

  const [participant, setParticipant] = useState<FanMeetingParticipant>()
  const [memos, setMemos] = useState<FanMemo[]>([])
  const [memosLoading, setMemosLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()

  const [selectedMemoId, setSelectedMemoId] = useState<string>()
  const [memoText, setMemoText] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string>()

  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')

  const loadMemos = useCallback(
    async (signal?: AbortSignal) => {
      if (!fanId || !authToken) return

      setMemosLoading(true)
      try {
        const response = await fetchFanMemos(fanId, authToken, signal)
        setMemos(response.content)
        setLoadError(undefined)
      } catch (reason) {
        if (signal?.aborted) return
        setLoadError(errorMessage(reason, '팬 메모를 불러오지 못했습니다.'))
      } finally {
        if (!signal?.aborted) setMemosLoading(false)
      }
    },
    [authToken, fanId],
  )

  useEffect(() => {
    if (!fanId) {
      setLoadError('팬 식별자가 없습니다.')
      setMemosLoading(false)
      return
    }
    if (!authToken) {
      setLoadError('로그인 정보가 없습니다. 로그인 후 다시 시도해 주세요.')
      setMemosLoading(false)
      return
    }

    const controller = new AbortController()
    void loadMemos(controller.signal)

    return () => controller.abort()
  }, [authToken, fanId, loadMemos])

  useEffect(() => {
    if (!fanMeetingId || !fanId || !authToken) return

    const controller = new AbortController()

    // 경로의 fanId는 팬 회원 ID이므로 참가자 목록에서 일치하는 참가자를 찾는다.
    void (async () => {
      try {
        for (let page = 0; page < PARTICIPANT_LOOKUP_MAX_PAGES; page += 1) {
          const response = await fetchParticipants(
            fanMeetingId,
            { page, size: PARTICIPANT_LOOKUP_SIZE },
            authToken,
            controller.signal,
          )
          const match = response.content.find((item) => item.fanId === fanId)
          if (match) {
            setParticipant(match)
            return
          }
          if (!response.hasNext) return
        }
      } catch {
        // 팬 프로필 보조 정보 조회 실패는 메모 기능을 막지 않는다.
      }
    })()

    return () => controller.abort()
  }, [authToken, fanId, fanMeetingId])

  useEffect(() => {
    if (!memos.length) {
      setSelectedMemoId(undefined)
      return
    }
    if (!memos.some((memo) => memo.memoId === selectedMemoId)) {
      setSelectedMemoId(memos[0].memoId)
    }
  }, [memos, selectedMemoId])

  const selectedMemo = memos.find((memo) => memo.memoId === selectedMemoId)

  const handleTabChange = (nextTab: string) => {
    setSearchParams({ tab: nextTab })
    setEditing(false)
  }

  const handleMemoChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMemoText(event.target.value)
  }

  const handleMemoSave = () => {
    const content = memoText.trim()
    if (!content || !fanId || !authToken) return
    if (content.length > MEMO_MAX_LENGTH) {
      setActionError(`메모는 최대 ${MEMO_MAX_LENGTH}자까지 작성할 수 있습니다.`)
      return
    }

    setSaving(true)
    setActionError(undefined)

    const numericMeetingId = Number(fanMeetingId)

    void createFanMemo(
      fanId,
      Number.isFinite(numericMeetingId)
        ? { meetingId: numericMeetingId, content }
        : { content },
      authToken,
    )
      .then(() => {
        setMemoText('')
        return loadMemos()
      })
      .catch((reason: unknown) => {
        setActionError(errorMessage(reason, '메모 저장에 실패했습니다.'))
      })
      .finally(() => setSaving(false))
  }

  const handleEditStart = () => {
    if (!selectedMemo) return
    setEditText(selectedMemo.content)
    setActionError(undefined)
    setEditing(true)
  }

  const handleEditSave = () => {
    const content = editText.trim()
    if (!content || !selectedMemo || !authToken) return
    if (content.length > MEMO_MAX_LENGTH) {
      setActionError(`메모는 최대 ${MEMO_MAX_LENGTH}자까지 작성할 수 있습니다.`)
      return
    }

    setSaving(true)
    setActionError(undefined)

    void updateFanMemo(selectedMemo.memoId, { content }, authToken)
      .then(() => {
        setEditing(false)
        return loadMemos()
      })
      .catch((reason: unknown) => {
        setActionError(errorMessage(reason, '메모 수정에 실패했습니다.'))
      })
      .finally(() => setSaving(false))
  }

  const handleDelete = () => {
    if (!selectedMemo || !authToken) return
    if (!window.confirm('이 메모를 삭제할까요? 삭제한 메모는 되돌릴 수 없습니다.')) {
      return
    }

    setSaving(true)
    setActionError(undefined)

    void deleteFanMemo(selectedMemo.memoId, authToken)
      .then(() => {
        setEditing(false)
        setSelectedMemoId(undefined)
        return loadMemos()
      })
      .catch((reason: unknown) => {
        setActionError(errorMessage(reason, '메모 삭제에 실패했습니다.'))
      })
      .finally(() => setSaving(false))
  }

  const fanName = participant?.nickname ?? `팬 ${fanId ?? ''}`.trim()
  const latestMemoDate = memos[0]?.createdAt

  const tabItems = [
    {
      value: 'memo',
      label: (
        <span className="inline-flex items-center gap-2">
          <NotePencil aria-hidden size={18} weight="bold" />
          메모
          <span className="rounded-full bg-[var(--color-surface-page)] px-2 py-0.5 text-xs">
            {memos.length}
          </span>
        </span>
      ),
    },
    {
      value: 'summary',
      label: (
        <span className="inline-flex items-center gap-2">
          <ChatCircleText aria-hidden size={18} weight="bold" />
          대화 요약
          <span className="rounded-full bg-[var(--color-surface-page)] px-2 py-0.5 text-xs">
            0
          </span>
        </span>
      ),
    },
  ] as const

  return (
    <div className="grid gap-8 pb-8">
      <header className="grid gap-7">
        <Breadcrumbs
          items={[
            {
              label: '나의 팬미팅',
              to: '/influencer/my-fan-meetings',
            },
            {
              label: '팬 리스트',
              to: fanMeetingId
                ? `/influencer/fan-meetings/${fanMeetingId}/fans`
                : undefined,
            },
            {
              label: fanName,
            },
            {
              label: '팬 기록',
            },
          ]}
        />
        <div className="grid gap-3">
          <h1 className="text-4xl font-black leading-tight tracking-[-0.04em]">
            팬 기록
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            팬과 나눈 기록을 확인하고 다음 대화를 준비하세요.
          </p>
        </div>
      </header>

      {loadError ? (
        <AlertBanner title="팬 기록을 불러오지 못했습니다" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card>
          <CardContent className="grid gap-6">
            <Avatar className="mx-auto size-28" name={fanName} size="lg" />
            <div>
              <p className="text-xs font-bold text-[var(--color-primary-coral)]">
                팬 프로필
              </p>
              <p className="mt-3 text-2xl font-black">{fanName}</p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                @{fanId ?? '알 수 없음'}
              </p>
            </div>
            <dl className="grid gap-5 border-t border-[var(--color-divider)] pt-6">
              {participant ? (
                <div>
                  <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                    통화 순번
                  </dt>
                  <dd className="mt-2 font-extrabold">
                    {participant.callOrder}번째
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-tertiary)]">
                  <ClockCounterClockwise aria-hidden size={18} weight="bold" />
                  최근 메모
                </dt>
                <dd className="mt-2 font-extrabold">
                  {latestMemoDate ? formatDate(latestMemoDate) : '없음'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden">
            <Tabs
              ariaLabel="팬 기록 종류"
              className="px-6"
              items={tabItems}
              onValueChange={handleTabChange}
              value={activeTab}
            />

            {isMemoTab ? (
              <div className="grid min-h-[460px] md:grid-cols-[320px_minmax(0,1fr)]">
                <section
                  aria-label="메모 기록 목록"
                  className="border-b border-[var(--color-divider)] md:border-b-0 md:border-r"
                >
                  <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
                    <div>
                      <h2 className="font-extrabold">메모 기록</h2>
                      <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
                        최신순
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                      {memos.length}개
                    </span>
                  </div>
                  <div className="border-t border-[var(--color-divider)]">
                    {memosLoading ? (
                      <div className="flex min-h-48 items-center justify-center">
                        <Spinner label="메모를 불러오는 중" />
                      </div>
                    ) : memos.length ? (
                      memos.map((memo) => {
                        const selected = memo.memoId === selectedMemoId

                        return (
                          <button
                            aria-pressed={selected}
                            className={[
                              'relative grid w-full gap-2 border-b border-[var(--color-divider)] px-5 py-5 text-left transition-colors',
                              selected
                                ? 'bg-[var(--color-primary-coral-soft)]'
                                : 'hover:bg-[var(--color-surface-page)]',
                            ].join(' ')}
                            key={memo.memoId}
                            onClick={() => {
                              setSelectedMemoId(memo.memoId)
                              setEditing(false)
                            }}
                            type="button"
                          >
                            {selected ? (
                              <span
                                aria-hidden
                                className="absolute inset-y-0 left-0 w-[3px] bg-[var(--color-primary-coral)]"
                              />
                            ) : null}
                            <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                              {formatDate(memo.createdAt)}
                            </span>
                            <span className="font-extrabold">{memo.meetingTitle}</span>
                            <span className="line-clamp-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                              {memo.content}
                            </span>
                          </button>
                        )
                      })
                    ) : (
                      <p className="px-5 py-10 text-center text-sm text-[var(--color-text-secondary)]">
                        작성된 메모가 없습니다.
                      </p>
                    )}
                  </div>
                </section>

                <article className="p-5 sm:p-7">
                  {selectedMemo ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-5">
                        <div>
                          <p className="text-xs font-bold text-[var(--color-primary-coral)]">
                            직접 작성한 메모
                          </p>
                          <h2 className="mt-3 text-2xl font-black">
                            {selectedMemo.meetingTitle}
                          </h2>
                        </div>
                        <time
                          className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-tertiary)]"
                          dateTime={selectedMemo.createdAt}
                        >
                          <CalendarBlank aria-hidden size={18} weight="bold" />
                          {formatDate(selectedMemo.createdAt)}
                        </time>
                      </div>

                      {editing ? (
                        <div className="mt-7 grid gap-4 border-t border-[var(--color-divider)] pt-7">
                          <div className="flex items-center justify-between">
                            <p className="font-extrabold">메모 수정</p>
                            <span className="text-sm text-[var(--color-text-tertiary)]">
                              {editText.length}/{MEMO_MAX_LENGTH}
                            </span>
                          </div>
                          <Textarea
                            label="메모 내용"
                            maxLength={MEMO_MAX_LENGTH}
                            onChange={(event) => setEditText(event.target.value)}
                            rows={5}
                            value={editText}
                          />
                          <div className="flex justify-end gap-3">
                            <Button
                              disabled={saving}
                              onClick={() => setEditing(false)}
                              size="sm"
                              variant="secondary"
                            >
                              취소
                            </Button>
                            <Button
                              disabled={saving || editText.trim().length === 0}
                              onClick={handleEditSave}
                              size="sm"
                            >
                              {saving ? '저장 중...' : '수정 저장'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mt-7 grid gap-4 border-t border-[var(--color-divider)] pt-7">
                            <p className="whitespace-pre-line leading-7 text-[var(--color-text-secondary)]">
                              {selectedMemo.content}
                            </p>
                          </div>
                          <div className="mt-7 flex justify-end gap-3 border-t border-[var(--color-divider)] pt-5">
                            <Button
                              disabled={saving}
                              leadingIcon={<NotePencil aria-hidden size={17} weight="bold" />}
                              onClick={handleEditStart}
                              size="sm"
                              variant="secondary"
                            >
                              수정
                            </Button>
                            <Button
                              disabled={saving}
                              leadingIcon={<Trash aria-hidden size={17} weight="bold" />}
                              onClick={handleDelete}
                              size="sm"
                              variant="secondary"
                            >
                              삭제
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="grid min-h-72 place-items-center text-center">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {memosLoading
                          ? '메모를 불러오는 중입니다.'
                          : '왼쪽 목록에서 메모를 선택하거나 새 메모를 작성해 주세요.'}
                      </p>
                    </div>
                  )}
                </article>
              </div>
            ) : (
              /* TODO(AI-001): 대화 요약 API가 아직 준비되지 않아 빈 상태를 표시한다. */
              <div className="grid min-h-[460px] place-items-center px-6 text-center">
                <div className="grid justify-items-center gap-4">
                  <ChatCircleText
                    aria-hidden
                    className="text-[var(--color-text-tertiary)]"
                    size={44}
                    weight="duotone"
                  />
                  <div>
                    <p className="text-lg font-extrabold">대화 요약 준비 중</p>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                      AI 대화 요약 기능은 준비 중입니다. 곧 만나보실 수 있어요.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {actionError ? (
            <AlertBanner title="메모 처리에 실패했습니다" variant="error">
              {actionError}
            </AlertBanner>
          ) : null}

          {isMemoTab ? (
            <Card>
              <CardContent className="grid gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-extrabold">새 메모 작성</h2>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                      다음 팬미팅에서 기억할 내용을 남겨주세요.
                    </p>
                  </div>
                  <span className="text-sm text-[var(--color-text-tertiary)]">
                    {memoText.length}/{MEMO_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  label="메모 내용"
                  maxLength={MEMO_MAX_LENGTH}
                  onChange={handleMemoChange}
                  placeholder="팬과 나눈 대화나 다음 통화에서 참고할 내용을 입력하세요."
                  rows={5}
                  value={memoText}
                />
                <Button
                  className="justify-self-end"
                  disabled={saving || memoText.trim().length === 0}
                  onClick={handleMemoSave}
                >
                  {saving ? '저장 중...' : '메모 저장'}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

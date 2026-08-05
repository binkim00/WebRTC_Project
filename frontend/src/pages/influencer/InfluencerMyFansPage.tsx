import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchFanMemos,
  fetchMyParticipantFans,
  type FanMemo,
  type ParticipantFanSummary,
} from '../../api/fanMeetingParticipants'
import { AlertBanner, Spinner } from '../../components'
import { useTranslation } from '../../i18n'

type SortKey = 'recent' | 'count'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 2026.07.26 — 참여일 표기다. */
function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/**
 * 인플루언서·1인 인플루언서 공용 "내 팬" 화면이다. (Solo Influencer Fans.dc.html)
 *
 * 참가 팬 집계는 `GET /influencers/me/participant-fans`, 팬별 메모는 기존 메모 API를 쓴다.
 * 팬이 참가한 회차 목록 자체는 API가 없어, 상세의 이력에는 실제 남긴 메모만 표시한다.
 */
export function InfluencerMyFansPage() {
  const { t } = useTranslation()
  const [fans, setFans] = useState<ParticipantFanSummary[]>()
  const [memoCounts, setMemoCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [selectedFanId, setSelectedFanId] = useState<string>()
  const [selectedMemos, setSelectedMemos] = useState<FanMemo[]>()

  // 요약 집계(누적 팬미팅·재참여·메모 수)가 전체 기준이어야 하므로 페이지를 모두 읽는다.
  useEffect(() => {
    const session = getAuthSession()
    if (!session) {
      setError('인플루언서 계정으로 로그인해 주세요.')
      return
    }

    const controller = new AbortController()

    void (async () => {
      const all: ParticipantFanSummary[] = []
      let page = 0
      for (;;) {
        const result = await fetchMyParticipantFans(
          { page, size: 50 },
          session.accessToken,
          controller.signal,
        )
        all.push(...result.content)
        if (!result.hasNext) break
        page += 1
      }
      if (controller.signal.aborted) return
      setFans(all)

      // 목록의 "메모 n"과 요약의 "메모 작성" 합계를 위해 팬별 메모 수를 함께 읽는다.
      const counts = await Promise.allSettled(
        all.map(async (fan) => ({
          fanId: fan.fanId,
          total: (await fetchFanMemos(fan.fanId, session.accessToken, controller.signal, 1))
            .totalElements,
        })),
      )
      if (controller.signal.aborted) return
      setMemoCounts(
        Object.fromEntries(
          counts
            .filter(
              (entry): entry is PromiseFulfilledResult<{ fanId: string; total: number }> =>
                entry.status === 'fulfilled',
            )
            .map((entry) => [entry.value.fanId, entry.value.total]),
        ),
      )
    })().catch((reason: unknown) => {
      if (controller.signal.aborted) return
      setError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '내 팬 목록을 불러오지 못했습니다.',
      )
      setFans((current) => current ?? [])
    })

    return () => controller.abort()
  }, [])

  // 선택한 팬의 팬미팅별 메모 이력을 읽는다.
  useEffect(() => {
    if (!selectedFanId) {
      setSelectedMemos(undefined)
      return
    }
    const session = getAuthSession()
    if (!session) return

    const controller = new AbortController()
    setSelectedMemos(undefined)
    void fetchFanMemos(selectedFanId, session.accessToken, controller.signal, 50)
      .then((result) => setSelectedMemos(result.content))
      .catch(() => {
        if (!controller.signal.aborted) setSelectedMemos([])
      })
    return () => controller.abort()
  }, [selectedFanId])

  const loading = fans === undefined
  const allFans = useMemo(() => fans ?? [], [fans])

  const list = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const filtered = keyword
      ? allFans.filter((fan) => fan.nickname.toLowerCase().includes(keyword))
      : allFans
    return [...filtered].sort((a, b) =>
      sort === 'count'
        ? b.participatedMeetingCount - a.participatedMeetingCount ||
          b.lastParticipatedAt.localeCompare(a.lastParticipatedAt)
        : b.lastParticipatedAt.localeCompare(a.lastParticipatedAt) ||
          b.participatedMeetingCount - a.participatedMeetingCount,
    )
  }, [allFans, query, sort])

  const selected = allFans.find((fan) => fan.fanId === selectedFanId)
  const repeatCount = allFans.filter((fan) => fan.participatedMeetingCount >= 2).length
  const totalMeets = allFans.reduce((sum, fan) => sum + fan.participatedMeetingCount, 0)
  const memoTotal = Object.values(memoCounts).reduce((sum, count) => sum + count, 0)
  const noFans = !loading && allFans.length === 0

  const summary = [
    { label: '만난 팬', value: `${allFans.length}명`, highlight: false },
    { label: '누적 팬미팅', value: `${totalMeets}회`, highlight: false },
    { label: '재참여 팬', value: `${repeatCount}명`, highlight: repeatCount > 0 },
    { label: '메모 작성', value: `${memoTotal}건`, highlight: false },
  ] as const

  // 메모 관리는 팬 기록 화면(메모 탭)으로 이동하며, 경로에 팬미팅 ID가 필요해 가장 최근 메모의 회차를 쓴다.
  const latestMemo = selectedMemos?.[0]

  return (
    <div className="pb-10">
      <h1 className="text-[25px] font-black tracking-[-0.035em] text-[var(--color-text-primary)]">
        {t('influencerMyFansPage.t1')}
      </h1>
      <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
        {t('influencerMyFansPage.t2')}
      </p>

      {error ? (
        <AlertBanner className="mt-5" title={t('influencerMyFansPage.t3')} variant="error">
          {error}
        </AlertBanner>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner label={t('influencerMyFansPage.t4')} />
        </div>
      ) : (
        <>
          <section
            aria-label={t('influencerMyFansPage.t5')}
            className="mt-6 grid grid-cols-2 border-y border-[var(--color-divider)] lg:grid-cols-4"
          >
            {summary.map((cell, index) => (
              <div
                className={`px-[22px] py-4 ${index % 2 === 1 ? 'border-l border-[var(--color-divider)]' : 'max-lg:pl-0'} ${index >= 2 ? 'max-lg:border-t max-lg:border-[var(--color-divider)]' : ''} ${index >= 1 ? 'lg:border-l lg:border-[var(--color-divider)]' : 'lg:pl-0'} ${index === 3 ? 'lg:pr-0' : ''}`}
                key={cell.label}
              >
                <p className="text-[13px] font-bold text-[var(--color-text-tertiary)]">
                  {cell.label}
                </p>
                <p
                  className={`mt-1.5 text-[22px] font-black tabular-nums tracking-[-0.03em] ${cell.highlight ? 'text-[var(--color-primary-coral)]' : 'text-[var(--color-text-primary)]'}`}
                >
                  {cell.value}
                </p>
              </div>
            ))}
          </section>

          <div className="mt-7 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-11">
            <div className="min-w-0">
              <form className="flex items-end gap-3" onSubmit={(event) => event.preventDefault()}>
                <label className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-[var(--color-text-tertiary)]">
                    {t('influencerMyFansPage.t6')}
                  </span>
                  <input
                    className="mt-[7px] min-h-11 w-full rounded-lg border border-[var(--color-border-control)] bg-white px-3 text-[15px] font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                    onChange={(event) => {
                      setQuery(event.currentTarget.value)
                      setSelectedFanId(undefined)
                    }}
                    placeholder={t('influencerMyFansPage.t7')}
                    type="search"
                    value={query}
                  />
                </label>
                <label className="w-40">
                  <span className="block text-[13px] font-bold text-[var(--color-text-tertiary)]">
                    {t('influencerMyFansPage.t8')}
                  </span>
                  <select
                    className="mt-[7px] min-h-11 w-full rounded-lg border border-[var(--color-border-control)] bg-white px-2.5 text-[15px] font-semibold text-[var(--color-text-primary)] outline-none focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                    onChange={(event) => setSort(event.currentTarget.value as SortKey)}
                    value={sort}
                  >
                    <option value="recent">{t('influencerMyFansPage.t9')}</option>
                    <option value="count">{t('influencerMyFansPage.t10')}</option>
                  </select>
                </label>
              </form>

              <div className="mt-[22px] flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-extrabold tracking-[-0.028em]">{t('influencerMyFansPage.t11')}</h2>
                <span className="text-[15px] font-extrabold tabular-nums">{list.length}{t('influencerMyFansPage.t12')}</span>
              </div>

              {list.length === 0 ? (
                <div
                  className="mt-3.5 grid place-items-center border-t border-[var(--color-border-control)] px-6 py-[68px] text-center"
                  role="status"
                >
                  <strong className="text-lg font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
                    {noFans ? '아직 만난 팬이 없어요' : '검색 결과가 없습니다'}
                  </strong>
                  <span className="mt-2 max-w-[400px] text-[15px] font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
                    {noFans
                      ? '팬미팅을 진행하면 만난 팬이 이곳에 쌓이고, 팬미팅마다 메모를 남길 수 있어요.'
                      : '닉네임을 다시 확인해 주세요.'}
                  </span>
                </div>
              ) : (
                <div className="mt-3.5 border-t border-[var(--color-border-control)]">
                  {list.map((fan) => {
                    const active = fan.fanId === selectedFanId
                    const memoCount = memoCounts[fan.fanId]
                    return (
                      <button
                        aria-current={active || undefined}
                        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--color-border-row)] py-[15px] pr-2.5 text-left transition-colors hover:bg-[var(--color-surface-subtle)] sm:grid-cols-[minmax(0,1fr)_128px_96px] ${active ? 'bg-[var(--color-surface-subtle)]' : ''}`}
                        key={fan.fanId}
                        onClick={() =>
                          setSelectedFanId((current) =>
                            current === fan.fanId ? undefined : fan.fanId,
                          )
                        }
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span
                              className={`text-[17px] tracking-[-0.022em] text-[var(--color-text-primary)] ${active ? 'font-extrabold' : 'font-bold'}`}
                            >
                              {fan.nickname}
                            </span>
                            {fan.participatedMeetingCount >= 2 ? (
                              <span className="whitespace-nowrap text-xs font-extrabold text-[var(--color-primary-coral)]">
                                {t('influencerMyFansPage.t13')}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-sm font-medium text-[var(--color-text-tertiary)]">
                            {t('influencerMyFansPage.t14')} {fan.fanId}
                          </span>
                        </span>
                        <span className="text-[15px] font-bold tabular-nums text-[var(--color-text-primary)] max-sm:hidden">
                          {fan.participatedMeetingCount}{t('influencerMyFansPage.t15')}
                        </span>
                        <span
                          className={`whitespace-nowrap text-sm font-bold ${memoCount ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}
                        >
                          {memoCount === undefined
                            ? '메모 확인 중'
                            : memoCount > 0
                              ? `메모 ${memoCount}`
                              : '메모 없음'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <aside
              aria-label={t('influencerMyFansPage.t16')}
              className="min-w-0 rounded-[10px] border border-[var(--color-divider)] p-[22px]"
            >
              {selected ? (
                <>
                  <div className="flex items-center gap-3.5">
                    {selected.profileImageUrl ? (
                      <img
                        alt={selected.nickname}
                        className="size-[52px] flex-none rounded-lg bg-[var(--color-surface-muted)] object-cover"
                        src={selected.profileImageUrl}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="grid size-[52px] flex-none place-items-center rounded-lg bg-[var(--color-surface-subtle)] text-[19px] font-extrabold text-[var(--color-text-tertiary)]"
                      >
                        {selected.nickname.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-[21px] font-black tracking-[-0.032em] text-[var(--color-text-primary)]">
                        {selected.nickname}
                      </h2>
                      <p className="mt-1 text-[15px] font-medium text-[var(--color-text-tertiary)]">
                        {t('influencerMyFansPage.t17')} {selected.fanId}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--color-divider)] pt-4">
                    <div>
                      <dt className="text-[13px] font-bold text-[var(--color-text-tertiary)]">
                        {t('influencerMyFansPage.t18')}
                      </dt>
                      <dd className="mt-[5px] text-lg font-extrabold tabular-nums">
                        {selected.participatedMeetingCount}{t('influencerMyFansPage.t19')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[13px] font-bold text-[var(--color-text-tertiary)]">
                        {t('influencerMyFansPage.t20')}
                      </dt>
                      <dd className="mt-[5px] text-lg font-extrabold tabular-nums">
                        {formatDate(selected.lastParticipatedAt)}
                      </dd>
                    </div>
                  </dl>

                  <section className="mt-[22px] border-t border-[var(--color-divider)] pt-[18px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-[15px] font-extrabold text-[var(--color-text-primary)]">
                        {t('influencerMyFansPage.t21')}
                      </h3>
                      <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-[var(--color-text-tertiary)]">
                        {selectedMemos === undefined
                          ? ''
                          : `${selectedMemos.length} / ${selected.participatedMeetingCount}`}
                      </span>
                    </div>
                    <p className="mt-[7px] border-b border-[var(--color-divider)] pb-3.5 text-sm font-medium leading-[1.55] text-[var(--color-text-tertiary)]">
                      {t('influencerMyFansPage.t22')}
                    </p>

                    {selectedMemos === undefined ? (
                      <div className="flex justify-center py-8">
                        <Spinner label={t('influencerMyFansPage.t23')} />
                      </div>
                    ) : selectedMemos.length > 0 ? (
                      <div className="mt-3.5 grid gap-2.5">
                        {selectedMemos.map((memo) => (
                          <article
                            className="rounded-[10px] border-l-[3px] border-[var(--color-primary-coral)] bg-[var(--color-surface-subtle)] px-4 py-3.5"
                            key={memo.memoId}
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <strong className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--color-text-primary)]">
                                {memo.meetingTitle}
                              </strong>
                              <time className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-[var(--color-text-tertiary)]">
                                {formatDate(memo.updatedAt || memo.createdAt)}
                              </time>
                            </div>
                            <p className="mt-2 text-[15px] font-medium leading-[1.7] text-[var(--color-text-body)]">
                              {memo.content}
                            </p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3.5 text-[15px] font-medium italic leading-[1.7] text-[var(--color-text-tertiary)]">
                        {t('influencerMyFansPage.t24')}
                      </p>
                    )}

                    {latestMemo ? (
                      <Link
                        className="mj-font-label mt-4 flex min-h-[46px] items-center justify-center rounded-lg border border-[var(--color-border-control)] bg-white text-[15px] transition-colors hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
                        to={`/influencer/fan-meetings/${encodeURIComponent(latestMemo.meetingId)}/fans/${encodeURIComponent(selected.fanId)}/records?tab=memo`}
                      >
                        {t('influencerMyFansPage.t25')}
                      </Link>
                    ) : selectedMemos !== undefined ? (
                      <p className="mt-4 text-sm font-medium text-[var(--color-text-tertiary)]">
                        {t('influencerMyFansPage.t26')}
                      </p>
                    ) : null}
                  </section>
                </>
              ) : (
                <p
                  className="py-10 text-center text-[15px] font-medium leading-[1.6] text-[var(--color-text-tertiary)]"
                  role="status"
                >
                  {t('influencerMyFansPage.t27')}
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

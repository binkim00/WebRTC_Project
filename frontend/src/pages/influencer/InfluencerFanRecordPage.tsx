import {
  CalendarBlank,
  ChatCircleText,
  ClockCounterClockwise,
  NotePencil,
} from '@phosphor-icons/react'
import type { ChangeEvent } from 'react'
import {
  Avatar,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Tabs,
  Textarea,
} from '../../components'
import { useParams, useSearchParams } from 'react-router-dom'
import { useState } from 'react'

type RecordTab = 'memo' | 'summary'

/* TODO: API 연동 후 아래 mock 데이터를 서버 응답 데이터로 교체 */
const fan = {
  id: 'fan-1',
  name: '김유진',
  nickname: '@yujin_light',
  lastCallDate: '2026.07.26',
}

const memoRecords = [
  {
    id: 'memo-1',
    date: '2026.07.26',
    title: '좋아하는 콘텐츠 이야기',
    preview: '카멜레온 콘텐츠를 특히 좋아한다고 이야기했다.',
    content: [
      '김유진 님은 카멜레온 콘텐츠를 특히 좋아한다고 이야기했다.',
      '다음 통화에서는 최근에 본 영상과 가장 기억에 남은 장면을 함께 이야기해 보기.',
    ],
  },
  {
    id: 'memo-2',
    date: '2026.06.14',
    title: '다음 팬미팅에서 물어볼 것',
    preview: '학교 생활과 새로 시작한 취미를 물어보기.',
    content: ['학교 생활과 새로 시작한 취미에 관해 이야기 나누기.'],
  },
  {
    id: 'memo-3',
    date: '2026.04.03',
    title: '첫 번째 팬미팅 메모',
    preview: '좋아하는 노래 이야기를 하며 편안해졌다.',
    content: ['처음에는 긴장했지만 좋아하는 노래 이야기를 하며 편안해졌다.'],
  },
] as const

const summaryRecords = [
  {
    id: 'summary-1',
    date: '2026.07.26',
    title: 'MELLY DAY 팬미팅',
    preview: '최근 근황과 좋아하는 영상에 관해 이야기했다.',
    content: [
      '김유진 님은 최근 학교에서 과학 동아리 활동을 시작했다고 말했다.',
      '카멜레온 콘텐츠 중 색이 바뀌는 순간을 가장 좋아한다고 이야기했다.',
      '다음 팬미팅에서도 서로의 최근 소식을 나누기로 하며 통화를 마쳤다.',
    ],
  },
  {
    id: 'summary-2',
    date: '2026.06.14',
    title: '여름밤 팬미팅',
    preview: '새로운 취미와 여름 계획에 관해 이야기했다.',
    content: [
      '새로 시작한 취미와 여름방학 동안 해보고 싶은 활동에 관해 이야기했다.',
    ],
  },
] as const

const tabItems = [
  {
    value: 'memo',
    label: (
      <span className="inline-flex items-center gap-2">
        <NotePencil aria-hidden size={18} weight="bold" />
        메모
        <span className="rounded-full bg-[var(--color-surface-page)] px-2 py-0.5 text-xs">
          {memoRecords.length}
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
          {summaryRecords.length}
        </span>
      </span>
    ),
  },
] as const

export function InfluencerFanRecordPage() {
  const { fanMeetingId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab')
  const [selectedRecordId, setSelectedRecordId] = useState<string>(
    memoRecords[0].id
  )
  const [memoText, setMemoText] = useState('')
  
  const activeTab: RecordTab = tab === 'summary' ? 'summary' : 'memo'


  const visibleRecords = activeTab === 'memo' ? memoRecords : summaryRecords
  const selectedRecord =
    visibleRecords.find((record) => record.id === selectedRecordId) ?? visibleRecords[0]
  const isMemoTab = activeTab === 'memo'

  const handleTabChange = (nextTab: string) => {
    setSearchParams({ tab: nextTab })
  }

  const handleRecordSelect = (recordId: string) => {
    setSelectedRecordId(recordId)
  }

  const handleMemoChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMemoText(event.target.value)
  }

  const handleMemoSave = () => {
    // TODO: 메모 저장 API 호출 및 저장 완료 상태 처리
    const content = memoText.trim()
    if(!content) { return }
  }

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
              to: fanMeetingId ? `/fan-meetings/${fanMeetingId}/fans` : undefined,
            },
            {
              label: fan.name,
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

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card>
          <CardContent className="grid gap-6">
            <Avatar
              className="mx-auto size-28"
              name={fan.name}
              size="lg"
            />
            <div>
              <p className="text-xs font-bold text-[var(--color-primary-coral)]">
                팬 프로필
              </p>
              <p className="mt-3 text-2xl font-black">{fan.name}</p>
              <p className="mt-1 text-[var(--color-text-secondary)]">{fan.nickname}</p>
            </div>
            <dl className="grid gap-5 border-t border-[var(--color-divider)] pt-6">
              <div>
                <dt className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-tertiary)]">
                  <ClockCounterClockwise aria-hidden size={18} weight="bold" />
                  최근 통화
                </dt>
                <dd className="mt-2 font-extrabold">{fan.lastCallDate}</dd>
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

            <div className="grid min-h-[460px] md:grid-cols-[320px_minmax(0,1fr)]">
              <section
                aria-label={isMemoTab ? '메모 기록 목록' : '대화 요약 기록 목록'}
                className="border-b border-[var(--color-divider)] md:border-b-0 md:border-r"
              >
                <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
                  <div>
                    <h2 className="font-extrabold">
                      {isMemoTab ? '메모 기록' : '대화 요약 기록'}
                    </h2>
                    <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
                      최신순
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                    {visibleRecords.length}개
                  </span>
                </div>
                <div className="border-t border-[var(--color-divider)]">
                  {visibleRecords.map((record) => {
                    const selected = record.id === selectedRecordId

                    return (
                      <button
                        aria-pressed={selected}
                        className={[
                          'relative grid w-full gap-2 border-b border-[var(--color-divider)] px-5 py-5 text-left transition-colors',
                          selected
                            ? 'bg-[var(--color-primary-coral-soft)]'
                            : 'hover:bg-[var(--color-surface-page)]',
                        ].join(' ')}
                        key={record.id}
                        onClick={() => handleRecordSelect(record.id)}
                        type="button"
                      >
                        {selected ? (
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 w-[3px] bg-[var(--color-primary-coral)]"
                          />
                        ) : null}
                        <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                          {record.date}
                        </span>
                        <span className="font-extrabold">{record.title}</span>
                        <span className="line-clamp-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                          {record.preview}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <article className="p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <p className="text-xs font-bold text-[var(--color-primary-coral)]">
                      {isMemoTab ? '직접 작성한 메모' : '읽기 전용'}
                    </p>
                    <h2 className="mt-3 text-2xl font-black">
                      {selectedRecord.title}
                    </h2>
                  </div>
                  <time
                    className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-tertiary)]"
                    dateTime="2026-07-26"
                  >
                    <CalendarBlank aria-hidden size={18} weight="bold" />
                    {selectedRecord.date}
                  </time>
                </div>
                <div className="mt-7 grid gap-4 border-t border-[var(--color-divider)] pt-7">
                  {selectedRecord.content.map((paragraph) => (
                    <p
                      className="leading-7 text-[var(--color-text-secondary)]"
                      key={paragraph}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            </div>
          </Card>

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
                    {memoText.length}/300
                  </span>
                </div>
                <Textarea
                  label="메모 내용"
                  value = {memoText}
                  maxLength={300}
                  onChange={handleMemoChange}
                  placeholder="팬과 나눈 대화나 다음 통화에서 참고할 내용을 입력하세요."
                  rows={5}
                />
                <Button
                  className="justify-self-end"
                  disabled={memoText.trim().length === 0}
                  onClick={handleMemoSave}
                >
                  메모 저장
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

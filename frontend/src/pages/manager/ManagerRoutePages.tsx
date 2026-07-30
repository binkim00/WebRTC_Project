import {
  ArrowLeft,
  ArrowRight,
  Check,
  FloppyDisk,
  Megaphone,
  PencilSimple,
  Plus,
  VideoCamera,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import { forceEndCallSession } from '../../api/callSessions'
import {
  createEvent,
  type FanMeetingForm,
  type ManagerApplication,
  type ManagerEvent,
  type ManagerNotice,
} from '../../api/managerOperations'
import { AlertBanner, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Select, TextField, Textarea } from '../../components'

/** 개발 환경에서만 샘플 화면을 열 수 있는 `preview=1` 여부를 반환한다. */
function usePreview() {
  const [params] = useSearchParams()
  return import.meta.env.DEV && params.get('preview') === '1'
}

/** 매니저 페이지의 제목, 설명, 선택적 뒤로가기 링크를 같은 형태로 표시한다. */
function PageHeader({ eyebrow, title, description, backTo }: { eyebrow?: string; title: string; description: string; backTo?: string }) {
  return (
    <header className="grid gap-2">
      {backTo ? <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]" to={backTo}><ArrowLeft size={17} /> 이전 화면으로 돌아가기</Link> : null}
      {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-primary-coral)]">{eyebrow}</p> : null}
      <h1 className="text-4xl font-black tracking-[-0.055em]">{title}</h1>
      <p className="text-[var(--color-text-secondary)]">{description}</p>
    </header>
  )
}

/** 3단계 입력 폼에서 현재 단계와 완료 단계를 시각적으로 표시한다. */
function Stepper({ step, labels = ['기본 정보', '응모 설정', '미리보기'] }: { step: number; labels?: string[] }) {
  return <ol className="mx-auto grid w-full max-w-4xl grid-cols-3 gap-0 px-5 py-8 sm:px-12 sm:py-10">
    {labels.map((label, index) => <li className="relative text-center" key={label}>
      {index < 2 ? <span className={`absolute left-1/2 right-[-50%] top-8 h-px ${index < step ? 'bg-gradient-to-r from-[var(--color-primary-coral)] to-[var(--color-success)]' : 'bg-[var(--color-divider)]'}`} /> : null}
      <span className="relative z-10 mx-auto block size-16">
        {index <= step ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 sm:size-52"
            style={{
              background: index < step
                ? 'radial-gradient(circle, rgba(52, 211, 153, 0.5) 0%, rgba(52, 211, 153, 0.16) 42%, rgba(52, 211, 153, 0) 72%)'
                : 'radial-gradient(circle, rgba(255, 92, 138, 0.58) 0%, rgba(255, 126, 103, 0.2) 40%, rgba(255, 126, 103, 0) 72%)',
              filter: 'blur(34px)',
            }}
          />
        ) : null}
        <span className={`relative z-10 mx-auto flex size-14 items-center justify-center rounded-full border text-sm font-black transition-shadow duration-300 ${index < step ? 'border-emerald-300 bg-[var(--color-success)] text-white shadow-[0_0_0_7px_rgba(16,185,129,0.08)]' : index === step ? 'border-orange-200 bg-[var(--color-primary-coral)] text-white shadow-[0_0_0_8px_rgba(255,126,103,0.10)]' : 'border-[var(--color-border-control)] bg-white text-[var(--color-text-tertiary)] shadow-sm'}`}>{index < step ? <Check size={19} weight="bold" /> : index + 1}</span>
      </span>
      <span className={`mt-4 block text-sm font-bold ${index === step ? 'text-[var(--color-primary-coral)]' : 'text-[var(--color-text-secondary)]'}`}>{label}</span>
    </li>)}
  </ol>
}

/** 단계형 폼의 임시 저장, 이전 단계, 다음 단계 버튼을 공통 배치한다. */
function FormActions({ onBack, onSave, nextLabel = '다음 단계', nextDisabled = false, nextLoading = false }: { onBack?: () => void; onSave?: () => void; nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean }) {
  return <div className="flex flex-wrap items-center justify-end gap-3">{onSave ? <Button leadingIcon={<FloppyDisk size={18} />} onClick={onSave} variant="secondary">임시 저장</Button> : null}<div className="flex gap-2">{onBack ? <Button disabled={nextLoading} leadingIcon={<ArrowLeft size={18} />} onClick={onBack} variant="secondary">이전 단계</Button> : null}<Button disabled={nextDisabled} loading={nextLoading} trailingIcon={<ArrowRight size={18} />} type="submit">{nextLabel}</Button></div></div>
}

/** datetime-local 입력값에 초가 없으면 백엔드 LocalDateTime 형식에 맞게 초를 붙인다. */
function toApiLocalDateTime(value: string): string {
  return value.length === 16 ? `${value}:00` : value
}

/** 예정 팬미팅과 대기열 시작 시간의 선후 관계를 검사하고 오류 메시지를 반환한다. */
function validateMeetingSchedule(form: FanMeetingForm): string | undefined {
  const scheduledStart = new Date(form.scheduledStartAt)
  const queueOpen = new Date(form.operation.queueOpenAt)

  const minimumStart = new Date(Date.now() + 60_000)

  if (Number.isNaN(scheduledStart.getTime()) || scheduledStart <= minimumStart) {
    return '팬미팅 시작 일시는 현재 시각보다 1분 이상 이후로 입력해 주세요.'
  }

  if (Number.isNaN(queueOpen.getTime()) || queueOpen >= scheduledStart) {
    return '대기열 오픈 일시는 팬미팅 시작 일시보다 이전이어야 합니다.'
  }

  return undefined
}

/** 아직 백엔드 API가 없는 화면에서 샘플 데이터를 실제 데이터처럼 보이지 않게 안내한다. */
function ApiUnavailablePage({
  title,
  description,
  endpoint,
  backTo,
}: {
  title: string
  description: string
  endpoint: string
  backTo?: string
}) {
  return (
    <div className="grid gap-7 pb-10">
      <PageHeader title={title} description={description} backTo={backTo} />
      <AlertBanner title="현재 백엔드 API가 구현되지 않았습니다" variant="warning">
        첨부된 API 구현 현황 기준으로 <code>{endpoint}</code> 엔드포인트를 사용할 수 없습니다.
        잘못된 요청을 보내거나 임시 데이터를 실제 데이터처럼 표시하지 않도록 연동을 중단했습니다.
      </AlertBanner>
    </div>
  )
}

/** 이벤트 목록 API가 준비되기 전 개발 미리보기에서만 사용하는 샘플 이벤트다. */
const sampleEvents: ManagerEvent[] = [
  { eventId: 'event-1', title: 'MELLY DAY 응모 안내', createdAt: '2026-07-24', applicationCount: 241 },
  { eventId: 'event-2', title: '멜리와 함께하는 SUMMER CALL', createdAt: '2026-07-18', applicationCount: 98 },
  { eventId: 'event-3', title: 'WINTER VOICE 사전 안내', createdAt: '2026-07-09' },
  { eventId: 'event-4', title: '서윤의 여름밤 팬미팅', createdAt: '2026-06-28', applicationCount: 72 },
]

/** 등록된 홍보·응모 이벤트를 검색하고 관리 화면으로 연결하는 목록 페이지다. */
export function ManagerEventListPage() {
  const preview = usePreview()
  const [keyword, setKeyword] = useState('')
  const [events, setEvents] = useState(sampleEvents)
  const navigate = useNavigate()

  if (!preview) {
    return (
      <ApiUnavailablePage
        title="이벤트 관리"
        description="작성한 이벤트와 응모 설정을 확인하고 관리하세요."
        endpoint="/api/v1/events/**"
      />
    )
  }

  /** 현재 입력한 키워드가 제목에 포함된 샘플 이벤트만 남긴다. */
  function search() {
    setEvents(sampleEvents.filter((item) => item.title.includes(keyword)))
  }

  return <div className="grid gap-7 pb-10"><PageHeader title="이벤트 관리" description="작성한 이벤트와 응모 설정을 확인하고 관리하세요." /><AlertBanner title="개발 미리보기" variant="warning">현재 화면은 <code>?preview=1</code>에서만 제공하는 샘플 데이터입니다.</AlertBanner><Card className="overflow-hidden"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-divider)] p-6"><div className="flex min-w-0 flex-1 flex-wrap items-end gap-2"><TextField containerClassName="min-w-[260px] flex-1" label="이벤트명 검색" onChange={(e) => setKeyword(e.target.value)} placeholder="이벤트명을 입력하세요" value={keyword} /><Button onClick={search} variant="secondary">검색</Button></div><Button leadingIcon={<Plus size={19} />} onClick={() => navigate('/manager/events/new?preview=1')}>새 이벤트</Button></div><div className="hidden grid-cols-[1.4fr_.8fr_.8fr] gap-4 bg-[var(--color-surface-page)] px-6 py-4 text-xs font-bold text-[var(--color-text-secondary)] sm:grid"><span>이벤트명</span><span>작성일</span><span>관리</span></div><div className="divide-y divide-[var(--color-divider)]">{events.map((event) => <div className="grid gap-3 px-6 py-5 sm:grid-cols-[1.4fr_.8fr_.8fr] sm:items-center" key={event.eventId}><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-[var(--color-surface-page)]"><Megaphone size={19} /></span><strong>{event.title}</strong></div><time className="text-sm text-[var(--color-text-secondary)]">{event.createdAt}</time><div className="flex gap-3 text-sm font-bold"><Link to={`/manager/events/${event.eventId}/applications?preview=1`}>응모자 관리 <ArrowRight className="inline" size={15} /></Link><Link to={`/manager/events/${event.eventId}/edit?preview=1`}>설정 <ArrowRight className="inline" size={15} /></Link></div></div>)}</div></Card></div>
}

/** 이벤트 수정 API가 준비되기 전 수정 화면의 UI 흐름을 확인하는 페이지다. */
export function ManagerEventEditPage() {
  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    title: 'MELLY와의 봄날 팬미팅',
    summary: '',
    description: '',
    coverImageUrl: '',
    applicationStartAt: '',
    applicationEndAt: '',
    resultAnnouncementAt: '',
    capacity: 30,
    question: '',
  })

  /** 제출 시 다음 단계로 이동하고 마지막 단계에서는 화면 내 저장 완료 상태만 표시한다. */
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (step < 2) {
      setStep(step + 1)
      return
    }
    setSaved(true)
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader
        eyebrow="PROMOTION & APPLICATION"
        title="홍보·응모 이벤트 수정"
        description="팬에게 공개할 소개와 응모 기간·질문을 구성하세요."
        backTo="/manager/events"
      />
      <AlertBanner title="팬미팅 운영 설정과 분리된 화면입니다" variant="info">
        이 화면은 팬에게 노출되는 홍보와 응모 정보만 다룹니다. 영상통화 일정·대기열·통화 시간은 팬미팅 관리에서 설정합니다.
      </AlertBanner>
      <Stepper step={step} labels={['홍보 정보', '응모 설정', '미리보기']} />
      <form className="grid gap-5" onSubmit={submit}>
        <Card>
          <CardHeader>
            <Badge variant="primary">STEP {step + 1}</Badge>
            <CardTitle as="h2" className="mt-3">
              {step === 0 ? '팬에게 보여줄 이벤트를 소개해 주세요' : step === 1 ? '응모 기간과 질문을 설정해 주세요' : '공개 전 화면을 확인해 주세요'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {step === 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField className="sm:col-span-2" label="이벤트 제목" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="팬에게 보일 이벤트 제목" />
                <TextField className="sm:col-span-2" label="한 줄 소개" required value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} placeholder="이벤트의 매력을 짧게 소개해 주세요" />
                <TextField className="sm:col-span-2" label="대표 이미지 URL" type="url" value={form.coverImageUrl} onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })} placeholder="https://..." />
                <Textarea className="sm:col-span-2" label="상세 소개" required rows={7} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="참여 방법과 팬이 알아야 할 내용을 작성해 주세요." />
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="응모 시작 일시" required type="datetime-local" value={form.applicationStartAt} onChange={(event) => setForm({ ...form, applicationStartAt: event.target.value })} />
                <TextField label="응모 종료 일시" required type="datetime-local" value={form.applicationEndAt} onChange={(event) => setForm({ ...form, applicationEndAt: event.target.value })} />
                <TextField label="결과 발표 일시" required type="datetime-local" value={form.resultAnnouncementAt} onChange={(event) => setForm({ ...form, resultAnnouncementAt: event.target.value })} />
                <TextField label="모집 인원" min={1} required type="number" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} />
                <Textarea className="sm:col-span-2" label="팬 응모 질문" required rows={4} value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} placeholder="예: 이번 팬미팅에서 가장 나누고 싶은 이야기는 무엇인가요?" />
                <Checkbox className="sm:col-span-2" defaultChecked label="응모 시 개인정보 수집 및 이용 동의를 받습니다." />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
                <div className="overflow-hidden rounded-2xl border border-[var(--color-divider)] bg-white">
                  <div className="flex aspect-[16/7] items-end bg-gradient-to-br from-orange-100 via-rose-50 to-indigo-100 p-6">
                    <Badge variant="primary">응모 예정</Badge>
                  </div>
                  <div className="p-6">
                    <p className="text-sm font-bold text-[var(--color-primary-coral)]">1:1 VIDEO FAN MEETING</p>
                    <h3 className="mt-2 text-3xl font-black">{form.title || '이벤트 제목'}</h3>
                    <p className="mt-3 text-[var(--color-text-secondary)]">{form.summary || '한 줄 소개가 표시됩니다.'}</p>
                    <p className="mt-5 whitespace-pre-wrap text-sm leading-7">{form.description || '상세 소개가 표시됩니다.'}</p>
                  </div>
                </div>
                <Card className="bg-[var(--color-surface-page)] p-5">
                  <h3 className="font-black">응모 정보</h3>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div className="border-b py-3"><dt className="text-[var(--color-text-secondary)]">응모 기간</dt><dd className="mt-1 font-bold">{form.applicationStartAt || '-'} ~ {form.applicationEndAt || '-'}</dd></div>
                    <div className="border-b py-3"><dt className="text-[var(--color-text-secondary)]">결과 발표</dt><dd className="mt-1 font-bold">{form.resultAnnouncementAt || '-'}</dd></div>
                    <div className="border-b py-3"><dt className="text-[var(--color-text-secondary)]">모집 인원</dt><dd className="mt-1 font-bold">{form.capacity}명</dd></div>
                    <div className="py-3"><dt className="text-[var(--color-text-secondary)]">응모 질문</dt><dd className="mt-1 font-bold">{form.question || '-'}</dd></div>
                  </dl>
                </Card>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {saved ? (
          <AlertBanner title="화면 구성을 완료했습니다" variant="warning">
            이벤트 생성·수정 API가 아직 구현되지 않아 서버에는 저장되지 않습니다. API가 제공되면 이 최종 등록 버튼에 연결할 수 있습니다.
          </AlertBanner>
        ) : null}
        <FormActions onBack={step > 0 ? () => setStep(step - 1) : undefined} nextLabel={step === 2 ? '이벤트 등록' : '다음 단계'} />
      </form>
    </div>
  )
}

/** 응모 관리 API가 준비되기 전 상태별 UI를 확인하기 위한 샘플 응모자다. */
const sampleApplications: ManagerApplication[] = [
  { applicationId: 'a-1', nickname: '별빛소다', answer: '지난 공연에서 들었던 노래가 가장 기억에 남아요.', status: 'SELECTED', memo: '답변이 구체적이고 참여 의지가 잘 드러남' },
  { applicationId: 'a-2', nickname: '유진라이트', answer: 'Melly에게 힘들 때 다시 일어나는 방법을 물어보고 싶어요.', status: 'HOLD', memo: '답변 내용을 조금 더 검토할 예정' },
  { applicationId: 'a-3', nickname: '구름한스푼', answer: '최근 가장 즐겨 듣는 노래와 작업 과정이 궁금해요.', status: 'REVIEW' },
  { applicationId: 'a-4', nickname: '봄날편지', answer: '팬들에게 꼭 추천하고 싶은 하루의 작은 습관이 있나요?', status: 'SELECTED', memo: '팬팅 취지와 잘 맞는 질문' },
  { applicationId: 'a-5', nickname: '멜로디정원', answer: '첫 무대 전날의 기분과 준비 과정을 듣고 싶어요.', status: 'UNSELECTED', memo: '모집 인원 초과로 미선정' },
]

/** 이벤트 응모자를 검토하고 선정·보류·미선정 상태를 관리하는 페이지다. */
export function ManagerApplicationsPage() {
  const preview = usePreview()
  const [applications, setApplications] = useState(sampleApplications)
  const [selected, setSelected] = useState('a-2')
  const [memo, setMemo] = useState('답변 내용을 조금 더 검토할 예정')
  const [saved, setSaved] = useState(false)
  const current = applications.find((item) => item.applicationId === selected)

  if (!preview) {
    return (
      <ApiUnavailablePage
        title="응모 관리"
        description="응모자의 답변을 검토하고 팬미팅 참가자를 확정하세요."
        endpoint="/api/v1/fan-meetings/{meetingId}/applications"
        backTo="/manager/events"
      />
    )
  }

  /** 선택된 응모자의 검토 상태와 메모를 현재 미리보기 상태에 반영한다. */
  function updateStatus(status: ManagerApplication['status']) {
    setApplications((items) => items.map((item) => item.applicationId === selected ? { ...item, status, memo } : item))
    setSaved(true)
  }

  return <div className="grid gap-7 pb-10"><PageHeader title="응모 관리" description="응모자의 답변을 검토하고 팬미팅 참가자를 확정하세요." backTo="/manager/events?preview=1" /><AlertBanner title="개발 미리보기" variant="warning">응모 API가 구현되지 않아 변경 내용은 현재 화면에만 반영됩니다.</AlertBanner><Card className="p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs text-[var(--color-text-secondary)]">이벤트명</p><h2 className="mt-1 text-xl font-black">MELLY와의 봄날 팬미팅</h2></div><div className="flex gap-8 text-right"><div><p className="text-xs text-[var(--color-text-secondary)]">전체 응모자</p><strong className="text-2xl">{applications.length}명</strong></div><div><p className="text-xs text-[var(--color-text-secondary)]">현재 선정</p><strong className="text-2xl text-[var(--color-primary-coral)]">{applications.filter((item) => item.status === 'SELECTED').length}명</strong></div></div></div></Card><div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.7fr)]"><Card className="overflow-hidden"><div className="divide-y">{applications.map((application) => <button className={`grid w-full gap-3 p-5 text-left transition hover:bg-[var(--color-surface-page)] sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center ${selected === application.applicationId ? 'border-l-4 border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)]' : ''}`} key={application.applicationId} onClick={() => { setSelected(application.applicationId); setMemo(application.memo ?? ''); setSaved(false) }} type="button"><input aria-label={`${application.nickname} 선택`} checked={selected === application.applicationId} className="size-4 accent-[var(--color-primary-coral)]" readOnly type="checkbox" /><strong>{application.nickname}</strong><span className="text-sm text-[var(--color-text-secondary)]">{application.answer}</span><Badge variant={application.status === 'SELECTED' ? 'success' : application.status === 'HOLD' ? 'warning' : 'neutral'}>{application.status === 'SELECTED' ? '선정' : application.status === 'HOLD' ? '보류' : application.status === 'UNSELECTED' ? '미선정' : '미검토'}</Badge></button>)}</div></Card><Card><CardHeader><Badge variant="primary">응모자 상세</Badge><CardTitle as="h2" className="mt-3">{current?.nickname ?? '선택된 응모자'}</CardTitle></CardHeader><CardContent className="grid gap-5"><div><p className="text-xs font-bold text-[var(--color-text-secondary)]">질문 답변</p><p className="mt-2 leading-6">{current?.answer}</p></div><div><p className="text-xs font-bold text-[var(--color-text-secondary)]">현재 상태</p><div className="mt-2 grid grid-cols-3 gap-2"><Button onClick={() => updateStatus('SELECTED')} variant={current?.status === 'SELECTED' ? 'primary' : 'secondary'}>선정</Button><Button onClick={() => updateStatus('HOLD')} variant={current?.status === 'HOLD' ? 'outline' : 'secondary'}>보류</Button><Button onClick={() => updateStatus('UNSELECTED')} variant="secondary">미선정</Button></div></div><Textarea label="선정 사유 또는 검토 메모" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} />{saved ? <AlertBanner title="미리보기에 반영했습니다" variant="success">서버에는 저장되지 않았습니다.</AlertBanner> : null}</CardContent></Card></div></div>
}

/**
 * 홍보·응모 이벤트를 생성하는 실제 API 연결 페이지다.
 * 현재 백엔드 계약상 예정 팬미팅 운영 값도 같은 요청 본문에 포함한다.
 */
export function ManagerEventCreatePage() {
  const session = getAuthSession()
  const isInfluencerAccount = session?.role === 'INFLUENCER' || session?.role === 'SOLO_INFLUENCER'
  const resolvedInfluencerId = isInfluencerAccount ? session?.userId : undefined
  const influencerNickname = isInfluencerAccount ? session?.nickname : undefined
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FanMeetingForm>({
    influencerId: resolvedInfluencerId ?? 0,
    title: '',
    description: '',
    coverImageUrl: null,
    scheduledStartAt: '',
    application: {
      enabled: true,
      startAt: null,
      endAt: null,
      resultAnnouncementAt: null,
      capacity: 30,
    },
    operation: {
      queueOpenAt: '',
      callDurationSec: 180,
      recordingEnabled: true,
      translationEnabled: false,
    },
  })
  const [createdMeetingId, setCreatedMeetingId] = useState<number>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  /**
   * 앞 단계에서는 화면만 이동하고, 마지막 단계에서 입력값을 API 형식으로 변환해 등록한다.
   */
  async function submit(event: React.FormEvent) {
    event.preventDefault()

    if (step < 2) {
      setStep(step + 1)
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('이벤트를 등록하려면 먼저 로그인해 주세요.')
      return
    }

    const payload: FanMeetingForm = {
      ...form,
      influencerId: resolvedInfluencerId ?? form.influencerId,
      description: form.description?.trim() || null,
      coverImageUrl: form.coverImageUrl?.trim() || null,
      scheduledStartAt: toApiLocalDateTime(form.scheduledStartAt),
      application: {
        ...form.application,
        startAt: form.application.enabled && form.application.startAt
          ? toApiLocalDateTime(form.application.startAt)
          : null,
        endAt: form.application.enabled && form.application.endAt
          ? toApiLocalDateTime(form.application.endAt)
          : null,
        resultAnnouncementAt:
          form.application.enabled && form.application.resultAnnouncementAt
            ? toApiLocalDateTime(form.application.resultAnnouncementAt)
            : null,
      },
      operation: {
        ...form.operation,
        queueOpenAt: toApiLocalDateTime(form.operation.queueOpenAt),
      },
    }

    if (!Number.isInteger(payload.influencerId) || payload.influencerId <= 0) {
      setError('담당 인플루언서 ID를 입력해 주세요.')
      return
    }

    const scheduleError = validateMeetingSchedule(payload)
    if (scheduleError) {
      setError(scheduleError)
      return
    }

    setSubmitting(true)
    setError(undefined)
    try {
      const created = await createEvent(payload, token)
      setCreatedMeetingId(created.meetingId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '이벤트 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader title="이벤트 생성" description="팬에게 공개할 홍보·응모 정보와 이후 팬미팅 운영 조건을 등록하세요." backTo="/manager/events" />
      <AlertBanner title="현재 백엔드의 이벤트 등록 경로를 사용합니다" variant="info">
        현재 명세에서는 이벤트 등록 요청을 <code>POST /api/v1/fan-meetings</code>로 받습니다.
        화면에서는 실제 업무 의미에 맞게 이벤트로 표시하며, 생성 결과의 <code>meetingId</code>는 서버 참조 ID로 보관합니다.
      </AlertBanner>
      <Stepper step={step} labels={['홍보 정보', '응모·운영 설정', '최종 확인']} />
      <form className="grid gap-5" onSubmit={submit}>
        <Card>
          <CardHeader>
            <Badge variant="primary">STEP {step + 1}</Badge>
            <CardTitle as="h2" className="mt-3">
              {step === 0 ? '이벤트 홍보 정보' : step === 1 ? '응모와 이후 팬미팅 운영 설정' : '이벤트 정보 최종 확인'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {step === 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="이벤트명" maxLength={200} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} helperText="팬에게 공개되는 홍보·응모 페이지의 제목입니다." />
                <TextField label="예정 팬미팅 일시" required type="datetime-local" value={form.scheduledStartAt} onChange={(event) => setForm({ ...form, scheduledStartAt: event.target.value })} />
                <div className="sm:col-span-2 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface-page)] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--color-primary-coral)]">담당 인플루언서</p>
                  {isInfluencerAccount ? (
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div>
                        <strong className="text-lg">{influencerNickname}</strong>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">현재 로그인한 인플루언서 계정으로 자동 연결됩니다.</p>
                      </div>
                      <Badge variant="success">자동 연결</Badge>
                    </div>
                  ) : (
                    <TextField
                      containerClassName="mt-3"
                      helperText="현재 명세에는 인플루언서 목록 조회 API가 없어 생성 요청에 필요한 사용자 ID를 직접 입력합니다."
                      label="인플루언서 사용자 ID"
                      min={1}
                      required
                      type="number"
                      value={form.influencerId || ''}
                      onChange={(event) => setForm({ ...form, influencerId: Number(event.target.value) })}
                    />
                  )}
                </div>
                <Textarea
                  containerClassName="sm:col-span-2"
                  label="이벤트 상세 소개"
                  value={form.description ?? ''}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="팬에게 보여 줄 이벤트와 응모 안내를 입력해 주세요."
                />
                <TextField
                  containerClassName="sm:col-span-2"
                  helperText="이미지 업로드 API가 명세에 없으므로 접근 가능한 이미지 URL을 입력합니다."
                  label="커버 이미지 URL"
                  maxLength={2048}
                  type="url"
                  value={form.coverImageUrl ?? ''}
                  onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })}
                  placeholder="https://example.com/cover.jpg"
                />
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-6">
                <section className="grid gap-5 rounded-2xl border border-[var(--color-divider)] p-5">
                  <Checkbox
                    checked={form.application.enabled}
                    description="응모를 사용하면 기간·결과 발표 일시·정원을 함께 전송합니다."
                    label="팬 응모를 진행합니다."
                    onChange={(event) => setForm({
                      ...form,
                      application: { ...form.application, enabled: event.target.checked },
                    })}
                  />
                  {form.application.enabled ? (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <TextField label="응모 시작 일시" required type="datetime-local" value={form.application.startAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, startAt: event.target.value } })} />
                      <TextField label="응모 종료 일시" required type="datetime-local" value={form.application.endAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, endAt: event.target.value } })} />
                      <TextField label="결과 발표 일시" required type="datetime-local" value={form.application.resultAnnouncementAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, resultAnnouncementAt: event.target.value } })} />
                      <TextField label="응모 정원" min={1} required type="number" value={form.application.capacity} onChange={(event) => setForm({ ...form, application: { ...form.application, capacity: Number(event.target.value) } })} />
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-text-secondary)]">응모 없는 이벤트로 등록하면 기간과 정원은 서버 규약에 맞게 비활성 값으로 전송됩니다.</p>
                  )}
                </section>
                <section className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--color-primary-coral)]">영상통화 운영</p>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">당첨자 선정 뒤 진행할 팬미팅의 예정 대기열과 1명당 통화 조건입니다.</p>
                  </div>
                <TextField label="대기열 오픈 일시" required type="datetime-local" value={form.operation.queueOpenAt} onChange={(event) => setForm({ ...form, operation: { ...form.operation, queueOpenAt: event.target.value } })} />
                <Select label="1인 통화 시간" options={[{ value: '120', label: '2분' }, { value: '180', label: '3분' }, { value: '300', label: '5분' }]} value={String(form.operation.callDurationSec)} onChange={(event) => setForm({ ...form, operation: { ...form.operation, callDurationSec: Number(event.target.value) } })} />
                <div className="grid gap-3 rounded-xl border border-[var(--color-divider)] p-4 sm:col-span-2">
                  <Checkbox checked={form.operation.recordingEnabled} label="통화 녹화를 사용합니다." onChange={(event) => setForm({ ...form, operation: { ...form.operation, recordingEnabled: event.target.checked } })} />
                  <Checkbox checked={form.operation.translationEnabled} label="실시간 번역을 사용합니다." onChange={(event) => setForm({ ...form, operation: { ...form.operation, translationEnabled: event.target.checked } })} />
                </div>
                </section>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-5 sm:grid-cols-[1fr_.9fr]">
                <div className="rounded-xl bg-[var(--color-surface-page)] p-6">
                  <p className="text-sm font-bold text-[var(--color-primary-coral)]">홍보·응모 이벤트</p>
                  <h3 className="mt-3 text-2xl font-black">{form.title}</h3>
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{form.description?.trim() || '등록된 이벤트 소개가 없습니다.'}</p>
                </div>
                <dl className="grid gap-3 text-sm">
                  <div className="flex justify-between border-b py-3"><dt>인플루언서</dt><dd className="font-bold">{isInfluencerAccount ? `${influencerNickname} (#${resolvedInfluencerId})` : `사용자 #${form.influencerId || '-'}`}</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>예정 팬미팅</dt><dd className="font-bold">{form.scheduledStartAt}</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>응모</dt><dd className="font-bold">{form.application.enabled ? `${form.application.capacity}명 모집` : '사용 안 함'}</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>대기열 오픈</dt><dd className="font-bold">{form.operation.queueOpenAt}</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>통화 시간</dt><dd className="font-bold">{form.operation.callDurationSec}초</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>녹화 / 번역</dt><dd className="font-bold">{form.operation.recordingEnabled ? '녹화 사용' : '녹화 미사용'} · {form.operation.translationEnabled ? '번역 사용' : '번역 미사용'}</dd></div>
                </dl>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {error ? <AlertBanner title="등록 실패" variant="error">{error}</AlertBanner> : null}
        {createdMeetingId ? <AlertBanner title="이벤트가 DRAFT 상태로 생성되었습니다" variant="success">백엔드가 반환한 참조 ID(meetingId)는 {createdMeetingId}입니다.</AlertBanner> : null}
        <FormActions
          nextDisabled={Boolean(createdMeetingId)}
          nextLoading={submitting}
          onBack={step > 0 && !createdMeetingId ? () => setStep(step - 1) : undefined}
          nextLabel={step === 2 ? '이벤트 등록' : '다음 단계'}
        />
        {createdMeetingId ? (
          <div className="flex justify-end">
            <Link className="inline-flex min-h-[var(--control-height)] items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-white px-[var(--control-padding-inline)] text-sm font-semibold" to="/manager/events/manage">
              이벤트 관리 목록으로 이동 <ArrowRight size={18} />
            </Link>
          </div>
        ) : null}
      </form>
    </div>
  )
}

/** 팬미팅 수정 API가 제공되지 않은 현재 상태를 명확하게 안내하는 페이지다. */
export function ManagerMeetingSettingsPage() {
  return (
    <ApiUnavailablePage
      title="팬미팅 설정"
      description="응모 당첨자로 구성된 팬미팅 일정과 운영 설정을 수정하세요."
      endpoint="PATCH /api/v1/fan-meetings/{meetingId}"
      backTo="/manager/fan-meetings"
    />
  )
}

/** 팬미팅 공지 목록과 선택한 공지 내용을 확인하는 관리 페이지다. */
export function ManagerNoticesPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? 'demo-meeting'
  const preview = usePreview()
  const notices: ManagerNotice[] = [
    { noticeId: 'notice-1', title: '팬미팅 입장 시간이 변경되었습니다', content: '운영 일정 조정으로 팬미팅 시작 시간이 오후 7시 30분으로 변경되었습니다.', status: 'SCHEDULED', publishAt: '2026-07-27T18:00' },
    { noticeId: 'notice-2', title: '팬미팅 전 장비 점검 안내', content: '팬미팅 시작 전 장비 점검을 완료해 주세요.', status: 'PUBLISHED' },
  ]
  const [selected, setSelected] = useState(notices[0])

  if (!preview) {
    return (
      <ApiUnavailablePage
        title="팬미팅 공지 관리"
        description="진행 중인 팬미팅의 운영 안내를 작성하고 게시 상태를 관리하세요."
        endpoint="/api/v1/fan-meetings/{meetingId}/notices"
        backTo={`/manager/fan-meetings/${meetingId}/monitor`}
      />
    )
  }

  return <div className="grid gap-7 pb-10"><PageHeader title="팬미팅 공지 관리" description="진행 중인 팬미팅의 운영 안내를 작성하고 게시 상태를 관리하세요." backTo={`/manager/fan-meetings/${meetingId}/monitor?preview=1`} /><AlertBanner title="개발 미리보기" variant="warning">공지 API가 구현되지 않아 읽기 전용 샘플만 표시합니다.</AlertBanner><div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><Card className="overflow-hidden"><CardHeader><CardTitle as="h2">공지 목록</CardTitle></CardHeader><div className="divide-y">{notices.map((notice) => <button className={`w-full p-5 text-left hover:bg-[var(--color-surface-page)] ${selected.noticeId === notice.noticeId ? 'border-l-4 border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)]' : ''}`} key={notice.noticeId} onClick={() => setSelected(notice)} type="button"><Badge variant={notice.status === 'PUBLISHED' ? 'success' : 'warning'}>{notice.status === 'PUBLISHED' ? '게시' : '예약'}</Badge><strong className="mt-3 block text-sm">{notice.title}</strong></button>)}</div></Card><Card><CardHeader><Badge variant="primary">선택한 공지</Badge><CardTitle as="h2" className="mt-3">{selected.title}</CardTitle></CardHeader><CardContent><p className="leading-7">{selected.content}</p></CardContent></Card></div></div>
}

/** 로그인 응답에 저장된 현재 매니저 정보를 표시하는 마이페이지다. */
export function ManagerMyPage() {
  const session = getAuthSession()
  const profile = session
    ? {
        nickname: session.nickname,
        role: session.role,
        name: session.nickname,
      }
    : null
  const loading = false

  const displayName = profile?.name ?? profile?.nickname
  const roleLabel = profile?.role === 'MANAGER' ? '매니저' : profile?.role

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader
        title="내 마이페이지"
        description="개인정보를 확인하고 팬미팅 관리 이력으로 이동하세요."
      />

      {loading ? <Card className="p-8">프로필 정보를 불러오는 중입니다.</Card> : null}

      {!loading && !profile ? (
        <Card className="grid gap-4 p-8">
          <h2 className="text-xl font-black">로그인이 필요합니다.</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            현재 회원 정보를 확인하려면 매니저 계정으로 로그인해 주세요.
          </p>
          <Link
            className="font-bold text-[var(--color-primary-coral)]"
            to="/login"
          >
            로그인 화면으로 이동 <ArrowRight className="inline" size={17} />
          </Link>
        </Card>
      ) : null}

      {!loading && profile ? (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex size-28 items-center justify-center rounded-2xl bg-[var(--color-primary-coral-soft)] text-4xl font-black text-[var(--color-primary-coral)]">
                {displayName?.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <Badge variant="primary">{roleLabel}</Badge>
                <h2 className="mt-3 text-3xl font-black">{displayName}</h2>
                <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--color-text-secondary)]">
                  <div>
                    <dt className="inline">닉네임 </dt>
                    <dd className="inline font-bold text-[var(--color-text-primary)]">
                      {profile.nickname}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="grid gap-2">
                <Button leadingIcon={<PencilSimple size={17} />}>회원정보 수정</Button>
                <Button variant="secondary">비밀번호 변경</Button>
              </div>
            </div>
          </Card>
          <Card className="flex flex-wrap items-center gap-5 p-6">
            <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-surface-page)]">
              <VideoCamera size={24} />
            </span>
            <div className="flex-1">
              <h2 className="font-black">팬미팅 관리 이력</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                담당하거나 관리했던 1:1 영상통화 팬미팅 목록을 확인하세요.
              </p>
            </div>
            <Link
              className="font-bold text-[var(--color-primary-coral)]"
              to="/manager/fan-meetings/manage"
            >
              이력 확인 <ArrowRight className="inline" size={17} />
            </Link>
          </Card>
        </>
      ) : null}
    </div>
  )
}

/** 팬미팅 진행률과 참가자 상태를 요약하는 통계 페이지다. */
export function ManagerStatisticsPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? 'demo-meeting'
  const metrics = [
    ['전체 참가자', '32명', '100%'],
    ['완료된 통화', '24명', '75%'],
    ['평균 통화 시간', '01:58', '목표 02:00'],
    ['장비 점검 완료', '31명', '97%'],
  ]

  return <div className="grid gap-7 pb-10"><PageHeader title="팬미팅 통계" description="팬미팅 진행률과 참가자·장비 상태를 한눈에 확인하세요." backTo={`/manager/fan-meetings/${meetingId}/monitor`} /><AlertBanner title="샘플 통계 화면" variant="warning">통계 API가 아직 구현되지 않아 아래 지표는 샘플 데이터입니다. 백엔드 API 연결 후 실제 팬미팅 수치로 교체됩니다.</AlertBanner><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, helper]) => <Card className="p-5" key={label}><p className="text-sm text-[var(--color-text-secondary)]">{label}</p><p className="mt-3 text-3xl font-black">{value}</p><p className="mt-2 text-xs font-semibold text-[var(--color-primary-coral)]">{helper}</p></Card>)}</div><Card><CardHeader><CardTitle as="h2">세션 진행 현황</CardTitle></CardHeader><CardContent className="grid gap-5"><div className="flex items-center justify-between text-sm"><span>완료 24명 / 전체 32명</span><strong className="text-[var(--color-primary-coral)]">75%</strong></div><div className="h-4 overflow-hidden rounded-full bg-[var(--color-surface-page)]"><div className="h-full w-3/4 rounded-full bg-[var(--color-primary-coral)]" /></div></CardContent></Card></div>
}

/** 위험 감지 통화 세션을 확인하고 필요하면 강제 종료하는 처리 페이지다. */
export function ManagerRiskIncidentPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? 'demo-meeting'
  const [params] = useSearchParams()
  const callSessionId = params.get('callSessionId')?.trim()
  const [reason, setReason] = useState('운영자 판단에 따른 강제 종료')
  const [submitting, setSubmitting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string>()

  /** URL로 전달된 통화 세션 ID를 사용해 백엔드 강제 종료 API를 호출한다. */
  async function forceEnd() {
    if (!callSessionId) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('강제 종료하려면 먼저 로그인해 주세요.')
      return
    }

    setSubmitting(true)
    setError(undefined)
    try {
      await forceEndCallSession(callSessionId, { reason }, { authToken: token })
      setEnded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '통화 강제 종료에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader eyebrow="CALL OPERATION" title="위험 상황 처리" description="현재 통화 세션을 확인하고 필요한 경우 강제로 종료하세요." backTo={`/manager/fan-meetings/${meetingId}/monitor`} />
      <AlertBanner title="AI 위험 감지 API는 아직 구현되지 않았습니다" variant="warning">
        감지 유형·신뢰도·판단 저장 기능은 표시하지 않습니다. 현재 백엔드에서 지원하는 통화 강제 종료만 사용할 수 있습니다.
      </AlertBanner>
      {!callSessionId ? (
        <AlertBanner title="통화 세션 정보가 필요합니다" variant="error">
          모니터링 화면의 현재 통화에서 진입하거나 URL에 <code>callSessionId</code>를 전달해 주세요.
        </AlertBanner>
      ) : (
        <Card>
          <CardHeader>
            <Badge variant="danger">세션 {callSessionId}</Badge>
            <CardTitle as="h2" className="mt-3">현재 영상통화 강제 종료</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Textarea label="강제 종료 사유" required rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
            <Button disabled={submitting || ended || !reason.trim()} onClick={forceEnd} variant="danger">
              {ended ? '강제 종료 완료' : submitting ? '종료 처리 중…' : '현재 통화 강제 종료'}
            </Button>
            {error ? <AlertBanner title="강제 종료 실패" variant="error">{error}</AlertBanner> : null}
            {ended ? <AlertBanner title="통화를 종료했습니다" variant="success">서버에서 강제 종료 결과를 확인했습니다.</AlertBanner> : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

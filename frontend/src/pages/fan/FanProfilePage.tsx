import {
  ArrowRight,
  Key,
  PencilSimple,
  Ticket,
  VideoCamera,
} from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { Button, Card, CardContent } from '../../components'
import profileImage from '../../assets/call-preview-remote.jpg'

/*
 * TODO: API 연동 후 처리
 * 1. 로그인 사용자의 프로필 정보를 조회한다.
 * 2. 회원정보 수정·비밀번호 변경 화면을 연결한다.
 * 3. 회원탈퇴 확인 및 처리 흐름을 연결한다.
 */
const fanProfileMock = {
  nickname: '별빛소다',
  name: '김하린',
  email: 'harin.kim@example.com',
  profileImageUrl: profileImage,
}

const activityItems = [
  {
    title: '응모한 이벤트',
    description: '내가 응모한 이벤트를 확인해 보세요.',
    to: '/fan/mypage/applications',
    icon: Ticket,
  },
  {
    title: '팬미팅',
    description: '신청한 팬미팅 목록으로 이동합니다.',
    to: '/fan/mypage/fan-meetings?status=upcoming',
    icon: VideoCamera,
  },
] as const

export function FanProfilePage() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-7">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.045em]">마이페이지</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          내 정보와 참여 내역을 관리하세요.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <img
              alt={`${fanProfileMock.nickname} 프로필`}
              className="size-24 shrink-0 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] object-cover p-1"
              src={fanProfileMock.profileImageUrl}
            />

            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                프로필
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">
                {fanProfileMock.nickname}
              </h2>
              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div className="flex gap-3">
                  <dt className="font-semibold text-[var(--color-text-tertiary)]">이름</dt>
                  <dd className="font-bold">{fanProfileMock.name}</dd>
                </div>
                <div className="flex min-w-0 gap-3">
                  <dt className="font-semibold text-[var(--color-text-tertiary)]">
                    이메일
                  </dt>
                  <dd className="truncate font-bold">{fanProfileMock.email}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
            {/* TODO: 회원정보 수정 화면 연결 */}
            <Button
              leadingIcon={<PencilSimple aria-hidden size={17} weight="bold" />}
              size="sm"
            >
              회원정보 수정
            </Button>
            {/* TODO: 비밀번호 변경 화면 연결 */}
            <Button
              leadingIcon={<Key aria-hidden size={17} weight="bold" />}
              size="sm"
              variant="secondary"
            >
              비밀번호 변경
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="text-2xl font-black tracking-[-0.035em]">내 활동</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            참여한 이벤트와 팬미팅을 확인할 수 있어요.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {activityItems.map((item) => {
              const Icon = item.icon

              return (
                <Link
                  className="group flex min-h-28 items-center gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] p-5 transition-[border-color,background-color] hover:border-[var(--color-primary-coral-soft-border)] hover:bg-[var(--color-primary-coral-soft)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                  key={item.to}
                  to={item.to}
                >
                  <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)]">
                    <Icon aria-hidden size={28} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-lg">{item.title}</strong>
                    <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">
                      {item.description}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
                    size={22}
                    weight="bold"
                  />
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        {/* TODO: 회원탈퇴 확인 Dialog 연결 */}
        <button
          className="text-sm text-[var(--color-text-secondary)] underline underline-offset-4 hover:text-[var(--color-error)]"
          type="button"
        >
          회원탈퇴
        </button>
      </div>
    </div>
  )
}

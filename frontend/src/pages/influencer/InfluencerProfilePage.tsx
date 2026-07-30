import {
  ArrowRight,
  Key,
  PencilSimple,
  VideoCamera,
} from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { Button, Card, CardContent } from '../../components'
import profileImage from '../../assets/call-preview-remote.jpg'

/*
 * TODO: API 연동 후 처리
 * 1. 로그인한 인플루언서의 프로필 정보를 조회한다.
 * 2. 회원정보 수정·비밀번호 변경 화면을 연결한다.
 * 3. 회원탈퇴 확인 및 처리 흐름을 연결한다.
 */
const influencerProfileMock = {
  displayName: 'Melly',
  name: '김멜',
  email: 'melly.kim@example.com',
  profileImageUrl: profileImage,
}

export function InfluencerProfilePage() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-7">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.045em]">내 마이페이지</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          개인정보를 확인하고 팬미팅 이력을 관리하세요.
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-center">
            <img
              alt={`${influencerProfileMock.displayName} 프로필`}
              className="size-32 shrink-0 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] object-cover p-1"
              src={influencerProfileMock.profileImageUrl}
            />

            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-primary-coral)]">
                인플루언서 프로필
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                {influencerProfileMock.displayName}
              </h2>

              <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <dt className="font-semibold text-[var(--color-text-tertiary)]">
                    이름
                  </dt>
                  <dd className="font-bold">{influencerProfileMock.name}</dd>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <dt className="font-semibold text-[var(--color-text-tertiary)]">
                    이메일
                  </dt>
                  <dd className="truncate font-bold">
                    {influencerProfileMock.email}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-[var(--color-divider)] pt-6 lg:flex-col lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
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

      <Link
        className="group flex min-h-28 items-center gap-5 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] bg-[var(--color-surface-panel)] p-6 shadow-[var(--shadow-panel)] transition-[border-color,background-color] hover:border-[var(--color-primary-coral-soft-border)] hover:bg-[var(--color-primary-coral-soft)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
        to="/influencer/mypage/fan-meetings"
      >
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)]">
          <VideoCamera aria-hidden size={28} weight="duotone" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-xl">나의 팬미팅 이력</strong>
          <span className="mt-2 block text-sm text-[var(--color-text-secondary)]">
            생성하거나 진행한 팬미팅과 상태를 확인하세요.
          </span>
        </span>
        <span className="hidden items-center gap-3 font-bold sm:inline-flex">
          이력 확인
          <ArrowRight
            aria-hidden
            className="text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
            size={22}
            weight="bold"
          />
        </span>
      </Link>

      <div className="flex justify-end border-t border-[var(--color-divider)] pt-6">
        {/* TODO: 회원탈퇴 확인 Dialog 연결 */}
        <button
          className="text-sm text-[var(--color-text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--color-error)]"
          type="button"
        >
          회원탈퇴
        </button>
      </div>
    </div>
  )
}

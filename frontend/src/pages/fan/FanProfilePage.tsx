import {
  ArrowRight,
  Key,
  PencilSimple,
  Ticket,
  VideoCamera,
} from '@phosphor-icons/react'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { getEmailVerificationStatus } from '../../api/emailVerifications'
import { getMyProfile, updateMyProfile, type UserProfile } from '../../api/users'
import { isEmailVerificationEnabled } from '../../config/features'
import {
  AlertBanner,
  Avatar,
  Button,
  Card,
  CardContent,
  EmailVerificationNotice,
  Select,
  Spinner,
  TextField,
  WithdrawAccountSection,
} from '../../components'

// 백엔드 PreferredLanguage Enum(KOREAN, ENGLISH)과 동일한 값만 사용한다.
const preferredLanguageOptions = [
  { label: '한국어', value: 'KOREAN' },
  { label: 'English', value: 'ENGLISH' },
]

const preferredLanguageLabels: Record<string, string> = {
  KOREAN: '한국어',
  ENGLISH: 'English',
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
  const [profile, setProfile] = useState<UserProfile>()
  const [loadError, setLoadError] = useState<string>()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveNotice, setSaveNotice] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    const session = getAuthSession()

    if (!session) {
      setLoadError('프로필을 확인하려면 먼저 로그인해 주세요.')
      return () => controller.abort()
    }

    void getMyProfile(session.accessToken, controller.signal)
      .then((result) => {
        setProfile(result)
        setLoadError(undefined)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '프로필 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        )
      })

    return () => controller.abort()
  }, [])

  // /users/me가 emailVerified를 내려주지 않는 백엔드에서도 인증 안내를 띄울 수 있도록
  // 전용 상태 조회로 한 번 더 확인한다. 기능이 없는 백엔드는 실패하고 안내는 계속 숨는다.
  useEffect(() => {
    if (!isEmailVerificationEnabled) return
    if (!profile || profile.emailVerified !== undefined) return

    const token = getAuthSession()?.accessToken
    if (!token) return

    const controller = new AbortController()
    void getEmailVerificationStatus(token, controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return
        setProfile((current) =>
          current ? { ...current, emailVerified: status.emailVerified } : current,
        )
      })
      .catch(() => {
        // 인증 안내는 부가 정보이므로 조회 실패는 조용히 넘긴다.
      })

    return () => controller.abort()
  }, [profile])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const session = getAuthSession()
    if (!session) {
      setSaveError('로그인이 만료되었습니다. 다시 로그인해 주세요.')
      return
    }

    const formData = new FormData(event.currentTarget)
    const nickname = String(formData.get('nickname') ?? '').trim()
    const preferredLanguage = String(formData.get('preferredLanguage') ?? 'KOREAN')

    if (!nickname) {
      setSaveError('닉네임을 입력해 주세요.')
      return
    }

    setIsSaving(true)
    setSaveError(undefined)
    setSaveNotice(undefined)

    try {
      const updated = await updateMyProfile(
        { nickname, preferredLanguage },
        session.accessToken,
      )
      setProfile((current) =>
        current
          ? {
              ...current,
              nickname: updated.nickname,
              preferredLanguage: updated.preferredLanguage,
              profileImageUrl: updated.profileImageUrl,
              email: updated.email,
            }
          : current,
      )
      setIsEditing(false)
      setSaveNotice('회원정보가 수정되었습니다.')
    } catch (reason) {
      setSaveError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '회원정보 수정에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const isLoading = profile === undefined && !loadError

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-7">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.045em]">마이페이지</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          내 정보와 참여 내역을 관리하세요.
        </p>
      </header>

      {loadError ? (
        <AlertBanner title="프로필을 확인할 수 없습니다" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}
      {/* 회원정보 수정과 이메일 인증 완료가 같은 배너를 쓰므로 제목은 중립적으로 둔다. */}
      {saveNotice ? (
        <AlertBanner title="처리 완료" variant="success">
          {saveNotice}
        </AlertBanner>
      ) : null}

      {/* 미인증이 확정된 경우에만 안내한다. 구버전 백엔드는 필드가 없어(undefined) 표시하지 않는다. */}
      {isEmailVerificationEnabled && profile?.emailVerified === false ? (
        <Card>
          <CardContent>
            <EmailVerificationNotice
              email={profile.email}
              onVerified={() => {
                setProfile((current) =>
                  current ? { ...current, emailVerified: true } : current,
                )
                setSaveNotice('이메일 인증이 완료되었어요. 이제 팬미팅 응모에 참여할 수 있습니다.')
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="프로필을 불러오는 중" />
        </div>
      ) : profile ? (
        <Card>
          <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              {/* 등록된 프로필 이미지가 없으면 닉네임 기반 아바타를 표시한다 */}
              {profile.profileImageUrl ? (
                <img
                  alt={`${profile.nickname} 프로필`}
                  className="size-24 shrink-0 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] object-cover p-1"
                  src={profile.profileImageUrl}
                />
              ) : (
                <Avatar
                  className="size-24 shrink-0 rounded-[var(--radius-panel)]"
                  name={profile.nickname}
                  size="lg"
                />
              )}

              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                  프로필
                </p>

                {isEditing ? (
                  <form className="mt-3 grid max-w-md gap-4" onSubmit={(event) => void handleSave(event)}>
                    <TextField
                      defaultValue={profile.nickname}
                      label="닉네임"
                      name="nickname"
                      required
                    />
                    <Select
                      defaultValue={profile.preferredLanguage}
                      label="선호 언어"
                      name="preferredLanguage"
                      options={preferredLanguageOptions}
                    />
                    {saveError ? (
                      <AlertBanner title="수정 실패" variant="error">
                        {saveError}
                      </AlertBanner>
                    ) : null}
                    <div className="flex gap-3">
                      <Button loading={isSaving} size="sm" type="submit">
                        저장
                      </Button>
                      <Button
                        disabled={isSaving}
                        onClick={() => {
                          setIsEditing(false)
                          setSaveError(undefined)
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        취소
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">
                      {profile.nickname}
                    </h2>
                    <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                      <div className="flex gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          아이디
                        </dt>
                        <dd className="font-bold">{profile.loginId}</dd>
                      </div>
                      <div className="flex min-w-0 gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          이메일
                        </dt>
                        <dd className="truncate font-bold">{profile.email}</dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          선호 언어
                        </dt>
                        <dd className="font-bold">
                          {preferredLanguageLabels[profile.preferredLanguage] ??
                            profile.preferredLanguage}
                        </dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          회원번호
                        </dt>
                        <dd className="font-bold">{profile.userId}</dd>
                      </div>
                    </dl>
                  </>
                )}
              </div>
            </div>

            {!isEditing ? (
              <div className="flex shrink-0 flex-wrap gap-3">
                <Button
                  leadingIcon={<PencilSimple aria-hidden size={17} weight="bold" />}
                  onClick={() => {
                    setIsEditing(true)
                    setSaveNotice(undefined)
                  }}
                  size="sm"
                >
                  회원정보 수정
                </Button>
                {/* TODO: 비밀번호 변경 API가 아직 백엔드에 없어 비활성화 상태로 둡니다. */}
                <Button
                  disabled
                  leadingIcon={<Key aria-hidden size={17} weight="bold" />}
                  size="sm"
                  title="비밀번호 변경 기능은 준비 중입니다."
                  variant="secondary"
                >
                  비밀번호 변경
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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

      <WithdrawAccountSection description="탈퇴하면 응모 내역과 팬미팅 참여 기록을 다시 볼 수 없습니다." />
    </div>
  )
}

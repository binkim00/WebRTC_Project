import {
  ArrowRight,
  Key,
  PencilSimple,
  VideoCamera,
} from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertBanner,
  Avatar,
  Button,
  Card,
  CardContent,
  Select,
  Spinner,
  TextField,
  WithdrawAccountSection,
} from '../../components'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  getMyProfile,
  updateMyProfile,
  type UserProfile,
} from '../../api/users'

const languageOptions = [
  { label: '한국어', value: 'KOREAN' },
  { label: 'English', value: 'ENGLISH' },
] as const

function languageLabel(value: string) {
  return languageOptions.find((option) => option.value === value)?.label ?? value
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof TypeError
    ? reason.message
    : fallback
}

export function InfluencerProfilePage() {
  const authToken = getAuthSession()?.accessToken

  const [profile, setProfile] = useState<UserProfile>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()

  const [editing, setEditing] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [languageInput, setLanguageInput] = useState('KOREAN')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveDone, setSaveDone] = useState(false)

  useEffect(() => {
    if (!authToken) {
      setLoadError('로그인 정보가 없습니다. 로그인 후 다시 시도해 주세요.')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    void getMyProfile(authToken, controller.signal)
      .then((response) => {
        setProfile(response)
        setLoadError(undefined)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(errorMessage(reason, '회원정보를 불러오지 못했습니다.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [authToken])

  function startEditing() {
    if (!profile) return
    setNicknameInput(profile.nickname)
    setLanguageInput(profile.preferredLanguage)
    setSaveError(undefined)
    setSaveDone(false)
    setEditing(true)
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken || !profile) return

    const nickname = nicknameInput.trim()
    if (!nickname) {
      setSaveError('닉네임을 입력해 주세요.')
      return
    }

    setSaving(true)
    setSaveError(undefined)

    void updateMyProfile(
      { nickname, preferredLanguage: languageInput },
      authToken,
    )
      .then((updated) => {
        setProfile((current) =>
          current
            ? {
                ...current,
                nickname: updated.nickname,
                preferredLanguage: updated.preferredLanguage,
                profileImageUrl: updated.profileImageUrl,
              }
            : current,
        )
        setEditing(false)
        setSaveDone(true)
      })
      .catch((reason: unknown) => {
        setSaveError(errorMessage(reason, '회원정보 수정에 실패했습니다.'))
      })
      .finally(() => setSaving(false))
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-7">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.045em]">내 마이페이지</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          개인정보를 확인하고 팬미팅 이력을 관리하세요.
        </p>
      </header>

      {loadError ? (
        <AlertBanner title="회원정보를 불러오지 못했습니다" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}
      {saveDone ? (
        <AlertBanner title="회원정보가 수정되었습니다" variant="success">
          변경한 닉네임과 선호 언어가 저장되었습니다.
        </AlertBanner>
      ) : null}

      <Card>
        {loading ? (
          <CardContent className="flex min-h-56 items-center justify-center">
            <Spinner label="회원정보를 불러오는 중" />
          </CardContent>
        ) : profile ? (
          <CardContent className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-center">
              {profile.profileImageUrl ? (
                <img
                  alt={`${profile.nickname} 프로필`}
                  className="size-32 shrink-0 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] object-cover p-1"
                  src={profile.profileImageUrl}
                />
              ) : (
                <Avatar
                  className="size-32 shrink-0 rounded-[var(--radius-panel)]"
                  name={profile.nickname}
                  size="lg"
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--color-primary-coral)]">
                  인플루언서 프로필
                </p>

                {editing ? (
                  <form className="mt-4 grid max-w-md gap-4" onSubmit={handleSave}>
                    <TextField
                      label="닉네임"
                      maxLength={30}
                      onChange={(event) => setNicknameInput(event.currentTarget.value)}
                      placeholder="닉네임을 입력하세요"
                      value={nicknameInput}
                    />
                    <Select
                      label="선호 언어"
                      onChange={(event) => setLanguageInput(event.currentTarget.value)}
                      options={languageOptions}
                      value={languageInput}
                    />
                    {saveError ? (
                      <p className="text-sm font-semibold text-[var(--color-error)]" role="alert">
                        {saveError}
                      </p>
                    ) : null}
                    <div className="flex gap-3">
                      <Button disabled={saving} size="sm" type="submit">
                        {saving ? '저장 중...' : '저장'}
                      </Button>
                      <Button
                        disabled={saving}
                        onClick={() => setEditing(false)}
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
                    <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                      {profile.nickname}
                    </h2>

                    <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
                      <div className="flex items-center gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          아이디
                        </dt>
                        <dd className="font-bold">{profile.loginId}</dd>
                      </div>
                      <div className="flex min-w-0 items-center gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          이메일
                        </dt>
                        <dd className="truncate font-bold">{profile.email}</dd>
                      </div>
                      <div className="flex items-center gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          선호 언어
                        </dt>
                        <dd className="font-bold">
                          {languageLabel(profile.preferredLanguage)}
                        </dd>
                      </div>
                      <div className="flex items-center gap-3">
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

            <div className="flex flex-wrap gap-3 border-t border-[var(--color-divider)] pt-6 lg:flex-col lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <Button
                disabled={editing}
                leadingIcon={<PencilSimple aria-hidden size={17} weight="bold" />}
                onClick={startEditing}
                size="sm"
              >
                회원정보 수정
              </Button>
              {/* 백엔드에 비밀번호 재설정 계약이 없어 무동작 버튼 대신 지원 상태를 명확히 표시한다. */}
              <Button
                disabled
                leadingIcon={<Key aria-hidden size={17} weight="bold" />}
                size="sm"
                title="비밀번호 변경 API가 제공되면 사용할 수 있습니다."
                variant="secondary"
              >
                비밀번호 변경 준비 중
              </Button>
            </div>
          </CardContent>
        ) : (
          <CardContent className="grid min-h-40 place-items-center text-sm text-[var(--color-text-secondary)]">
            회원정보를 확인할 수 없습니다.
          </CardContent>
        )}
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

      <div className="border-t border-[var(--color-divider)] pt-6">
        <WithdrawAccountSection description="탈퇴하면 진행한 팬미팅 기록과 팬 메모를 다시 볼 수 없습니다." />
      </div>
    </div>
  )
}

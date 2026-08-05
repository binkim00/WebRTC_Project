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
import { PREFERRED_LANGUAGE_OPTIONS, preferredLanguageLabel } from '../../api/auth'
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
import { useTranslation, type TranslationKey } from '../../i18n'


/**
 * 마이페이지 활동 바로가기다.
 *
 * 문장 대신 **사전 키**를 들고 있다. 이 배열은 모듈 로드 시 한 번만 만들어지므로 여기서 번역하면
 * 처음 언어로 굳는다. 렌더 시점에 `t(item.titleKey)`로 옮긴다.
 */
const activityItems = [
  {
    titleKey: 'fanProfilePage.activity.applications',
    descriptionKey: 'fanProfilePage.activity.applicationsDesc',
    to: '/fan/mypage/applications',
    icon: Ticket,
  },
  {
    titleKey: 'fanProfilePage.activity.fanMeetings',
    descriptionKey: 'fanProfilePage.activity.fanMeetingsDesc',
    to: '/fan/mypage/fan-meetings?status=upcoming',
    icon: VideoCamera,
  },
] as const satisfies readonly {
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  to: string
  icon: unknown
}[]

export function FanProfilePage() {
  const { t } = useTranslation()
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
      setLoadError(t('fanProfilePage.t22'))
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
            : t('fanProfilePage.t23'),
        )
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setSaveError(t('fanProfilePage.t24'))
      return
    }

    const formData = new FormData(event.currentTarget)
    const nickname = String(formData.get('nickname') ?? '').trim()
    const preferredLanguage = String(formData.get('preferredLanguage') ?? 'KOREAN')

    if (!nickname) {
      setSaveError(t('fanProfilePage.t25'))
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
      setSaveNotice(t('fanProfilePage.t26'))
    } catch (reason) {
      setSaveError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : t('fanProfilePage.t27'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const isLoading = profile === undefined && !loadError

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-7">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.045em]">{t('fanProfilePage.t1')}</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          {t('fanProfilePage.t2')}
        </p>
      </header>

      {loadError ? (
        <AlertBanner title={t('fanProfilePage.t3')} variant="error">
          {loadError}
        </AlertBanner>
      ) : null}
      {/* 회원정보 수정과 이메일 인증 완료가 같은 배너를 쓰므로 제목은 중립적으로 둔다. */}
      {saveNotice ? (
        <AlertBanner title={t('fanProfilePage.t4')} variant="success">
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
                setSaveNotice(t('fanProfilePage.t28'))
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('fanProfilePage.t5')} />
        </div>
      ) : profile ? (
        <Card>
          <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              {/* 등록된 프로필 이미지가 없으면 닉네임 기반 아바타를 표시한다 */}
              {profile.profileImageUrl ? (
                <img
                  alt={t('fanProfilePage.t29', { p0: profile.nickname })}
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
                  {t('fanProfilePage.t6')}
                </p>

                {isEditing ? (
                  <form className="mt-3 grid max-w-md gap-4" onSubmit={(event) => void handleSave(event)}>
                    <TextField
                      defaultValue={profile.nickname}
                      label={t('fanProfilePage.t7')}
                      name="nickname"
                      required
                    />
                    <Select
                      defaultValue={profile.preferredLanguage}
                      label={t('fanProfilePage.t8')}
                      name="preferredLanguage"
                      options={PREFERRED_LANGUAGE_OPTIONS}
                    />
                    {saveError ? (
                      <AlertBanner title={t('fanProfilePage.t9')} variant="error">
                        {saveError}
                      </AlertBanner>
                    ) : null}
                    <div className="flex gap-3">
                      <Button loading={isSaving} size="sm" type="submit">
                        {t('fanProfilePage.t10')}
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
                        {t('fanProfilePage.t11')}
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
                          {t('fanProfilePage.t12')}
                        </dt>
                        <dd className="font-bold">{profile.loginId}</dd>
                      </div>
                      <div className="flex min-w-0 gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          {t('fanProfilePage.t13')}
                        </dt>
                        <dd className="truncate font-bold">{profile.email}</dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          {t('fanProfilePage.t14')}
                        </dt>
                        <dd className="font-bold">
                          {preferredLanguageLabel(profile.preferredLanguage)}
                        </dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="font-semibold text-[var(--color-text-tertiary)]">
                          {t('fanProfilePage.t15')}
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
                  {t('fanProfilePage.t16')}
                </Button>
                {/* TODO: 비밀번호 변경 API가 아직 백엔드에 없어 비활성화 상태로 둡니다. */}
                <Button
                  disabled
                  leadingIcon={<Key aria-hidden size={17} weight="bold" />}
                  size="sm"
                  title={t('fanProfilePage.t17')}
                  variant="secondary"
                >
                  {t('fanProfilePage.t18')}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <h2 className="text-2xl font-black tracking-[-0.035em]">{t('fanProfilePage.t19')}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {t('fanProfilePage.t20')}
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
                    <strong className="block text-lg">{t(item.titleKey)}</strong>
                    <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">
                      {t(item.descriptionKey)}
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

      <WithdrawAccountSection description={t('fanProfilePage.t21')} />
    </div>
  )
}

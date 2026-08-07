import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  getAuthSession,
  replaceAuthSession,
  type LoginRole,
} from '../../api/authSession'
import { PREFERRED_LANGUAGE_OPTIONS, preferredLanguageLabel } from '../../api/auth'
import { getMyProfile, updateMyProfile, type UserProfile } from '../../api/users'
import {
  AlertBanner,
  Button,
  Dialog,
  Select,
  SocialAccountsSection,
  Spinner,
  TextField,
  WithdrawAccountSection,
} from '../../components'
import { translate, useTranslation } from '../../i18n'

type MenuItem = {
  title: string
  description: string
  action?: string
  to: string
}

type RoleContent = {
  pageDescription: string
  profileLabel: string
  menuTitle: string
  menuDescription?: string
  menus: readonly MenuItem[]
  withdrawDescription: string
}

/** 역할별 정적 문구·메뉴다. dc.html의 ROLES 객체와 값이 같다. */
function roleContentOf(role: LoginRole): RoleContent {
  if (role === 'FAN') {
    return {
      pageDescription: translate('myPage.t26'),
      profileLabel: translate('myPage.t27'),
      menuTitle: translate('myPage.t28'),
      menuDescription: translate('myPage.t29'),
      menus: [
        {
          title: translate('myPage.t30'),
          description: translate('myPage.t31'),
          to: '/fan/mypage/applications',
        },
        {
          title: translate('myPage.t32'),
          description: translate('myPage.t33'),
          // 이 목록 화면은 status 쿼리(upcoming/completed)가 없으면 목록 대신 오류 화면을 보여준다.
          to: '/fan/mypage/fan-meetings?status=upcoming',
        },
        {
          title: translate('myPage.t64'),
          description: translate('myPage.t65'),
          // 팔로잉은 인플루언서 탐색 화면의 탭이므로 tab 쿼리로 바로 그 탭을 연다.
          to: '/fan/influencers?tab=following',
        },
      ],
      withdrawDescription: translate('myPage.t34'),
    }
  }

  if (role === 'SOLO_INFLUENCER') {
    return {
      pageDescription: translate('myPage.t35'),
      profileLabel: translate('myPage.t36'),
      menuTitle: translate('myPage.t37'),
      menuDescription: translate('myPage.t38'),
      menus: [
        {
          // nav의 "내 팬미팅"(지금 진행할 것, /influencer/fan-meetings)과 같은 이름·다른 목적지로
          // 겹치지 않도록 "이력"을 붙이고, 실제로도 지난 기록을 보여주는 공용 이력 화면으로 보낸다.
          title: translate('myPage.t39'),
          description: translate('myPage.t40'),
          action: translate('myPage.t41'),
          to: '/influencer/mypage/fan-meetings',
        },
        {
          title: translate('myPage.t42'),
          description: translate('myPage.t43'),
          action: translate('myPage.t44'),
          to: '/influencer/fans',
        },
      ],
      withdrawDescription: translate('myPage.t45'),
    }
  }

  if (role === 'MANAGER') {
    return {
      pageDescription: translate('myPage.t46'),
      profileLabel: translate('myPage.t47'),
      menuTitle: translate('myPage.t48'),
      menus: [
        {
          title: translate('myPage.t49'),
          description: translate('myPage.t50'),
          action: translate('myPage.t51'),
          to: '/manager/fan-meetings',
        },
      ],
      withdrawDescription: translate('myPage.t52'),
    }
  }

  // INFLUENCER (소속)
  return {
    pageDescription: translate('myPage.t53'),
    profileLabel: translate('myPage.t54'),
    menuTitle: translate('myPage.t55'),
    menus: [
      {
        title: translate('myPage.t56'),
        description: translate('myPage.t57'),
        action: translate('myPage.t58'),
        to: '/influencer/mypage/fan-meetings',
      },
      {
        title: translate('myPage.t59'),
        description: translate('myPage.t60'),
        action: translate('myPage.t61'),
        to: '/influencer/fans',
      },
    ],
    withdrawDescription: translate('myPage.t62'),
  }
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof TypeError
    ? reason.message
    : fallback
}

/**
 * 4역할(팬·인플루언서·1인 인플루언서·매니저) 공용 마이페이지다.
 *
 * dc.html의 `Mypage`가 role prop 하나로 4역할을 분기하는 구조를 그대로 따라, 화면도
 * 역할별로 새로 만들지 않고 이 컴포넌트 하나가 로그인 세션의 role을 읽어 분기한다.
 */
export function MyPage() {
  const { t } = useTranslation()
  // 소셜 연결 후 돌아올 경로로 쓴다. 역할마다 마이페이지 경로가 달라 현재 경로를 그대로 넘긴다.
  const location = useLocation()
  const authSession = getAuthSession()
  const authToken = authSession?.accessToken
  const role = authSession?.role ?? 'FAN'
  const content = roleContentOf(role)

  const [profile, setProfile] = useState<UserProfile>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()

  const [editOpen, setEditOpen] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [languageInput, setLanguageInput] = useState('KOREAN')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveDone, setSaveDone] = useState(false)

  useEffect(() => {
    if (!authToken) {
      setLoadError(t('myPage.t22'))
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
        if (!controller.signal.aborted) {
          setLoadError(errorMessage(reason, t('myPage.t23')))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  function openEdit() {
    if (!profile) return
    setNicknameInput(profile.nickname)
    setLanguageInput(profile.preferredLanguage)
    setSaveError(undefined)
    setEditOpen(true)
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken || saving) return

    const nickname = nicknameInput.trim()
    if (!nickname) {
      setSaveError(t('myPage.t24'))
      return
    }

    setSaving(true)
    setSaveError(undefined)

    void updateMyProfile({ nickname, preferredLanguage: languageInput }, authToken)
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
        // 전역 헤더가 세션에 저장된 닉네임을 바로 쓰므로, 여기서도 갱신해 둬야
        // 새로고침 없이 곧바로 바뀐 닉네임이 보인다.
        if (authSession) replaceAuthSession({ ...authSession, nickname: updated.nickname })
        setEditOpen(false)
        setSaveDone(true)
      })
      .catch((reason: unknown) => {
        setSaveError(errorMessage(reason, t('myPage.t25')))
      })
      .finally(() => setSaving(false))
  }

  const hasPhoto = Boolean(profile?.profileImageUrl)

  return (
    <div>
      <h1 className="text-[25px] font-black tracking-[-0.035em]">{t('myPage.t1')}</h1>
      <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-muted)]">
        {content.pageDescription}
      </p>

      {loadError ? (
        <AlertBanner className="mt-6" title={t('myPage.t2')} variant="error">
          {loadError}
        </AlertBanner>
      ) : null}
      {saveDone ? (
        <AlertBanner className="mt-6" title={t('myPage.t3')} variant="success">
          {t('myPage.t4')}
        </AlertBanner>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('myPage.t5')} />
        </div>
      ) : profile ? (
        <>
          <section
            aria-labelledby="mp-profile"
            className="mt-[26px] border-t border-[var(--color-divider)] pt-[26px]"
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-6 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
              {hasPhoto ? (
                <img
                  alt={t('myPage.t63', { p0: profile.nickname })}
                  className="size-[104px] rounded-[10px] bg-[var(--color-surface-muted)] object-cover"
                  src={profile.profileImageUrl ?? undefined}
                />
              ) : (
                <div
                  aria-label={t('myPage.t6')}
                  className="grid size-[104px] place-items-center rounded-[10px] bg-[var(--color-surface-page)]"
                  role="img"
                >
                  <span className="text-[13px] font-semibold text-[var(--color-text-muted)]">
                    {t('myPage.t7')}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[var(--color-text-muted)]">
                  {content.profileLabel}
                </p>
                <h2
                  className="mt-[7px] text-[26px] font-black tracking-[-0.038em]"
                  id="mp-profile"
                >
                  {profile.nickname}
                </h2>
                <dl className="mt-3.5 flex flex-wrap gap-x-7 gap-y-2">
                  <div className="flex items-baseline gap-2.5">
                    <dt className="text-[15px] font-semibold text-[var(--color-text-muted)]">
                      {t('myPage.t8')}
                    </dt>
                    <dd className="text-[15px] font-bold">{profile.loginId}</dd>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <dt className="text-[15px] font-semibold text-[var(--color-text-muted)]">
                      {t('myPage.t9')}
                    </dt>
                    <dd className="text-[15px] font-bold [overflow-wrap:anywhere]">
                      {profile.email}
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-2.5">
                    <dt className="text-[15px] font-semibold text-[var(--color-text-muted)]">
                      {t('myPage.t10')}
                    </dt>
                    <dd className="text-[15px] font-bold">
                      {preferredLanguageLabel(profile.preferredLanguage)}
                    </dd>
                  </div>
                  {/* 회원번호는 운영·소속 확인에 쓰는 인플루언서·매니저에게만 보여 준다. 팬에게는 불필요한 값이라 숨긴다. */}
                  {role !== 'FAN' ? (
                    <div className="flex items-baseline gap-2.5">
                      <dt className="text-[15px] font-semibold text-[var(--color-text-muted)]">
                        {t('myPage.t11')}
                      </dt>
                      <dd className="text-[15px] font-bold tabular-nums">{profile.userId}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="flex flex-col gap-2.5 max-lg:col-span-2 lg:self-center lg:border-l lg:border-[var(--color-divider)] lg:pl-8">
                <Button className="min-h-[50px] text-base" onClick={openEdit}>
                  {t('myPage.t12')}
                </Button>
                <Button
                  className="min-h-[50px] text-base"
                  disabled
                  title={t('myPage.t13')}
                  variant="secondary"
                >
                  {t('myPage.t14')}
                </Button>
              </div>
            </div>
          </section>

          <section
            aria-label={content.menuTitle}
            className="mt-[34px] border-t border-[var(--color-divider)] pt-[26px]"
          >
            {content.menuDescription ? (
              <div>
                <h2 className="text-lg font-extrabold tracking-[-0.028em]">
                  {content.menuTitle}
                </h2>
                <p className="mt-1.5 text-[15px] font-medium text-[var(--color-text-muted)]">
                  {content.menuDescription}
                </p>
              </div>
            ) : null}

            <div className={`grid gap-2 ${content.menuDescription ? 'mt-4' : 'mt-0'}`}>
              {content.menus.map((menu) => (
                <Link
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-[10px] border border-[var(--color-divider)] p-[18px] hover:border-[var(--color-primary-coral)]"
                  key={menu.title}
                  to={menu.to}
                >
                  <span className="min-w-0">
                    <strong className="block text-[17px] font-extrabold tracking-[-0.025em]">
                      {menu.title}
                    </strong>
                    <small className="mt-[5px] block text-[15px] font-medium leading-[1.55] text-[var(--color-text-muted)]">
                      {menu.description}
                    </small>
                  </span>
                  {menu.action ? (
                    <span className="whitespace-nowrap text-[15px] font-bold text-[var(--color-primary-coral)]">
                      {menu.action}
                    </span>
                  ) : (
                    <span aria-hidden="true" className="text-[17px] font-bold text-[var(--color-text-muted)]">
                      →
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>

          {/*
            소셜 계정 연결 관리. 연결 흐름은 공급자 왕복이 필요하므로 돌아올 경로를 넘긴다.
            (콜백 화면이 이 값으로 '로그인 흐름'과 '연결 흐름'을 구분한다)
          */}
          <div className="mt-10 border-t border-[var(--color-divider)] pt-[22px]">
            <SocialAccountsSection returnTo={location.pathname} />
          </div>

          <div className="mt-10 border-t border-[var(--color-divider)] pt-[22px]">
            <WithdrawAccountSection description={content.withdrawDescription} />
          </div>
        </>
      ) : null}

      <Dialog
        description={t('myPage.t15')}
        footer={
          <>
            <Button disabled={saving} onClick={() => setEditOpen(false)} variant="secondary">
              {t('myPage.t16')}
            </Button>
            <Button form="mypage-edit-form" loading={saving} type="submit">
              {t('myPage.t17')}
            </Button>
          </>
        }
        onOpenChange={setEditOpen}
        open={editOpen}
        title={t('myPage.t18')}
      >
        <form className="grid gap-4" id="mypage-edit-form" onSubmit={handleSave}>
          <TextField
            label={t('myPage.t19')}
            maxLength={30}
            onChange={(event) => setNicknameInput(event.currentTarget.value)}
            required
            value={nicknameInput}
          />
          <Select
            label={t('myPage.t20')}
            onChange={(event) => setLanguageInput(event.currentTarget.value)}
            options={PREFERRED_LANGUAGE_OPTIONS}
            value={languageInput}
          />
          {saveError ? (
            <AlertBanner title={t('myPage.t21')} variant="error">
              {saveError}
            </AlertBanner>
          ) : null}
        </form>
      </Dialog>
    </div>
  )
}

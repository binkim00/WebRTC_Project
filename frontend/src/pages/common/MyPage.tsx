import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  getAuthSession,
  replaceAuthSession,
  type LoginRole,
} from '../../api/authSession'
import { getMyProfile, updateMyProfile, type UserProfile } from '../../api/users'
import {
  AlertBanner,
  Button,
  Dialog,
  Select,
  Spinner,
  TextField,
  WithdrawAccountSection,
} from '../../components'

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

/** 백엔드 PreferredLanguage enum과 같은 값만 쓴다. */
const languageOptions = [
  { label: '한국어', value: 'KOREAN' },
  { label: 'English', value: 'ENGLISH' },
] as const

/** 역할별 정적 문구·메뉴다. dc.html의 ROLES 객체와 값이 같다. */
function roleContentOf(role: LoginRole): RoleContent {
  if (role === 'FAN') {
    return {
      pageDescription: '내 정보와 참여 내역을 관리하세요.',
      profileLabel: '프로필',
      menuTitle: '내 활동',
      menuDescription: '참여한 이벤트와 팬미팅을 확인할 수 있어요.',
      menus: [
        {
          title: '응모한 이벤트',
          description: '내가 응모한 이벤트를 확인해 보세요.',
          to: '/fan/mypage/applications',
        },
        {
          title: '팬미팅',
          description: '신청한 팬미팅 목록으로 이동합니다.',
          // 이 목록 화면은 status 쿼리(upcoming/completed)가 없으면 목록 대신 오류 화면을 보여준다.
          to: '/fan/mypage/fan-meetings?status=upcoming',
        },
      ],
      withdrawDescription: '탈퇴하면 응모 내역과 참여 기록을 다시 볼 수 없습니다.',
    }
  }

  if (role === 'SOLO_INFLUENCER') {
    return {
      pageDescription: '개인정보를 확인하고 팬미팅과 팬 기록을 관리하세요.',
      profileLabel: '1인 인플루언서',
      menuTitle: '내 활동',
      menuDescription: '만든 팬미팅과 만난 팬을 확인할 수 있어요.',
      menus: [
        {
          // nav의 "내 팬미팅"(지금 진행할 것, /influencer/fan-meetings)과 같은 이름·다른 목적지로
          // 겹치지 않도록 "이력"을 붙이고, 실제로도 지난 기록을 보여주는 공용 이력 화면으로 보낸다.
          title: '내 팬미팅 이력',
          description: '만들기부터 진행까지 모든 팬미팅을 확인하세요.',
          action: '이력 확인',
          to: '/influencer/mypage/fan-meetings',
        },
        {
          title: '내 팬',
          description: '지금까지 만난 팬과 팬미팅별 메모를 확인하세요.',
          action: '이동',
          to: '/influencer/fans',
        },
      ],
      withdrawDescription: '탈퇴하면 진행한 팬미팅 기록과 팬 메모를 다시 볼 수 없습니다.',
    }
  }

  if (role === 'MANAGER') {
    return {
      pageDescription: '개인정보를 확인하고 팬미팅 관리 이력으로 이동하세요.',
      profileLabel: '매니저',
      menuTitle: '관리 이력',
      menus: [
        {
          title: '팬미팅 관리 이력',
          description: '담당하거나 관리했던 1:1 영상통화 팬미팅 목록을 확인하세요.',
          action: '이력 확인',
          to: '/manager/fan-meetings',
        },
      ],
      withdrawDescription: '탈퇴하면 조직 정보와 팬미팅 관리 기록을 다시 볼 수 없습니다.',
    }
  }

  // INFLUENCER (소속)
  return {
    pageDescription: '개인정보를 확인하고 팬미팅 이력을 관리하세요.',
    profileLabel: '인플루언서 프로필',
    menuTitle: '팬미팅 이력',
    menus: [
      {
        title: '내 팬미팅 이력',
        description: '진행한 팬미팅과 상태를 확인하세요.',
        action: '이력 확인',
        to: '/influencer/mypage/fan-meetings',
      },
      {
        title: '내 팬',
        description: '지금까지 만난 팬과 팬미팅별 메모를 확인하세요.',
        action: '이동',
        to: '/influencer/fans',
      },
    ],
    withdrawDescription: '탈퇴하면 진행한 팬미팅 기록과 팬 메모를 다시 볼 수 없습니다.',
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
      setLoadError('회원정보를 확인하려면 먼저 로그인해 주세요.')
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
          setLoadError(errorMessage(reason, '회원정보를 불러오지 못했습니다.'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
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
      setSaveError('닉네임을 입력해 주세요.')
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
        setSaveError(errorMessage(reason, '회원정보 수정에 실패했습니다.'))
      })
      .finally(() => setSaving(false))
  }

  const hasPhoto = Boolean(profile?.profileImageUrl)

  return (
    <div>
      <h1 className="text-[25px] font-black tracking-[-0.035em]">마이페이지</h1>
      <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-muted)]">
        {content.pageDescription}
      </p>

      {loadError ? (
        <AlertBanner className="mt-6" title="회원정보를 확인할 수 없습니다" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}
      {saveDone ? (
        <AlertBanner className="mt-6" title="회원정보가 수정되었습니다" variant="success">
          변경한 닉네임과 선호 언어가 저장되었습니다.
        </AlertBanner>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="회원정보를 불러오는 중" />
        </div>
      ) : profile ? (
        <>
          <section
            aria-labelledby="mp-profile"
            className="mt-[26px] border-t border-[var(--color-divider)] pt-[26px]"
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-6">
              {hasPhoto ? (
                <img
                  alt={`${profile.nickname}님의 프로필`}
                  className="size-[104px] rounded-[10px] bg-[var(--color-surface-muted)] object-cover"
                  src={profile.profileImageUrl ?? undefined}
                />
              ) : (
                <div
                  aria-label="프로필 사진이 없습니다"
                  className="grid size-[104px] place-items-center rounded-[10px] bg-[var(--color-surface-page)]"
                  role="img"
                >
                  <span className="text-[13px] font-semibold text-[var(--color-text-muted)]">
                    사진 없음
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
                <dl className="mt-3.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2">
                  <dt className="text-[15px] font-semibold text-[var(--color-text-muted)]">
                    이름
                  </dt>
                  <dd className="text-[15px] font-bold">{profile.nickname}</dd>
                  <dt className="text-[15px] font-semibold text-[var(--color-text-muted)]">
                    이메일
                  </dt>
                  <dd className="text-[15px] font-bold [overflow-wrap:anywhere]">
                    {profile.email}
                  </dd>
                </dl>
              </div>
            </div>

            <div className="mt-[22px] flex flex-col gap-2.5 sm:flex-row">
              <Button className="min-h-[50px] text-base" onClick={openEdit}>
                회원정보 수정
              </Button>
              <Button
                className="min-h-[50px] text-base"
                disabled
                title="비밀번호 변경 기능은 아직 지원되지 않습니다."
                variant="secondary"
              >
                비밀번호 변경
              </Button>
            </div>
            <p className="mt-2 text-sm font-medium text-[var(--color-text-muted)]">
              비밀번호 변경 기능은 아직 지원되지 않습니다.
            </p>
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

          <div className="mt-10 border-t border-[var(--color-divider)] pt-[22px]">
            <WithdrawAccountSection description={content.withdrawDescription} />
          </div>
        </>
      ) : null}

      <Dialog
        description="닉네임과 선호 언어를 변경할 수 있습니다."
        footer={
          <>
            <Button disabled={saving} onClick={() => setEditOpen(false)} variant="secondary">
              취소
            </Button>
            <Button form="mypage-edit-form" loading={saving} type="submit">
              저장
            </Button>
          </>
        }
        onOpenChange={setEditOpen}
        open={editOpen}
        title="회원정보 수정"
      >
        <form className="grid gap-4" id="mypage-edit-form" onSubmit={handleSave}>
          <TextField
            label="닉네임"
            maxLength={30}
            onChange={(event) => setNicknameInput(event.currentTarget.value)}
            required
            value={nicknameInput}
          />
          <Select
            label="선호 언어"
            onChange={(event) => setLanguageInput(event.currentTarget.value)}
            options={languageOptions}
            value={languageInput}
          />
          {saveError ? (
            <AlertBanner title="수정 실패" variant="error">
              {saveError}
            </AlertBanner>
          ) : null}
        </form>
      </Dialog>
    </div>
  )
}

import {
  ArrowRight,
  Key,
  PencilSimple,
  Ticket,
  VideoCamera,
} from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  Dialog,
  Select,
  TextField,
} from '../../components'
import { ApiError } from '../../api/ApiError'
import {
  getAuthSession,
  replaceAuthSession,
} from '../../api/authSession'
import {
  getMyProfile,
  updateMyProfile,
  type UserProfile,
} from '../../api/users'
import profileImage from '../../assets/call-preview-remote.jpg'

/*
 * TODO: 비밀번호 변경과 회원탈퇴 API가 확정되면 각 버튼의 처리 흐름을 연결한다.
 */

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
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('KOREAN')
  const [submitting, setSubmitting] = useState(false)
  const [editError, setEditError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    const session = getAuthSession()

    if (!session) {
      setLoadError('로그인 후 프로필을 확인할 수 있습니다.')
      setLoading(false)
      return
    }

    const controller = new AbortController()

    getMyProfile(session.accessToken, controller.signal)
      .then((nextProfile) => {
        setProfile(nextProfile)
        setNickname(nextProfile.nickname)
        setPreferredLanguage(nextProfile.preferredLanguage)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return

        setLoadError(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : '프로필 정보를 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  function handleEditOpen() {
    if (!profile) return

    setNickname(profile.nickname)
    setPreferredLanguage(profile.preferredLanguage)
    setEditError('')
    setEditOpen(true)
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) {
      setEditError('닉네임을 입력해 주세요.')
      return
    }

    const session = getAuthSession()
    if (!session) {
      setEditError('로그인 정보가 없습니다. 다시 로그인해 주세요.')
      return
    }

    setSubmitting(true)
    setEditError('')

    try {
      const updated = await updateMyProfile(
        {
          nickname: trimmedNickname,
          preferredLanguage,
        },
        session.accessToken,
      )

      setProfile((current) =>
        current
          ? {
              ...current,
              email: updated.email,
              nickname: updated.nickname,
              profileImageUrl: updated.profileImageUrl,
              preferredLanguage: updated.preferredLanguage,
            }
          : current,
      )
      replaceAuthSession({ ...session, nickname: updated.nickname })
      setSuccessMessage('회원정보가 수정되었습니다.')
      setEditOpen(false)
    } catch (error: unknown) {
      setEditError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : '회원정보를 수정하지 못했습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-7">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.045em]">내 마이페이지</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          개인정보를 확인하고 참여 내역을 관리하세요.
        </p>
      </header>

      {successMessage ? (
        <AlertBanner
          onDismiss={() => setSuccessMessage('')}
          title="수정 완료"
          variant="success"
        >
          {successMessage}
        </AlertBanner>
      ) : null}

      {loading ? <Card className="p-8">프로필 정보를 불러오는 중입니다.</Card> : null}

      {!loading && loadError ? (
        <AlertBanner title="프로필 조회 실패" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}

      {!loading && profile ? (
        <Card>
          <CardContent className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-center">
              <img
                alt={`${profile.nickname} 프로필`}
                className="size-32 shrink-0 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] object-cover p-1"
                src={profile.profileImageUrl || profileImage}
              />

              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-primary-coral)]">
                  팬 프로필
                </p>
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
                </dl>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-[var(--color-divider)] pt-6 lg:flex-col lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <Button
                leadingIcon={<PencilSimple aria-hidden size={17} weight="bold" />}
                onClick={handleEditOpen}
                size="sm"
              >
                회원정보 수정
              </Button>
              {/* TODO: 비밀번호 변경 API 연결 */}
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

      <div className="flex justify-end">
        {/* TODO: 회원탈퇴 확인 Dialog 연결 */}
        <button
          className="text-sm text-[var(--color-text-secondary)] underline underline-offset-4 hover:text-[var(--color-error)]"
          type="button"
        >
          회원탈퇴
        </button>
      </div>

      <Dialog
        description="닉네임과 선호 언어를 변경할 수 있습니다."
        footer={
          <>
            <Button
              disabled={submitting}
              onClick={() => setEditOpen(false)}
              variant="secondary"
            >
              취소
            </Button>
            <Button
              form="fan-profile-edit-form"
              loading={submitting}
              type="submit"
            >
              저장
            </Button>
          </>
        }
        onOpenChange={setEditOpen}
        open={editOpen}
        title="회원정보 수정"
      >
        <form
          className="grid gap-5"
          id="fan-profile-edit-form"
          onSubmit={handleProfileSubmit}
        >
          <TextField
            label="닉네임"
            maxLength={30}
            onChange={(event) => setNickname(event.currentTarget.value)}
            required
            value={nickname}
          />
          <Select
            label="선호 언어"
            onChange={(event) => setPreferredLanguage(event.currentTarget.value)}
            options={[
              { value: 'KOREAN', label: '한국어' },
              { value: 'ENGLISH', label: '영어' },
            ]}
            value={preferredLanguage}
          />
          {editError ? (
            <AlertBanner title="수정 실패" variant="error">
              {editError}
            </AlertBanner>
          ) : null}
        </form>
      </Dialog>
    </div>
  )
}

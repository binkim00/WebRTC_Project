import { useState } from 'react'
import { ApiError } from '../../api/ApiError'
import { clearAuthSession, getAuthSession } from '../../api/authSession'
import { withdrawMyAccount } from '../../api/users'
import { Button } from '../ui/Button'
import { TextField } from '../ui/FormControls'
import { AlertBanner } from '../feedback/AlertBanner'
import { Dialog } from '../feedback/Dialog'
import { useTranslation } from '../../i18n'

/**
 * 회원탈퇴 진입점과 비밀번호 확인 대화상자를 함께 제공한다.
 *
 * 팬·인플루언서 마이페이지가 같은 흐름을 쓰므로 한 곳에 두고 재사용한다.
 * 백엔드가 탈퇴와 함께 액세스 토큰을 무효화하므로 성공 후에는 세션을 지우고 로그인 화면으로 보낸다.
 */
export function WithdrawAccountSection({
  description = '탈퇴하면 응모 내역과 참여 기록을 다시 볼 수 없습니다.',
}: {
  description?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  /** 대화상자를 닫고 입력값을 비운다. 처리 중에는 닫히지 않게 막는다. */
  function closeDialog() {
    if (submitting) return
    setOpen(false)
    setPassword('')
    setError(undefined)
  }

  /** 비밀번호로 본인 확인 후 탈퇴를 요청한다. 성공하면 세션을 지우고 로그인 화면으로 보낸다. */
  async function submit() {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('로그인이 만료되었습니다. 다시 로그인해 주세요.')
      return
    }
    if (!password) {
      setError('비밀번호를 입력해 주세요.')
      return
    }

    setSubmitting(true)
    setError(undefined)
    try {
      await withdrawMyAccount(password, token)
      clearAuthSession()
      // 로그인 라우트는 AuthLayout 아래에 있지만 경로는 최상위 '/login'이다. '/auth/login'은 404다.
      // 탈퇴한 계정으로는 어떤 화면도 조회할 수 없어 라우터 전환 대신 전체 새로고침으로 상태를 비운다.
      window.location.replace('/login')
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(
          cause.status === 401
            ? '비밀번호가 올바르지 않습니다.'
            : cause.status === 409
              ? '진행 중인 팬미팅이 있어 지금은 탈퇴할 수 없습니다.'
              : cause.message,
        )
      } else {
        setError('회원탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          className="text-sm text-[var(--color-text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--color-error)]"
          onClick={() => setOpen(true)}
          type="button"
        >
          {t('withdrawAccountSection.t1')}
        </button>
      </div>

      <Dialog
        description={description}
        footer={
          <div className="flex justify-end gap-3">
            <Button disabled={submitting} onClick={closeDialog} variant="secondary">
              {t('withdrawAccountSection.t2')}
            </Button>
            <Button
              disabled={!password || submitting}
              loading={submitting}
              onClick={() => void submit()}
            >
              {t('withdrawAccountSection.t3')}
            </Button>
          </div>
        }
        onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}
        open={open}
        title={t('withdrawAccountSection.t4')}
      >
        <div className="grid gap-4">
          <TextField
            autoComplete="current-password"
            label={t('withdrawAccountSection.t5')}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
          {error ? (
            <AlertBanner title={t('withdrawAccountSection.t6')} variant="error">
              {error}
            </AlertBanner>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}

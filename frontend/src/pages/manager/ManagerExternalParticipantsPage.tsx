import { useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  confirmExternalParticipantsCsv,
  downloadExternalParticipantCsvTemplate,
  previewExternalParticipantsCsv,
  type ExternalParticipantPreviewResponse,
} from '../../api/externalParticipants'
import { AlertBanner, Button, Dialog } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof ApiError || reason instanceof TypeError ? reason.message : fallback
}

/**
 * CSV로 직접 등록(EXTERNAL_SELECTION)하는 팬미팅의 참가자 명단을 올리는 화면이다.
 *
 * 백엔드는 팬미팅이 PUBLISHED 상태이고 아직 명단을 확정하지 않았을 때만 업로드를 허용한다.
 * 생성 마법사가 발행 직후 이 화면으로 보내며, 확정하면 참가자·대기열이 만들어지고
 * 팬미팅 상태가 READY로 바뀐다 — 한 번 확정하면 같은 팬미팅에는 다시 올릴 수 없다.
 */
export function ManagerExternalParticipantsPage() {
  const fanMeetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const navigate = useNavigate()

  const [file, setFile] = useState<File>()
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<ExternalParticipantPreviewResponse>()
  const [previewError, setPreviewError] = useState<string>()
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string>()
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string>()

  if (!fanMeetingId.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 fanMeetingId 값이 없습니다. 팬미팅 관리 목록에서 다시 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  async function handleDownloadTemplate() {
    const token = getAuthSession()?.accessToken
    if (!token || downloadingTemplate) return

    setDownloadingTemplate(true)
    setTemplateError(undefined)
    try {
      const { blob, fileName } = await downloadExternalParticipantCsvTemplate(token)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch (reason) {
      setTemplateError(errorMessage(reason, '명단 양식을 내려받지 못했습니다.'))
    } finally {
      setDownloadingTemplate(false)
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    // 같은 파일을 다시 선택해도 change 이벤트가 발생하도록 입력값을 비운다.
    event.target.value = ''
    if (!selected) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setPreviewError('명단을 업로드하려면 먼저 로그인해 주세요.')
      return
    }

    setFile(selected)
    setPreview(undefined)
    setConfirmError(undefined)
    setPreviewError(undefined)
    setPreviewing(true)
    try {
      setPreview(await previewExternalParticipantsCsv(fanMeetingId, selected, token))
    } catch (reason) {
      setPreviewError(errorMessage(reason, '명단 파일을 확인하지 못했습니다.'))
      setFile(undefined)
    } finally {
      setPreviewing(false)
    }
  }

  function handleReset() {
    setFile(undefined)
    setPreview(undefined)
    setPreviewError(undefined)
    setConfirmError(undefined)
  }

  async function handleConfirm() {
    const token = getAuthSession()?.accessToken
    if (!token || !file || !preview?.confirmable || confirming) return

    setConfirming(true)
    setConfirmError(undefined)
    try {
      await confirmExternalParticipantsCsv(fanMeetingId, file, token)
      setConfirmDialogOpen(false)
      navigate(`/manager/fan-meetings/${fanMeetingId}`)
    } catch (reason) {
      const message = errorMessage(reason, '참가자 명단을 확정하지 못했습니다.')
      // 백엔드 전역 핸들러가 모든 DB 제약 위반을 회원가입용 문구로 돌려줘 이 화면과 문맥이
      // 어긋난다. 명단 확정에서는 실제로는 참가자 저장이 실패한 것이므로 상황을 설명해 준다.
      setConfirmError(
        message === 'Login ID or email is already in use.'
          ? `참가자 정보를 저장하는 중 서버 데이터 제약과 충돌했습니다. 같은 명단을 이미 확정했거나 서버 스키마 문제일 수 있습니다. (서버 응답: ${message})`
          : message,
      )
      // 오류가 모달 뒤에 가려지지 않도록 확인 창을 닫고 화면의 오류 배너로 보여 준다.
      setConfirmDialogOpen(false)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="grid gap-6 pb-10">
      <header>
        <Link
          className="inline-flex w-fit text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          to={`/manager/fan-meetings/${fanMeetingId}`}
        >
          ← 팬미팅 상세로
        </Link>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.05em]">참가자 명단 등록</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          CSV로 준비한 명단을 올려 참가자와 대기 순번을 확정하세요. 확정하면 되돌릴 수 없습니다.
        </p>
      </header>

      {!preview ? (
        <div className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-divider)] p-6">
          <div>
            <h2 className="text-lg font-extrabold">CSV 양식</h2>
            <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
              첫 줄은 머리글이고 <strong>이메일</strong>과 <strong>대기 순번</strong> 두 열이
              필요합니다. 대기 순번이 통화 순서가 됩니다.
            </p>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-divider)]">
            <div className="grid grid-cols-2 border-b border-[var(--color-divider)] bg-[var(--color-surface-page)] px-4 py-2.5 text-sm font-bold">
              <span>이메일</span>
              <span>대기 순번</span>
            </div>
            <div className="grid grid-cols-2 border-b border-[var(--color-border-row)] px-4 py-2.5 text-sm">
              <span>fan1@example.com</span>
              <span>1</span>
            </div>
            <div className="grid grid-cols-2 px-4 py-2.5 text-sm">
              <span>fan2@example.com</span>
              <span>2</span>
            </div>
          </div>

          {previewError ? (
            <AlertBanner title="명단을 확인하지 못했습니다" variant="error">
              {previewError}
            </AlertBanner>
          ) : null}
          {templateError ? (
            <AlertBanner title="양식을 내려받지 못했습니다" variant="error">
              {templateError}
            </AlertBanner>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              loading={downloadingTemplate}
              onClick={() => void handleDownloadTemplate()}
              type="button"
              variant="outline"
            >
              양식 다운로드
            </Button>
            <label
              className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)] ${
                previewing ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {previewing ? '확인하는 중…' : 'CSV 업로드'}
              <input
                accept=".csv,text/csv"
                className="sr-only"
                disabled={previewing}
                onChange={(event) => void handleFileSelected(event)}
                type="file"
              />
            </label>
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            CSV를 업로드하면 행별 확인 결과를 볼 수 있어요.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-divider)] p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold">등록될 참가자</h2>
              <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                {file?.name} · {preview.totalRowCount}행 읽음
              </p>
            </div>
            <p className="whitespace-nowrap text-sm font-bold">
              {preview.validRowCount}명 등록
              {preview.invalidRowCount > 0
                ? ` · ${preview.invalidRowCount}건 확인 필요`
                : ' · 모두 정상'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-divider)] text-left text-[var(--color-text-secondary)]">
                  <th className="py-2 pr-3 font-bold">순번</th>
                  <th className="py-2 pr-3 font-bold">이메일</th>
                  <th className="py-2 pr-3 font-bold">대기 순번</th>
                  <th className="py-2 pr-3 font-bold">아이디(매칭)</th>
                  <th className="py-2 pr-3 text-right font-bold">확인</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr className="border-b border-[var(--color-border-row)]" key={row.rowNumber}>
                    <td className="py-2 pr-3 font-bold tabular-nums">
                      {String(row.rowNumber).padStart(2, '0')}
                    </td>
                    <td className="py-2 pr-3 [overflow-wrap:anywhere]">{row.email}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.callOrder ?? '-'}</td>
                    <td className="py-2 pr-3">{row.matchedNickname ?? '-'}</td>
                    <td
                      className={`py-2 pr-3 text-right font-bold ${
                        row.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                      }`}
                    >
                      {row.valid ? '정상' : (row.errorMessage ?? '오류')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.fileErrors.map((fileError) => (
            <AlertBanner key={fileError.errorCode} title="명단을 확정할 수 없습니다" variant="error">
              {fileError.errorMessage}
            </AlertBanner>
          ))}
          {confirmError ? (
            <AlertBanner title="확정에 실패했습니다" variant="error">
              {confirmError}
            </AlertBanner>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={confirming} onClick={handleReset} type="button" variant="outline">
              다시 업로드
            </Button>
            <Button
              disabled={!preview.confirmable}
              onClick={() => setConfirmDialogOpen(true)}
              title={
                preview.confirmable
                  ? undefined
                  : '형식 오류가 있는 행을 모두 고친 뒤 다시 업로드해 주세요.'
              }
              type="button"
            >
              명단 확정
            </Button>
          </div>
          {!preview.confirmable ? (
            <p className="text-sm font-medium text-[var(--color-text-muted)]">
              형식 오류가 있는 행을 고친 뒤 다시 업로드하면 확정할 수 있어요.
            </p>
          ) : null}
        </div>
      )}

      <Dialog
        description="확정하면 참가자와 대기 순번이 만들어지고 팬미팅이 진행 준비 상태가 됩니다. 이 명단은 다시 올릴 수 없습니다."
        footer={
          <>
            <Button
              disabled={confirming}
              onClick={() => setConfirmDialogOpen(false)}
              variant="outline"
            >
              취소
            </Button>
            <Button loading={confirming} onClick={() => void handleConfirm()}>
              명단 확정
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!confirming) setConfirmDialogOpen(open)
        }}
        open={confirmDialogOpen}
        title={`참가자 ${preview?.validRowCount ?? 0}명을 등록할까요?`}
      />
    </div>
  )
}

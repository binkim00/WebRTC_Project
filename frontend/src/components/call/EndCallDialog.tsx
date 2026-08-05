import { Dialog } from '../feedback'
import { Button } from '../ui/Button'
import { useTranslation } from '../../i18n'

type EndCallDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 진행 중인 통화를 종료한다. */
  onConfirm: () => void
  /**
   * 호스트 모드에서 방까지 완전히 떠날 때 호출한다.
   *
   * 호스트는 팬이 교체되는 동안 방에 머물기 때문에 "이 팬 통화만 끝내기"와
   * "팬미팅 진행 자체를 끝내고 나가기"를 구분해야 한다. 넘기지 않으면 팬 모드로 동작한다.
   */
  onLeaveRoom?: () => void
}

export function EndCallDialog({
  open,
  onOpenChange,
  onConfirm,
  onLeaveRoom,
}: EndCallDialogProps) {
  const { t } = useTranslation()
  const isHostMode = Boolean(onLeaveRoom)

  return (
    <Dialog
      description={
        isHostMode
          ? t('endCallDialog.t3')
          : t('endCallDialog.t4')
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t('endCallDialog.t1')}
          </Button>
          {isHostMode ? (
            <Button onClick={onLeaveRoom} variant="secondary">
              {t('endCallDialog.t2')}
            </Button>
          ) : null}
          <Button onClick={onConfirm} variant="danger">
            {isHostMode ? t('endCallDialog.t5') : t('endCallDialog.t6')}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={isHostMode ? t('endCallDialog.t7') : t('endCallDialog.t8')}
    >
      <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
        {isHostMode
          ? t('endCallDialog.t9')
          : t('endCallDialog.t10')}
      </p>
    </Dialog>
  )
}

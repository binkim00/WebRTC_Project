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
          ? '현재 팬과의 통화만 끝내고 다음 팬을 기다릴 수 있습니다.'
          : 'LiveKit 통화방 연결을 종료하고 다음 화면으로 이동합니다.'
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
            {isHostMode ? '이 팬 통화 종료' : '종료하기'}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={isHostMode ? '이 팬과의 통화를 종료할까요?' : '영상 통화를 종료할까요?'}
    >
      <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
        {isHostMode
          ? '통화를 종료하면 같은 방에 머문 채 다음 팬이 연결될 때까지 기다립니다. 카메라와 마이크는 계속 사용합니다.'
          : '연결을 종료하면 LiveKit이 사용 중인 카메라와 마이크도 함께 정리합니다.'}
      </p>
    </Dialog>
  )
}

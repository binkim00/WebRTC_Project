import { Dialog } from '../feedback'
import { Button } from '../ui/Button'

type EndCallDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function EndCallDialog({ open, onOpenChange, onConfirm }: EndCallDialogProps) {
  return (
    <Dialog
      description="LiveKit 통화방 연결을 종료하고 다음 화면으로 이동합니다."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            계속 통화
          </Button>
          <Button onClick={onConfirm} variant="danger">
            종료하기
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title="영상 통화를 종료할까요?"
    >
      <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
        연결을 종료하면 LiveKit이 사용 중인 카메라와 마이크도 함께 정리합니다.
      </p>
    </Dialog>
  )
}

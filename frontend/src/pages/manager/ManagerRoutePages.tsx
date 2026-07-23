import { ScreenPage } from '../../components/routing/ScreenPage'

type FormPageProps = {
  mode: 'create' | 'edit'
}

export function ManagerEventListPage() {
  return (
    <ScreenPage
      description="매니저가 이벤트 목록과 운영 상태를 확인하는 화면입니다."
      screenId="MG-001"
      title="이벤트 관리 화면"
    />
  )
}

export function ManagerEventFormPage({ mode }: FormPageProps) {
  return (
    <ScreenPage
      description={
        mode === 'create'
          ? '새 이벤트를 등록하기 위한 설정 화면입니다.'
          : '기존 이벤트를 수정하기 위한 설정 화면입니다.'
      }
      requiredParams={mode === 'edit' ? ['eventId'] : []}
      screenId="MG-002"
      title={mode === 'create' ? '이벤트 등록 화면' : '이벤트 수정 화면'}
    />
  )
}

export function ManagerApplicationsPage() {
  return (
    <ScreenPage
      description="특정 이벤트의 응모 내역을 관리하는 화면입니다."
      requiredParams={['eventId']}
      screenId="MG-003"
      title="응모 관리 화면"
    />
  )
}

export function ManagerMeetingMonitorPage() {
  return (
    <ScreenPage
      description="진행 중인 팬미팅 영상 통화를 모니터링하는 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="MG-004"
      title="영상 통화 모니터링 화면"
    />
  )
}

export function ManagerMeetingListPage() {
  return (
    <ScreenPage
      description="매니저가 팬미팅 목록과 운영 상태를 확인하는 화면입니다."
      screenId="MG-006"
      title="팬미팅 관리 화면"
    />
  )
}

export function ManagerMeetingFormPage({ mode }: FormPageProps) {
  return (
    <ScreenPage
      description={
        mode === 'create'
          ? '새 팬미팅을 등록하기 위한 설정 화면입니다.'
          : '기존 팬미팅을 수정하기 위한 설정 화면입니다.'
      }
      requiredParams={mode === 'edit' ? ['fanMeetingId'] : []}
      screenId="MG-007"
      title={mode === 'create' ? '팬미팅 등록 화면' : '팬미팅 수정 화면'}
    />
  )
}

export function ManagerNoticesPage() {
  return (
    <ScreenPage
      description="특정 팬미팅의 공지를 관리하는 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="MG-008"
      title="팬미팅 공지 관리 화면"
    />
  )
}

export function ManagerMyPage() {
  return (
    <ScreenPage
      description="매니저 계정 정보를 확인하는 마이페이지입니다."
      screenId="MG-009"
      title="매니저 마이페이지"
    />
  )
}

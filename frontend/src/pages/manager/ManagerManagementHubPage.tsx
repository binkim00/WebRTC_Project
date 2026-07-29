import {
  ArrowRight,
  CalendarDots,
  CalendarPlus,
  ListChecks,
  VideoCamera,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type ManagementHubCopy = {
  eyebrow: string
  title: string
  description: string
  createEyebrow: string
  createTitle: string
  createDescription: string
  createTo: string
  createIcon: ReactNode
  manageEyebrow: string
  manageTitle: string
  manageDescription: string
  manageTo: string
  manageIcon: ReactNode
}

const meetingHubCopy: ManagementHubCopy = {
  eyebrow: '팬미팅 운영',
  title: '팬미팅 관리',
  description: '팬미팅을 새로 만들거나 등록된 팬미팅의 진행 정보를 관리하세요.',
  createEyebrow: '새 팬미팅 준비',
  createTitle: '팬미팅 생성하기',
  createDescription: '새 1:1 영상통화 팬미팅의 일정과 진행 정보를 등록합니다.',
  createTo: '/manager/fan-meetings/new',
  createIcon: <VideoCamera aria-hidden="true" size={30} weight="bold" />,
  manageEyebrow: '기존 팬미팅 운영',
  manageTitle: '팬미팅 관리',
  manageDescription: '등록한 팬미팅을 확인하고 필요한 진행 설정을 관리합니다.',
  manageTo: '/manager/fan-meetings/manage',
  manageIcon: <ListChecks aria-hidden="true" size={30} weight="bold" />,
}

const eventHubCopy: ManagementHubCopy = {
  eyebrow: '팬미팅 관리',
  title: '이벤트 관리',
  description: '이벤트를 새로 만들거나 등록된 이벤트의 운영 정보를 관리하세요.',
  createEyebrow: '새 이벤트 준비',
  createTitle: '이벤트 생성하기',
  createDescription: '새 팬미팅 이벤트의 기본 정보와 응모 조건을 등록합니다.',
  createTo: '/manager/events/new',
  createIcon: <CalendarPlus aria-hidden="true" size={30} weight="bold" />,
  manageEyebrow: '기존 이벤트 운영',
  manageTitle: '이벤트 관리',
  manageDescription: '등록한 이벤트를 확인하고 필요한 운영 설정을 관리합니다.',
  manageTo: '/manager/events/manage',
  manageIcon: <CalendarDots aria-hidden="true" size={30} weight="bold" />,
}

function HubAction({
  eyebrow,
  title,
  description,
  to,
  icon,
  primary = false,
}: {
  eyebrow: string
  title: string
  description: string
  to: string
  icon: ReactNode
  primary?: boolean
}) {
  return (
    <section className="grid content-center gap-6 px-6 py-9 sm:px-9 lg:grid-cols-[64px_minmax(0,1fr)_auto] lg:items-center lg:gap-6 lg:px-12 lg:py-10">
      <span
        className={[
          'flex size-16 items-center justify-center rounded-[var(--radius-panel)]',
          primary
            ? 'bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
            : 'bg-[var(--color-surface-page)] text-[var(--color-text-primary)]',
        ].join(' ')}
      >
        {icon}
      </span>

      <div className="min-w-0">
        <p
          className={[
            'text-xs font-black tracking-[-0.02em]',
            primary
              ? 'text-[var(--color-primary-coral)]'
              : 'text-[var(--color-text-tertiary)]',
          ].join(' ')}
        >
          {eyebrow}
        </p>
        <h2 className="mt-2 text-[26px] font-black tracking-[-0.05em] sm:text-[28px]">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
          {description}
        </p>
      </div>

      <Link
        className={[
          'inline-flex min-h-12 w-fit items-center justify-center gap-3 whitespace-nowrap rounded-[var(--radius-control)] border px-6 text-sm font-bold',
          'transition-[background-color,border-color,color,transform] duration-200 hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none',
          'focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]',
          primary
            ? 'border-transparent bg-[var(--color-primary-coral)] text-white shadow-[var(--shadow-final-cta)] hover:bg-[var(--color-primary-coral-hover)]'
            : 'border-[var(--color-border-control)] bg-white text-[var(--color-text-primary)] hover:bg-[var(--color-surface-page)]',
        ].join(' ')}
        to={to}
      >
        {primary ? '생성 시작' : '관리 화면 열기'}
        <ArrowRight aria-hidden="true" size={18} weight="bold" />
      </Link>
    </section>
  )
}

function ManagerManagementHubPage({ copy }: { copy: ManagementHubCopy }) {
  return (
    <div className="py-5 lg:py-6">
      <div className="grid min-h-[634px] overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] bg-[var(--color-surface-panel)] lg:grid-cols-[39%_61%]">
        <header className="grid content-center border-b border-[var(--color-divider)] px-7 py-12 sm:px-12 lg:border-b-0 lg:border-r lg:px-12 xl:px-14">
          <div className="max-w-[350px]">
            <p className="text-xs font-black tracking-[-0.02em] text-[var(--color-primary-coral)]">
              {copy.eyebrow}
            </p>
            <h1 className="mt-4 text-[38px] font-black leading-tight tracking-[-0.065em] sm:text-[42px]">
              {copy.title}
            </h1>
            <p className="mt-5 text-[15px] leading-7 text-[var(--color-text-secondary)]">
              {copy.description}
            </p>
            <div className="mt-10 border-t border-[var(--color-divider)] pt-7">
              <p className="text-sm leading-6 text-[var(--color-text-tertiary)]">
                필요한 작업을 선택하면 해당 관리 화면으로 이동합니다.
              </p>
            </div>
          </div>
        </header>

        <div className="grid lg:grid-rows-2">
          <HubAction
            description={copy.createDescription}
            eyebrow={copy.createEyebrow}
            icon={copy.createIcon}
            primary
            title={copy.createTitle}
            to={copy.createTo}
          />
          <div className="border-t border-[var(--color-divider)]">
            <HubAction
              description={copy.manageDescription}
              eyebrow={copy.manageEyebrow}
              icon={copy.manageIcon}
              title={copy.manageTitle}
              to={copy.manageTo}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ManagerMeetingHubPage() {
  return <ManagerManagementHubPage copy={meetingHubCopy} />
}

export function ManagerEventHubPage() {
  return <ManagerManagementHubPage copy={eventHubCopy} />
}

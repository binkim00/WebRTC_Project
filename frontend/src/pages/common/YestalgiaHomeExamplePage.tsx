import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarBlankIcon,
  ListIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import callLocal from '../../assets/call-preview-local.jpg'
import callRemote from '../../assets/call-preview-remote.jpg'
import eventSeoun from '../../assets/main-event-seoun.webp'
import heroJellies from '../../assets/main-hero-jellies.webp'
import './YestalgiaHomeExamplePage.css'

const meetings = [
  {
    id: 'summer-story',
    index: '01',
    title: '여름 이야기',
    artist: '서윤',
    schedule: '08.15 · 19:00',
    status: '모집 중',
    image: eventSeoun,
  },
  {
    id: 'secret-garden',
    index: '02',
    title: '비밀 정원',
    artist: 'MELLY',
    schedule: '08.22 · 18:00',
    status: '오픈 예정',
    image: callRemote,
  },
  {
    id: 'hello-again',
    index: '03',
    title: 'HELLO AGAIN',
    artist: '민',
    schedule: '09.05 · 20:00',
    status: '알림 신청',
    image: callLocal,
  },
] as const

const fanStories = [
  {
    label: 'THE FIRST HELLO',
    quote: '화면 너머의 첫 인사가 오래 기억될 장면이 되었어요.',
    image: callRemote,
  },
  {
    label: 'THE SHARED SMILE',
    quote: '짧은 만남 안에서도 서로의 진심은 충분히 전해졌어요.',
    image: callLocal,
  },
  {
    label: 'THE NEXT MEMORY',
    quote: '다음 팬미팅을 기다리는 시간까지 새로운 추억이 됩니다.',
    image: eventSeoun,
  },
] as const

/**
 * 참고 사이트의 긴 스크롤 내러티브를 MELLY 콘텐츠로 재구성한 실험용 메인 화면입니다.
 * 기존 HomePage와 완전히 분리되어 있으며, 이 페이지의 데이터는 시각 예시 전용입니다.
 */
export function YestalgiaHomeExamplePage() {
  const pageRef = useRef<HTMLDivElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeStoryIndex, setActiveStoryIndex] = useState(0)
  const activeStory = fanStories[activeStoryIndex]

  useEffect(() => {
    const page = pageRef.current
    if (!page) {
      return
    }
    const scrollPage: HTMLDivElement = page

    const revealElements = Array.from(
      page.querySelectorAll<HTMLElement>('[data-reveal]'),
    )
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (prefersReducedMotion) {
      revealElements.forEach((element) => element.classList.add('is-visible'))
      return
    }

    // 화면에 들어온 요소만 한 번씩 나타나게 하여 긴 페이지의 장면 전환을 만든다.
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return
          }

          entry.target.classList.add('is-visible')
          revealObserver.unobserve(entry.target)
        })
      },
      {
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.12,
      },
    )

    revealElements.forEach((element) => revealObserver.observe(element))

    let animationFrameId = 0

    // 스크롤 이벤트당 한 번만 위치를 계산해 진행도와 패럴랙스 값을 CSS에 전달한다.
    function updateScrollMotion() {
      const scrollRange = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      )
      scrollPage.style.setProperty(
        '--page-progress',
        String(Math.min(1, Math.max(0, window.scrollY / scrollRange))),
      )

      scrollPage.querySelectorAll<HTMLElement>('[data-parallax]').forEach((element) => {
        const rect = element.getBoundingClientRect()
        const sectionProgress = Math.min(
          1,
          Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)),
        )
        const distance = Number(element.dataset.parallax ?? 0)
        const offset = (sectionProgress - 0.5) * distance

        element.style.setProperty('--parallax-offset', `${offset.toFixed(2)}px`)
      })

      animationFrameId = 0
    }

    function requestScrollMotionUpdate() {
      if (animationFrameId === 0) {
        animationFrameId = window.requestAnimationFrame(updateScrollMotion)
      }
    }

    updateScrollMotion()
    window.addEventListener('scroll', requestScrollMotionUpdate, { passive: true })
    window.addEventListener('resize', requestScrollMotionUpdate)

    return () => {
      revealObserver.disconnect()
      window.removeEventListener('scroll', requestScrollMotionUpdate)
      window.removeEventListener('resize', requestScrollMotionUpdate)

      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [])

  function closeMenu() {
    setIsMenuOpen(false)
  }

  function moveStory(offset: number) {
    setActiveStoryIndex(
      (currentIndex) =>
        (currentIndex + offset + fanStories.length) % fanStories.length,
    )
  }

  return (
    <div className="editorial-home" ref={pageRef}>
      <span aria-hidden="true" className="editorial-scroll-progress" />
      <header className="editorial-header">
        <button
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
          className="editorial-pill editorial-menu-button"
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
          type="button"
        >
          {isMenuOpen ? <XIcon aria-hidden="true" /> : <ListIcon aria-hidden="true" />}
          <span>{isMenuOpen ? 'CLOSE' : 'MENU'}</span>
        </button>

        <Link aria-label="MELLY 예시 홈" className="editorial-logo" to="/examples/yestalgia-home">
          MELLY
        </Link>

        <div className="editorial-header-actions">
          <span className="editorial-pill editorial-language">KR</span>
          <a className="editorial-pill editorial-event-link" href="#collection">
            EVENTS
          </a>
        </div>
      </header>

      <div className={isMenuOpen ? 'editorial-drawer is-open' : 'editorial-drawer'}>
        <nav aria-label="예시 페이지 섹션 메뉴">
          <a href="#collection" onClick={closeMenu}>팬미팅 컬렉션</a>
          <a href="#artist" onClick={closeMenu}>인플루언서 스토리</a>
          <a href="#family" onClick={closeMenu}>팬들의 기억</a>
          <a href="#lookbook" onClick={closeMenu}>다가오는 만남</a>
        </nav>
      </div>

      <main>
        <section className="editorial-hero" id="top">
          <p className="editorial-kicker" data-reveal="left">ONE-TO-ONE VIDEO FAN MEETING</p>
          <h1 data-reveal="up">
            <span>MEETING YOU</span>
            <span>SINCE TODAY</span>
          </h1>
          <div className="editorial-hero-art" data-parallax="-110">
            <span aria-hidden="true" className="editorial-orbit editorial-orbit-one" />
            <span aria-hidden="true" className="editorial-orbit editorial-orbit-two" />
            <img alt="서로 기대어 웃는 MELLY 젤리 캐릭터" src={heroJellies} />
          </div>
          <a className="editorial-scroll-cue" href="#manifesto">
            <span>SCROLL TO MEET</span>
            <ArrowDownIcon aria-hidden="true" weight="bold" />
          </a>
        </section>

        <section className="editorial-manifesto" id="manifesto">
          <div
            aria-hidden="true"
            className="editorial-manifesto-collage"
            data-parallax="90"
          >
            <img className="editorial-photo editorial-photo-one" src={callRemote} alt="" />
            <img className="editorial-photo editorial-photo-two" src={callLocal} alt="" />
            <span className="editorial-stamp">1:1</span>
          </div>
          <p data-reveal="up">INTO THE HEART OF</p>
          <h2 data-reveal="up">
            THE MOST VIVID
            <br />
            MOMENT EVER
          </h2>
        </section>

        <section className="editorial-collection" id="collection">
          <div className="editorial-section-heading" data-reveal="up">
            <span>[ MEETINGS 01—03 ]</span>
            <h2>CHOOSE YOUR<br />NEXT MEMORY</h2>
          </div>
          <div className="editorial-meeting-grid">
            {meetings.map((meeting, index) => (
              <article
                className="editorial-meeting-card"
                data-reveal="up"
                key={meeting.id}
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <div className="editorial-meeting-image">
                  <img alt={`${meeting.artist} ${meeting.title} 팬미팅`} src={meeting.image} />
                  <span>{meeting.status}</span>
                </div>
                <div className="editorial-meeting-meta">
                  <p>{meeting.index}</p>
                  <h3>{meeting.title}</h3>
                  <dl>
                    <div>
                      <dt>ARTIST</dt>
                      <dd>{meeting.artist}</dd>
                    </div>
                    <div>
                      <dt>DATE</dt>
                      <dd>{meeting.schedule}</dd>
                    </div>
                  </dl>
                  <Link to={`/fan/events/${meeting.id}`}>
                    VIEW EVENT
                    <ArrowRightIcon aria-hidden="true" weight="bold" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="editorial-artist" id="artist">
          <div className="editorial-artist-copy" data-reveal="left">
            <p>HI, I&apos;M</p>
            <h2>SEOYUN</h2>
            <p className="editorial-artist-statement">
              AN ARTIST
              <br />
              TURNING
              <br />
              HELLOS INTO
              <br />
              MEMORIES.
            </p>
          </div>
          <div
            className="editorial-artist-collage"
            data-parallax="-80"
          >
            <span className="editorial-sun" aria-hidden="true" />
            <img className="editorial-artist-main" alt="팬들에게 인사하는 인플루언서 서윤" src={eventSeoun} />
            <img className="editorial-artist-detail" alt="영상통화 화면 속 서윤" src={callRemote} />
            <blockquote>
              “팬과 단둘이 나누는 짧은 대화가<br />
              서로에게 오래 남는 장면이 되길 바라요.”
            </blockquote>
          </div>
        </section>

        <section className="editorial-family" id="family">
          <p className="editorial-family-kicker" data-reveal="up">
            THE MELLY FAMILY
          </p>
          <div className="editorial-story-stage" data-reveal="up">
            <button aria-label="이전 팬 이야기" onClick={() => moveStory(-1)} type="button">
              <ArrowLeftIcon aria-hidden="true" weight="bold" />
            </button>
            <figure>
              <img alt={activeStory.label} src={activeStory.image} />
              <figcaption>
                <span>{activeStory.label}</span>
                <strong>{activeStory.quote}</strong>
              </figcaption>
            </figure>
            <button aria-label="다음 팬 이야기" onClick={() => moveStory(1)} type="button">
              <ArrowRightIcon aria-hidden="true" weight="bold" />
            </button>
          </div>
          <div className="editorial-story-dots" aria-label={`${fanStories.length}개 팬 이야기`}>
            {fanStories.map((story, index) => (
              <button
                aria-label={`${index + 1}번째 팬 이야기 보기`}
                className={index === activeStoryIndex ? 'is-active' : ''}
                key={story.label}
                onClick={() => setActiveStoryIndex(index)}
                type="button"
              />
            ))}
          </div>
        </section>

        <section className="editorial-origin">
          <div
            className="editorial-origin-image"
            data-parallax="70"
          >
            <img alt="MELLY 영상 팬미팅에 참여 중인 팬" src={callLocal} />
            <span>LIVE<br />TOGETHER</span>
          </div>
          <div className="editorial-origin-copy" data-reveal="right">
            <p>[ WHY MELLY ]</p>
            <h2>A SMALL SCREEN.<br />A REAL CONNECTION.</h2>
            <p>
              MELLY는 좋아하는 사람과 단둘이 만나는 순간을 위해 만들어졌습니다.
              응모부터 장비 점검, 영상통화와 추억 기록까지 하나의 흐름으로 이어집니다.
            </p>
            <Link to="/fan/events">
              팬미팅 둘러보기
              <ArrowRightIcon aria-hidden="true" weight="bold" />
            </Link>
          </div>
        </section>

        <section className="editorial-lookbook" id="lookbook">
          <div className="editorial-lookbook-heading" data-reveal="up">
            <span>[ UPCOMING ]</span>
            <h2>MEET<br />AGAIN</h2>
          </div>
          {meetings.map((meeting, index) => (
            <article
              className="editorial-lookbook-row"
              data-reveal="up"
              key={`lookbook-${meeting.id}`}
              style={{ transitionDelay: `${index * 90}ms` }}
            >
              <span>{meeting.index}</span>
              <div>
                <p>{meeting.artist}</p>
                <h3>{meeting.title}</h3>
                <p className="editorial-lookbook-date">
                  <CalendarBlankIcon aria-hidden="true" />
                  {meeting.schedule}
                </p>
              </div>
              <img alt="" src={meeting.image} />
              <Link aria-label={`${meeting.title} 상세 보기`} to={`/fan/events/${meeting.id}`}>
                <ArrowRightIcon aria-hidden="true" weight="bold" />
              </Link>
            </article>
          ))}
        </section>

        <section className="editorial-final">
          <p data-reveal="up">YOUR NEXT MEMORY IS WAITING.</p>
          <h2 data-reveal="up">READY TO<br />MEET?</h2>
          <Link data-reveal="up" to="/fan/events">ENTER MELLY</Link>
          <img
            alt=""
            aria-hidden="true"
            data-parallax="-90"
            src={heroJellies}
          />
        </section>
      </main>

      <footer className="editorial-footer">
        <Link to="/">기존 MELLY 홈으로 돌아가기</Link>
        <p>EXPERIMENTAL HOME · 2026 MELLY</p>
      </footer>
    </div>
  )
}

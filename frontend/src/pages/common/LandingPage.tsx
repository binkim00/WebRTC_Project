import { useEffect, useRef } from 'react'
import albumCards from '../../assets/landing/album-cards.webp'
import heartBubble from '../../assets/landing/heart-bubble.webp'
import heartLightstick from '../../assets/landing/heart-lightstick.webp'
import jellyDuo from '../../assets/landing/jelly-duo-selected-transparent.png'
import wordmark from '../../assets/landing/melly-wordmark-selected.png'
import ringLight from '../../assets/landing/ring-light.webp'
import timer from '../../assets/landing/timer.webp'
import './landing.css'
import { useTranslation } from '../../i18n'

const particlePalette = ['#f5aca1', '#f3d76c', '#b8e3d3', '#d9c7f4', '#b9dbf6']

const floatObjects = [
  { className: 'ring-light', src: ringLight, depth: 1.1 },
  { className: 'album-cards', src: albumCards, depth: 0.75 },
  { className: 'timer', src: timer, depth: 0.55 },
  { className: 'heart-lightstick', src: heartLightstick, depth: 0.9 },
  { className: 'heart-bubble', src: heartBubble, depth: 0.7 },
  { className: 'jelly-duo', src: jellyDuo, depth: 1.15 },
] as const

/**
 * melly-landing 프로토타입의 히어로를 그대로 옮긴 랜딩 화면이다.
 * 헤더·네비게이션은 전역 AppHeader(role 분기)가 담당하므로 히어로만 렌더링한다.
 */
export function LandingPage() {
  const { t } = useTranslation()
  const heroRef = useRef<HTMLElement>(null)

  // 원본 script.js의 파티클 생성·포인터 패럴랙스·젤리 보잉 인터랙션을 그대로 옮겼다.
  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return

    const particleField = hero.querySelector('.particles')
    if (particleField) {
      const fragment = document.createDocumentFragment()
      for (let index = 0; index < 28; index += 1) {
        const particle = document.createElement('span')
        particle.className = 'particle'
        particle.style.left = `${4 + Math.random() * 92}%`
        particle.style.top = `${4 + Math.random() * 92}%`
        particle.style.setProperty('--size', `${2 + Math.random() * 4.5}px`)
        particle.style.setProperty('--opacity', `${0.2 + Math.random() * 0.35}`)
        particle.style.setProperty(
          '--color',
          particlePalette[index % particlePalette.length] ?? particlePalette[0] ?? '#f5aca1',
        )
        particle.style.setProperty('--duration', `${4.5 + Math.random() * 5}s`)
        particle.style.setProperty('--delay', `${-Math.random() * 7}s`)
        fragment.appendChild(particle)
      }
      particleField.appendChild(fragment)
    }

    const objects = Array.from(hero.querySelectorAll<HTMLElement>('[data-depth]'))
    const finePointer = window.matchMedia('(pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!finePointer.matches || reducedMotion.matches) {
      return () => {
        particleField?.replaceChildren()
      }
    }

    const handleEnter = (event: Event) => {
      const object = event.currentTarget as HTMLElement
      object.getAnimations().forEach((animation) => {
        if (animation.id === 'jelly-boing') animation.cancel()
      })

      const boing = object.animate(
        [
          { offset: 0, rotate: '0deg', scale: '1 1' },
          { offset: 0.2, rotate: '-2deg', scale: '1.14 0.86', easing: 'ease-out' },
          { offset: 0.43, rotate: '1.5deg', scale: '0.93 1.12', easing: 'ease-in-out' },
          { offset: 0.67, rotate: '-0.7deg', scale: '1.06 0.96', easing: 'ease-in-out' },
          { offset: 0.84, rotate: '0.3deg', scale: '0.98 1.03', easing: 'ease-out' },
          { offset: 1, rotate: '0deg', scale: '1 1' },
        ],
        { duration: 680, easing: 'linear' },
      )
      boing.id = 'jelly-boing'
    }

    // 워드마크도 같은 boing을 주되, 본문 한가운데라 과하지 않게 진폭을 절반쯤 줄인다.
    const wordmark = hero.querySelector<HTMLElement>('.wordmark')
    const handleWordmarkEnter = () => {
      if (!wordmark) return
      wordmark.getAnimations().forEach((animation) => {
        if (animation.id === 'jelly-boing') animation.cancel()
      })

      const boing = wordmark.animate(
        [
          { offset: 0, rotate: '0deg', scale: '1 1' },
          { offset: 0.2, rotate: '-0.8deg', scale: '1.06 0.95', easing: 'ease-out' },
          { offset: 0.43, rotate: '0.6deg', scale: '0.97 1.04', easing: 'ease-in-out' },
          { offset: 0.67, rotate: '-0.3deg', scale: '1.02 0.99', easing: 'ease-in-out' },
          { offset: 1, rotate: '0deg', scale: '1 1' },
        ],
        { duration: 620, easing: 'linear' },
      )
      boing.id = 'jelly-boing'
    }
    wordmark?.addEventListener('pointerenter', handleWordmarkEnter)

    const handleMove = (event: PointerEvent) => {
      const x = event.clientX / window.innerWidth - 0.5
      const y = event.clientY / window.innerHeight - 0.5
      objects.forEach((object) => {
        const depth = Number(object.dataset.depth ?? 1)
        object.style.translate = `${x * 14 * depth}px ${y * 10 * depth}px`
      })
    }

    const handleLeave = () => {
      objects.forEach((object) => {
        object.style.translate = ''
      })
    }

    objects.forEach((object) => object.addEventListener('pointerenter', handleEnter))
    hero.addEventListener('pointermove', handleMove)
    hero.addEventListener('pointerleave', handleLeave)

    return () => {
      objects.forEach((object) => object.removeEventListener('pointerenter', handleEnter))
      wordmark?.removeEventListener('pointerenter', handleWordmarkEnter)
      hero.removeEventListener('pointermove', handleMove)
      hero.removeEventListener('pointerleave', handleLeave)
      particleField?.replaceChildren()
    }
  }, [])

  return (
    // App main의 패딩(py-8, lg:pt-10/pb-16)을 상하 각각 정확히 상쇄해야 히어로가 화면을 꽉 채운다.
    <section
      aria-labelledby="hero-title"
      className="melly-landing -mx-4 -mb-8 -mt-8 sm:-mx-6 lg:-mx-10 lg:-mb-16 lg:-mt-10"
      ref={heroRef}
    >
      <div aria-hidden="true" className="particles" />

      {floatObjects.map((object) => (
        <img
          alt=""
          className={`float-object ${object.className}`}
          data-depth={object.depth}
          key={object.className}
          src={object.src}
        />
      ))}

      <div className="hero-copy">
        <img alt="Melly" className="wordmark" src={wordmark} />
        <h1 id="hero-title">
          {t('landingPage.t1')}
          <br />
          {t('landingPage.t2')}
        </h1>
        <p>{t('landingPage.t3')}</p>
      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import { cn } from '../ui/cn'
import {
  readCharacterPreference,
  writeCharacterPreference,
} from './characterPreference'
import {
  CHARACTER_PRESETS,
  startCharacterRenderer,
  type CharacterPresetId,
  type CharacterRenderer,
} from './characterVideoTrack'

/**
 * 통화에 들어가기 전 "캐릭터로 참여"를 미리 고르는 블록이다. (장비 점검 화면)
 *
 * 통화 화면에서만 켤 수 있으면 켜기 전 잠깐 얼굴이 상대에게 보이고, 2분짜리 통화에서 그 조작에
 * 쓰는 몇 초도 아깝다. 그래서 여기서 미리 정하고 통화는 그 상태로 시작한다.
 * (통화 중에도 언제든 끌 수 있다. 두 화면이 같은 저장값을 읽고 쓴다.)
 *
 * 미리보기에 마이크를 연결하는 이유: 이 캐릭터는 소리에 맞춰 입이 움직이는 것이 핵심인데,
 * 정지된 그림만 보면 무엇을 고르는지 알 수 없다. 장비 점검 화면은 이미 마이크를 켜 두므로
 * 말해 보면 그대로 입이 움직인다.
 */
export function CharacterSetup({
  microphoneTrack,
}: {
  /** 미리보기에서 입을 움직이는 데 쓸 마이크 트랙이다. 없으면 입은 닫힌 채로 있는다. */
  microphoneTrack?: MediaStreamTrack
}) {
  const { t } = useTranslation()
  const [preference, setPreference] = useState(readCharacterPreference)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [unsupported, setUnsupported] = useState(false)

  /** 켜져 있을 때만 렌더러를 돌린다. 꺼진 상태에서 CPU를 쓰지 않게 한다. */
  useEffect(() => {
    if (!preference.enabled) return

    let renderer: CharacterRenderer | undefined
    try {
      renderer = startCharacterRenderer(preference.presetId, microphoneTrack)
    } catch {
      renderer = undefined
    }

    if (!renderer) {
      setUnsupported(true)
      return
    }

    setUnsupported(false)
    const element = videoRef.current
    if (element) {
      element.srcObject = new MediaStream([renderer.track])
      void element.play().catch(() => undefined)
    }

    return () => {
      if (element) element.srcObject = null
      renderer?.stop()
    }
  }, [microphoneTrack, preference.enabled, preference.presetId])

  /** 설정을 화면과 저장소에 함께 반영한다. 저장값이 통화 화면으로 이어진다. */
  function update(next: { enabled?: boolean; presetId?: CharacterPresetId }) {
    const merged = { ...preference, ...next }
    setPreference(merged)
    writeCharacterPreference(merged)
  }

  return (
    <section className="mt-5 border-t border-[var(--color-divider)] pt-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[15px] font-extrabold">{t('characterSetup.title')}</span>
        <button
          aria-pressed={preference.enabled}
          className={cn(
            'min-h-9 whitespace-nowrap rounded-lg border px-3 text-[13px] font-bold transition-colors',
            preference.enabled
              ? 'border-transparent bg-[var(--color-primary-coral)] text-white'
              : 'border-[var(--color-border-control)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]',
          )}
          onClick={() => update({ enabled: !preference.enabled })}
          type="button"
        >
          {preference.enabled ? t('characterSetup.on') : t('characterSetup.off')}
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-tertiary)]">
        {t('characterSetup.description')}
      </p>

      {preference.enabled ? (
        <div className="mt-3 flex items-center gap-4">
          {/*
            미리보기 — 실제로 상대에게 보낼 영상과 같은 방식으로 만든 트랙을 그대로 재생한다.
            그래서 여기 보이는 모습이 통화에서 보이는 모습과 다르지 않다.
          */}
          {unsupported ? (
            <p className="text-[13px] font-semibold text-[var(--color-warning)]">
              {t('characterSetup.unsupported')}
            </p>
          ) : (
            <>
              <video
                aria-label={t('characterSetup.preview')}
                className="aspect-[4/3] w-[132px] rounded-lg bg-[var(--color-surface-dark-media)] object-cover"
                muted
                playsInline
                ref={videoRef}
              />
              <div aria-label={t('characterSetup.pick')} className="flex items-center gap-2" role="group">
                {CHARACTER_PRESETS.map((preset) => (
                  <button
                    aria-label={preset.id}
                    aria-pressed={preset.id === preference.presetId}
                    className={cn(
                      'size-8 rounded-full border-2 transition-transform hover:scale-110 focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] motion-reduce:hover:scale-100',
                      preset.id === preference.presetId
                        ? 'border-[var(--color-text-primary)]'
                        : 'border-transparent',
                    )}
                    key={preset.id}
                    onClick={() => update({ presetId: preset.id })}
                    style={{
                      background: `radial-gradient(circle at 50% 62%, ${preset.skin} 0 46%, ${preset.hair} 47% 100%)`,
                    }}
                    type="button"
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}

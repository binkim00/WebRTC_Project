import { CHARACTER_PRESETS, type CharacterPresetId } from './characterVideoTrack'

/**
 * 팬이 고른 "캐릭터로 참여" 설정을 보관한다.
 *
 * 왜 저장하는가: 캐릭터를 통화 화면에서만 켤 수 있으면, 얼굴을 보이고 싶지 않은 팬은 통화가
 * 시작된 **뒤에** 급하게 켜야 한다. 통화가 2분뿐이라 그 몇 초가 아깝고, 무엇보다 켜기 전 잠깐
 * 얼굴이 상대에게 보인다. 그래서 장비 점검 화면에서 미리 고르고 통화는 그 상태로 시작한다.
 *
 * sessionStorage가 아니라 localStorage를 쓰는 이유: 장비 점검 → 대기실 → 통화로 화면이 여러 번
 * 바뀌고 새로고침도 일어날 수 있는데, 그때 설정이 풀려 얼굴이 노출되면 안 된다. 다음 팬미팅에서도
 * 같은 선택을 유지하는 편이 자연스럽다.
 *
 * 팬미팅별로 나누지 않는 이유: "내 얼굴을 보이고 싶은지"는 특정 팬미팅의 속성이 아니라 그 사람의
 * 성향이다. 통화 중에 끄면 그 선택도 여기에 반영된다.
 */

const STORAGE_KEY = 'melly-call-character'

export type CharacterPreference = {
  /** 캐릭터로 참여할지 여부다. */
  enabled: boolean
  presetId: CharacterPresetId
}

const DEFAULT_PREFERENCE: CharacterPreference = {
  enabled: false,
  presetId: CHARACTER_PRESETS[0].id,
}

function isPresetId(value: unknown): value is CharacterPresetId {
  return CHARACTER_PRESETS.some((preset) => preset.id === value)
}

/**
 * 저장된 설정을 읽는다.
 *
 * 값이 없거나 깨져 있으면 기본값(캐릭터 끔)을 준다. 저장이 막힌 브라우저에서도 통화는 정상
 * 동작해야 하므로 접근 실패를 흡수한다.
 */
export function readCharacterPreference(): CharacterPreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCE

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCE
    const record = parsed as Record<string, unknown>

    return {
      enabled: record.enabled === true,
      presetId: isPresetId(record.presetId) ? record.presetId : DEFAULT_PREFERENCE.presetId,
    }
  } catch {
    return DEFAULT_PREFERENCE
  }
}

/** 설정을 저장한다. 저장에 실패하면 이번 화면에서만 적용된 채로 진행한다. */
export function writeCharacterPreference(preference: CharacterPreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // 저장할 수 없어도 화면 동작 자체는 막지 않는다.
  }
}

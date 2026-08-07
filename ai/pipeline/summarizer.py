"""
통화 종료 후 자막 데이터를 기반으로 요약 및 키워드를 생성.
"""

import asyncio
import json
import logging
import os
import re

import anthropic
import httpx
import openai
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from db import queries

# 1. LangSmith 관련 패키지 가져오기
from langsmith import traceable
from langsmith.wrappers import wrap_anthropic, wrap_openai

logger = logging.getLogger(__name__)

# ── 게이트웨이 / 인증 설정 ────────────────────────────────────────────────
# gemini는 OpenAI/anthropic과 달리 OpenAI 호환 포맷이 아니라
# generativelanguage.googleapis.com 고유의 REST API(generateContent)를 그대로 씀.
# 실제 요청 형태: POST {GEMINI_BASE_URL}/models/{model}:generateContent
OPENAI_BASE_URL = "https://gms.ssafy.io/gmsapi/api.openai.com/v1"
ANTHROPIC_BASE_URL = "https://gms.ssafy.io/gmsapi/api.anthropic.com"
GEMINI_BASE_URL = os.environ.get(
    "GEMINI_BASE_URL",
    "https://gms.ssafy.io/gmsapi/generativelanguage.googleapis.com/v1beta",
)

GMS_API_KEY = os.environ.get("GMS_API_KEY")
# provider별로 키가 다르면 각각의 env var를 쓰고, 없으면 GMS_API_KEY로 통일
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", GMS_API_KEY)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", GMS_API_KEY)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", GMS_API_KEY)

MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """당신은 인플루언서의 팬미팅 보조 AI입니다.
    인플루언서와 팬의 대화 자막을 분석하여 인플루언서가 팬을 기억하는 데 도움이 되는 메모 초안을 작성하고,
    팬이 기념 카드에 새길 짧은 기념 문구를 지어 줍니다."""

USER_PROMPT_TEMPLATE = """아래는 인플루언서와 팬의 실시간 대화 자막입니다.

    [대화 내용]
    {subtitles}

    다음 두 가지를 작성해주세요.

    1) 팬에 대한 메모 초안 (인플루언서용)
    - 팬의 근황, 성취, 특별한 사건 (졸업, 수상, 취업 등)
    - 팬의 관심사, 좋아하는 것
    - 팬이 인플루언서에게 바라는 것, 다음에 하고 싶은 것
    - 인플루언서가 기억하면 좋을 특이사항

    2) 팬이 기념 카드에 새길 문구 후보 3개 (팬용)
    - 대화 문장을 그대로 옮기지 않습니다. 카드 한 줄에 새길 **기념 문구**를 새로 씁니다.
    - 이날 오간 이야기(장소, 계획, 함께 웃은 일, 팬의 사연)를 소재로, 팬이 나중에 다시
      읽었을 때 그날이 떠오르는 짧은 문장을 만듭니다.
    - 인플루언서가 한 말처럼 보이게 쓰지 않습니다. 따옴표를 붙이지 않고,
      인플루언서를 화자로 삼는 말투("~할게요", "~드릴게요")도 쓰지 않습니다.
    - 세 문구는 서로 다른 소재를 잡습니다.
    - 마침표 없이 {card_limit}자 안팎으로 짧게 씁니다.
    - 대화에 나오지 않은 사실을 지어내지 않습니다.
    - 전화번호, 이메일, 주소, 계정 아이디, 실명처럼 개인정보가 담긴 내용은 넣지 않습니다.
    - 카드에 남길 만한 소재가 없으면 빈 배열로 둡니다.

    문구 예시입니다. 형식과 길이만 참고하고 내용은 반드시 위 대화에서 가져옵니다.
    "겨울 제주에서 다시 만나요", "호주에서 온 첫 팬미팅", "한라산 눈꽃 이야기를 나눈 날"
{language_rules}
    반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:
    {{
    "summary": "2~4문장의 메모 초안",
    "keywords": ["핵심키워드1", "핵심키워드2"],
    "card_candidates": ["문구1", "문구2", "문구3"]
    }}

    대화 내용이 너무 짧거나 특별한 내용이 없으면:
    {{
    "summary": "특별한 내용 없음",
    "keywords": [],
    "card_candidates": []
    }}"""

# 팬 카드 문구 후보 제한. 프롬프트에 같은 값을 명시하지만 모델이 어길 수 있어 저장 전에 다시 자른다.
CARD_CANDIDATE_MAX_COUNT = 3
CARD_CANDIDATE_MAX_LENGTH = 60

# 라틴 문자 언어는 같은 뜻을 담는 데 글자 수가 훨씬 많이 든다. 한국어 40자 문장을 영어로
# 옮기면 70자를 넘기 일쑤라, 60자를 그대로 적용하면 옮긴 문구가 전부 잘려 후보가 빈 배열이
# 된다. 백엔드 FanCard.MAX_TEXT_LENGTH가 200자라 100자까지는 저장에도 걸리지 않는다.
CARD_CANDIDATE_MAX_LENGTH_BY_LANG = {"en": 100, "vi": 100}

# 프롬프트에 적는 권장 길이다. 카드 한 줄에 새기는 기념 문구라 대화 문장보다 훨씬 짧아야
# 하는데, 이 값을 저장 상한으로도 쓰면 모델이 조금만 넘겨도 후보가 통째로 버려져 목록이
# 빈다. 그래서 "이 정도로 써 달라"는 권장값과 "이보다 길면 버린다"는 상한을 나눠 둔다.
CARD_CANDIDATE_TARGET_LENGTH = 25
CARD_CANDIDATE_TARGET_LENGTH_BY_LANG = {"en": 45, "vi": 45}

# 백엔드(QueueCommandService.toLanguageCode)가 쓰는 언어 코드와 프롬프트에 넣을 이름.
# 모델이 어떤 언어인지 확실히 알도록 해당 언어 표기를 함께 적는다.
LANGUAGE_LABELS = {
    "ko": "한국어",
    "en": "영어(English)",
    "ja": "일본어(日本語)",
    "zh": "중국어(中文)",
    "vi": "베트남어(Tiếng Việt)",
}

# 언어를 알아내지 못했을 때의 기본값. agent.py의 DEFAULT_INFLUENCER_LANG과 같은 값이며,
# 이 값으로 떨어지면 수정 전과 완전히 같은 프롬프트가 만들어진다.
DEFAULT_LANG = "ko"

# 팬·인플루언서 언어가 모두 기본값일 때는 아래 블록을 통째로 비워 기존 프롬프트를 그대로 쓴다.
# 지금 정상 동작 중인 한국어 통화의 요약 품질을 건드리지 않기 위한 장치다.
SYSTEM_PROMPT_LANGUAGE_SUFFIX = (
    "\n    메모 초안은 {influencer_label}로, 팬 카드 문구는 {fan_label}로 작성합니다."
)


def _normalize_lang(code: str | None) -> str:
    """
    통화에서 받은 언어 코드를 프롬프트에 쓸 수 있는 코드로 정규화한다.

    아는 코드가 아니면 기본값으로 되돌린다. 모르는 값을 그대로 프롬프트에 넣어 엉뚱한
    언어로 답하게 만드느니, 수정 전과 같은 한국어 결과를 내는 편이 안전하다.

    :param code: 통화에서 받은 언어 코드
    :return: LANGUAGE_LABELS에 있는 언어 코드
    """
    if not isinstance(code, str):
        return DEFAULT_LANG

    normalized = code.strip().lower().split("-")[0]
    if normalized not in LANGUAGE_LABELS:
        if normalized:
            logger.warning(
                "알 수 없는 언어 코드 '%s' — %s로 간주한다", code, DEFAULT_LANG
            )
        return DEFAULT_LANG
    return normalized


def _card_candidate_max_length(fan_lang: str) -> int:
    """
    팬 언어에 맞는 카드 문구 길이 상한을 고른다.

    :param fan_lang: 정규화된 팬 언어 코드
    :return: 해당 언어의 글자 수 상한
    """
    return CARD_CANDIDATE_MAX_LENGTH_BY_LANG.get(fan_lang, CARD_CANDIDATE_MAX_LENGTH)


def _card_candidate_target_length(fan_lang: str) -> int:
    """
    프롬프트에 적을 카드 문구 권장 길이를 고른다.

    저장 상한과 달리 이 값을 넘겼다고 후보를 버리지는 않는다. 모델에게 짧게 쓰도록
    안내하는 용도다.

    :param fan_lang: 정규화된 팬 언어 코드
    :return: 해당 언어의 권장 글자 수
    """
    return CARD_CANDIDATE_TARGET_LENGTH_BY_LANG.get(fan_lang, CARD_CANDIDATE_TARGET_LENGTH)


def _build_language_rules(fan_lang: str, influencer_lang: str) -> str:
    """
    프롬프트에 끼워 넣을 출력 언어 규칙 블록을 만든다.

    두 언어가 모두 기본값이면 빈 문자열을 돌려주고, 그 결과 완성된 프롬프트는 수정 전과
    글자 하나까지 같아진다.

    :param fan_lang: 정규화된 팬 언어 코드
    :param influencer_lang: 정규화된 인플루언서 언어 코드
    :return: 규칙 블록 문자열이며 기본 언어 조합이면 빈 문자열
    """
    if fan_lang == DEFAULT_LANG and influencer_lang == DEFAULT_LANG:
        return ""

    fan_label = LANGUAGE_LABELS[fan_lang]
    influencer_label = LANGUAGE_LABELS[influencer_lang]
    rules = [
        "    3) 출력 언어",
        f"    - 메모 초안(summary)과 핵심 키워드(keywords)는 {influencer_label}로 작성합니다.",
        f"    - 팬 카드 문구 후보(card_candidates)는 처음부터 {fan_label}로 씁니다.",
        f"    - 대화가 {fan_label}가 아닌 언어로 오갔더라도 소재만 가져와 {fan_label}로",
        "      쓰고, 원문은 함께 적지 않습니다.",
    ]
    return "\n" + "\n".join(rules) + "\n"


def _build_system_prompt(fan_lang: str, influencer_lang: str) -> str:
    """
    출력 언어 지시를 덧붙인 시스템 프롬프트를 만든다.

    사용자 프롬프트에만 언어를 적으면 온통 한국어인 지시문에 눌려 모델이 한국어로 답하는
    일이 있어, 시스템 프롬프트에서도 한 번 못박는다.

    :param fan_lang: 정규화된 팬 언어 코드
    :param influencer_lang: 정규화된 인플루언서 언어 코드
    :return: 기본 언어 조합이면 기존 시스템 프롬프트 그대로, 아니면 언어 지시를 덧붙인 문자열
    """
    if fan_lang == DEFAULT_LANG and influencer_lang == DEFAULT_LANG:
        return SYSTEM_PROMPT

    return SYSTEM_PROMPT + SYSTEM_PROMPT_LANGUAGE_SUFFIX.format(
        influencer_label=LANGUAGE_LABELS[influencer_lang],
        fan_label=LANGUAGE_LABELS[fan_lang],
    )


#추후 db호출 구조에 따라 수정
def _format_subtitles(subtitles: list[dict]) -> str:
    lines = []
    for s in subtitles:
        role = "인플루언서" if s.get("speaker_role") == "INFLUENCER" else "팬"
        text = s.get("original_text", "").strip()
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines) if lines else "(대화 내용 없음)"


def _sanitize_card_candidates(
    raw, max_length: int = CARD_CANDIDATE_MAX_LENGTH
) -> list[str]:
    """
    모델이 준 팬 카드 문구 후보를 저장 가능한 형태로 정리한다.

    프롬프트로 개수와 길이를 지시하지만 모델이 지키지 않을 수 있고, 팬에게 그대로 노출되는
    값이라 문자열이 아닌 항목·빈 문장·중복을 걸러내고 개수와 길이를 강제한다.

    :param raw: 모델이 돌려준 card_candidates 값
    :param max_length: 문구 하나의 글자 수 상한이며 팬 언어에 따라 달라진다
    :return: 정리된 문구 목록
    """
    if not isinstance(raw, list):
        return []

    candidates: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text or len(text) > max_length:
            continue
        if text in candidates:
            continue
        candidates.append(text)
        if len(candidates) >= CARD_CANDIDATE_MAX_COUNT:
            break

    return candidates


def _parse_response(content: str) -> dict | None:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.exception("요약 JSON 파싱 실패 content=%s", content)
        return None


# ── 모델(provider)별 호출 함수 ───────────────────────────────────────────
# 새 모델을 테스트하고 싶으면 여기 세 함수 중 하나만 손보면 됨.
# generate_summary()는 이 함수들을 통해서만 실제 API를 호출한다.

# 미지원 파라미터를 다른 이름으로 바꿔서 재시도할 매핑. 매핑에 없으면 그냥 제거하고 재시도.
_PARAM_RENAME = {"max_tokens": "max_completion_tokens"}

# 메시지 형태가 모델/케이스마다 다름:
#   "Unsupported parameter: 'max_tokens' is not supported..."
#   "Unsupported value: 'temperature' does not support 0.3..."
# 문자열 패턴에 의존하면 위처럼 형태가 바뀔 때마다 놓치므로, 우선 OpenAI 에러 바디의
# 구조화된 'param' 필드를 직접 찾고, 안 되면 정규식으로 폴백한다.
_UNSUPPORTED_PARAM_RE = re.compile(r"Unsupported (?:parameter|value): '(\w+)'")


def _find_key(obj, key: str) -> str | None:
    """중첩된 dict/list 안에서 key에 해당하는 문자열 값을 재귀적으로 찾음."""
    if isinstance(obj, dict):
        if isinstance(obj.get(key), str):
            return obj[key]
        for v in obj.values():
            found = _find_key(v, key)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_key(item, key)
            if found:
                return found
    return None


def _extract_bad_param(exc: openai.BadRequestError) -> str | None:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        found = _find_key(body, "param")
        if found:
            return found
    match = _UNSUPPORTED_PARAM_RE.search(str(exc))
    return match.group(1) if match else None


async def _call_openai_compatible(
    *,
    model: str,
    base_url: str,
    api_key: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """OpenAI /chat/completions 형식(호환 포함)을 쓰는 provider 공용 호출 로직.

    모델마다 지원하지 않는 파라미터가 다른 문제(예: gpt-5 계열은 max_tokens
    대신 max_completion_tokens 요구)를 해결하기 위해, 400 에러 메시지를 보고
    문제가 된 파라미터를 자동으로 이름 변경/제거한 뒤 재시도한다.
    """
    client = wrap_openai(AsyncOpenAI(api_key=api_key, base_url=base_url))
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    params: dict = {"temperature": temperature, "max_tokens": max_tokens}

    for _ in range(len(params) + 1):
        try:
            completion = await client.chat.completions.create(
                model=model, messages=messages, **params
            )
            return completion.choices[0].message.content
        except openai.BadRequestError as e:
            bad_param = _extract_bad_param(e)
            if not bad_param or bad_param not in params:
                raise

            value = params.pop(bad_param)
            renamed = _PARAM_RENAME.get(bad_param)
            if renamed:
                params[renamed] = value
                logger.warning(
                    "모델 %s: 파라미터 '%s' 미지원 → '%s'로 대체 후 재시도",
                    model, bad_param, renamed,
                )
            else:
                logger.warning(
                    "모델 %s: 파라미터 '%s' 미지원 → 제거 후 재시도", model, bad_param
                )

    raise RuntimeError(f"{model} 호출 실패: 지원되지 않는 파라미터 재시도 횟수 초과")


async def _call_openai(
    model: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
) -> str:
    return await _call_openai_compatible(
        model=model,
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
    )


@traceable(name="Gemini generateContent", run_type="llm")
async def _call_gemini(
    model: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
) -> str:
    """gemini 고유의 REST API(generateContent) 호출.

    OpenAI/anthropic과 달리 URL 자체에 모델명이 들어가고
    (`/models/{model}:generateContent`), 요청 바디도 messages가 아니라
    contents/parts 구조라 별도로 구현함.
    """
    url = f"{GEMINI_BASE_URL}/models/{model}:generateContent"
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            # gemini-2.5 계열은 기본적으로 내부 "thinking"에 토큰을 먼저 쓰고 남는
            # 걸로 실제 답변을 씀. maxOutputTokens가 작으면 thinking이 다 먹어버려서
            # 답변(JSON)이 중간에 잘리는 문제가 생기므로 thinking을 꺼서 답변에
            # 토큰을 전부 쓰게 함. (gemini-2.5-pro는 완전히 끄는 게 안 될 수 있음 —
            # 그런 경우 이 필드를 빼거나 값을 조정해야 함)
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, json=payload, headers=headers)

    if response.status_code != 200:
        logger.error(
            "gemini 모델 %s 호출 실패 status=%s body=%s",
            model, response.status_code, response.text,
        )
        response.raise_for_status()

    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"{model} 응답에 candidates 없음: {data}")

    finish_reason = candidates[0].get("finishReason")
    if finish_reason == "MAX_TOKENS":
        logger.warning(
            "모델 %s: maxOutputTokens(%s)에 걸려 응답이 잘림 — max_tokens를 늘려야 함",
            model, max_tokens,
        )

    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts)


async def _call_anthropic(
    model: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
) -> str:
    client = wrap_anthropic(
        AsyncAnthropic(api_key=ANTHROPIC_API_KEY, base_url=ANTHROPIC_BASE_URL)
    )
    try:
        completion = await client.messages.create(
            model=model,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except anthropic.BadRequestError:
        logger.exception("anthropic 모델 %s 호출 실패", model)
        raise

    return "".join(block.text for block in completion.content if block.type == "text")


def _resolve_provider(model: str) -> str:
    lower = model.lower()
    if lower.startswith(("gpt", "o1", "o3", "o4", "chatgpt")):
        return "openai"
    if lower.startswith("claude"):
        return "anthropic"
    if lower.startswith("gemini"):
        return "gemini"
    raise ValueError(
        f"알 수 없는 모델 '{model}' — gpt-/claude-/gemini- 접두사로 시작해야 함"
    )


_PROVIDER_CALLERS = {
    "openai": _call_openai,
    "anthropic": _call_anthropic,
    "gemini": _call_gemini,
}


async def _call_model(
    model: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
) -> str:
    provider = _resolve_provider(model)
    caller = _PROVIDER_CALLERS[provider]
    return await caller(model, system_prompt, user_prompt, temperature, max_tokens)


# 2. @traceable 데코레이터 적용 (함수의 입력/출력/실행 시간이 자동 추적됨)
@traceable(name="Generate Summary Function")
async def generate_summary(
    subtitles: list[dict],
    model: str = MODEL,
    fan_lang: str | None = None,
    influencer_lang: str | None = None,
) -> dict | None:
    """
    자막을 모델에 넘겨 메모 초안과 팬 카드 문구 후보를 받아 온다.

    :param subtitles: 통화의 자막 목록
    :param model: 호출할 모델 이름
    :param fan_lang: 팬 카드 문구를 적을 언어 코드이며 없으면 기본 언어로 본다
    :param influencer_lang: 메모 초안을 적을 언어 코드이며 없으면 기본 언어로 본다
    :return: 모델 응답을 파싱한 dict이며 실패하면 None
    """
    if not subtitles:
        logger.info("자막 없음 — 요약 생략")
        return None

    if not GMS_API_KEY:
        logger.error("GMS_API_KEY가 설정되지 않음")
        return None

    fan_lang = _normalize_lang(fan_lang)
    influencer_lang = _normalize_lang(influencer_lang)

    subtitle_text = _format_subtitles(subtitles)
    user_prompt = USER_PROMPT_TEMPLATE.format(
        subtitles=subtitle_text,
        card_limit=_card_candidate_target_length(fan_lang),
        language_rules=_build_language_rules(fan_lang, influencer_lang),
    )

    try:
        content = await _call_model(
            model=model,
            system_prompt=_build_system_prompt(fan_lang, influencer_lang),
            user_prompt=user_prompt,
            temperature=0.3,
            # 요약과 함께 팬 카드 문구 후보까지 받으므로 응답이 잘리지 않게 여유를 둔다.
            max_tokens=800,
        )
        result = _parse_response(content)

        if result:
            logger.info(
                "요약 생성 완료 model=%s fan_lang=%s influencer_lang=%s "
                "keywords=%s card_candidates=%s summary=%s",
                model,
                fan_lang,
                influencer_lang,
                result.get("keywords"),
                result.get("card_candidates"),
                result.get("summary", "")[:50],
            )

        return result

    except Exception:
        logger.exception("요약 생성 실패 model=%s", model)
        return None


# 생성 실패 시 재시도 횟수. 명세의 "최대 3회 자동 재시도"에 해당한다.
MAX_SUMMARY_ATTEMPTS = 3
# 재시도 사이 대기 시간(초). 모델 일시 오류가 곧바로 반복되지 않게 간격을 둔다.
RETRY_DELAY_SECONDS = 2


# 3. 전체 프로세스를 묶어줄 최상위 함수에도 @traceable을 적용할 수 있습니다.
@traceable(name="Generate and Save Summary Pipeline")
async def generate_and_save_summary(
    pool,                          # 추가 — DB 저장하려면 필요
    call_session_id: int,
    subtitles: list[dict],
    fan_lang: str | None = None,
    influencer_lang: str | None = None,
) -> None:
    """
    자막으로 요약을 만들어 저장한다.

    메모 초안은 인플루언서 언어로, 팬 카드 문구는 팬 언어로 만든다. 팬 언어를 넘겨받지
    못하면 통화 세션에 고정 저장된 값을 DB에서 읽어 채운다.

    :param pool: DB 커넥션 풀
    :param call_session_id: 요약 대상 통화 세션 식별자
    :param subtitles: 통화의 자막 목록
    :param fan_lang: 팬 언어 코드이며 없으면 DB에서 읽는다
    :param influencer_lang: 인플루언서 언어 코드이며 없으면 기본 언어로 본다
    """
    logger.info("요약 생성 시작 call_session_id=%s", call_session_id)

    if fan_lang is None:
        fan_lang = await _load_fan_lang(pool, call_session_id)

    # 백엔드가 "생성 중"과 "실패"를 구분할 수 있도록 생성 전에 상태를 먼저 남긴다.
    await queries.start_call_summary(pool, call_session_id)

    try:
        result = await _generate_with_retry(
            call_session_id, subtitles, fan_lang, influencer_lang
        )
    except Exception:
        logger.exception("요약 생성 중 예외 call_session_id=%s", call_session_id)
        await queries.fail_call_summary(pool, call_session_id, "GENERATION_ERROR")
        return

    if result is None:
        logger.warning("요약 생성 실패 또는 내용 없음 call_session_id=%s", call_session_id)
        await queries.fail_call_summary(pool, call_session_id, "GENERATION_FAILED")
        return

    summary = result.get("summary", "")
    keywords = result.get("keywords", [])
    card_candidates = _sanitize_card_candidates(
        result.get("card_candidates"),
        _card_candidate_max_length(_normalize_lang(fan_lang)),
    )

    logger.info(
        "요약 결과 call_session_id=%s summary=%s keywords=%s card_candidates=%s",
        call_session_id,
        summary,
        keywords,
        card_candidates,
    )

    await queries.complete_call_summary(
        pool=pool,
        call_session_id=call_session_id,
        summary=summary,
        keywords=keywords,
        card_candidates=card_candidates,
    )
    logger.info("요약 저장 완료 call_session_id=%s", call_session_id)


async def _load_fan_lang(pool, call_session_id: int) -> str | None:
    """
    통화 세션에 고정 저장된 팬 언어를 DB에서 읽는다.

    보통은 호출 측이 통화 중 쓰던 값을 그대로 넘겨주므로 이 경로를 타지 않는다. 언어를
    알아내지 못해 요약이 통째로 실패하는 것보다는 기본 언어로라도 만드는 편이 나으므로,
    조회가 실패하면 예외를 올리지 않고 None을 돌려준다.

    :param pool: DB 커넥션 풀
    :param call_session_id: 통화 세션 식별자
    :return: 저장된 팬 언어 코드이며 읽지 못하면 None
    """
    try:
        return await queries.get_call_session_fan_lang(pool, call_session_id)
    except Exception:
        logger.exception(
            "팬 언어 조회 실패 — 기본 언어로 요약한다 call_session_id=%s", call_session_id
        )
        return None


async def _generate_with_retry(
    call_session_id: int,
    subtitles: list[dict],
    fan_lang: str | None = None,
    influencer_lang: str | None = None,
) -> dict | None:
    """
    요약 생성만 재시도한다. 중간 실패마다 DB를 FAILED로 바꾸지 않기 위해
    모든 시도가 끝난 뒤에야 호출 측이 상태를 확정한다.

    :param call_session_id: 통화 세션 식별자
    :param subtitles: 통화의 자막 목록
    :param fan_lang: 팬 카드 문구를 적을 언어 코드
    :param influencer_lang: 메모 초안을 적을 언어 코드
    :return: 요약 결과이며 모든 시도가 실패하면 None
    """
    for attempt in range(1, MAX_SUMMARY_ATTEMPTS + 1):
        result = await generate_summary(
            subtitles, fan_lang=fan_lang, influencer_lang=influencer_lang
        )
        if result is not None:
            if attempt > 1:
                logger.info(
                    "요약 생성 재시도 성공 call_session_id=%s attempt=%s",
                    call_session_id, attempt,
                )
            return result

        if attempt < MAX_SUMMARY_ATTEMPTS:
            logger.warning(
                "요약 생성 실패 — 재시도 call_session_id=%s attempt=%s/%s",
                call_session_id, attempt, MAX_SUMMARY_ATTEMPTS,
            )
            await asyncio.sleep(RETRY_DELAY_SECONDS)

    return None
    logger.info("요약 저장 완료 call_session_id=%s", call_session_id)
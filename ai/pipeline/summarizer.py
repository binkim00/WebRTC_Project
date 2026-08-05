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
    팬이 기념 카드로 간직할 문구 후보를 골라 줍니다."""

USER_PROMPT_TEMPLATE = """아래는 인플루언서와 팬의 실시간 대화 자막입니다.

    [대화 내용]
    {subtitles}

    다음 두 가지를 작성해주세요.

    1) 팬에 대한 메모 초안 (인플루언서용)
    - 팬의 근황, 성취, 특별한 사건 (졸업, 수상, 취업 등)
    - 팬의 관심사, 좋아하는 것
    - 팬이 인플루언서에게 바라는 것, 다음에 하고 싶은 것
    - 인플루언서가 기억하면 좋을 특이사항

    2) 팬이 기념 카드로 간직할 문구 후보 3개 (팬용)
    - 반드시 **인플루언서가 실제로 한 말**에서만 고릅니다. 팬의 발화는 쓰지 않습니다.
    - 자막 문장을 거의 그대로 쓰고, 말끝이 잘렸으면 자연스럽게만 다듬습니다.
      인플루언서가 하지 않은 말을 새로 만들어내지 않습니다.
    - 팬이 나중에 다시 읽을 때 기분이 좋아지는 따뜻한 문장을 고릅니다.
    - 각 문구는 60자 이내로 합니다.
    - 전화번호, 이메일, 주소, 계정 아이디, 실명처럼 개인정보가 담긴 문장은 제외합니다.
    - 고를 만한 문장이 없으면 빈 배열로 둡니다.

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


#추후 db호출 구조에 따라 수정
def _format_subtitles(subtitles: list[dict]) -> str:
    lines = []
    for s in subtitles:
        role = "인플루언서" if s.get("speaker_role") == "INFLUENCER" else "팬"
        text = s.get("original_text", "").strip()
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines) if lines else "(대화 내용 없음)"


def _sanitize_card_candidates(raw) -> list[str]:
    """
    모델이 준 팬 카드 문구 후보를 저장 가능한 형태로 정리한다.

    프롬프트로 개수와 길이를 지시하지만 모델이 지키지 않을 수 있고, 팬에게 그대로 노출되는
    값이라 문자열이 아닌 항목·빈 문장·중복을 걸러내고 개수와 길이를 강제한다.
    """
    if not isinstance(raw, list):
        return []

    candidates: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text or len(text) > CARD_CANDIDATE_MAX_LENGTH:
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
async def generate_summary(subtitles: list[dict], model: str = MODEL) -> dict | None:
    if not subtitles:
        logger.info("자막 없음 — 요약 생략")
        return None

    if not GMS_API_KEY:
        logger.error("GMS_API_KEY가 설정되지 않음")
        return None

    subtitle_text = _format_subtitles(subtitles)
    user_prompt = USER_PROMPT_TEMPLATE.format(subtitles=subtitle_text)

    try:
        content = await _call_model(
            model=model,
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            # 요약과 함께 팬 카드 문구 후보까지 받으므로 응답이 잘리지 않게 여유를 둔다.
            max_tokens=800,
        )
        result = _parse_response(content)

        if result:
            logger.info(
                "요약 생성 완료 model=%s keywords=%s card_candidates=%s summary=%s",
                model,
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
) -> None:
    logger.info("요약 생성 시작 call_session_id=%s", call_session_id)

    # 백엔드가 "생성 중"과 "실패"를 구분할 수 있도록 생성 전에 상태를 먼저 남긴다.
    await queries.start_call_summary(pool, call_session_id)

    try:
        result = await _generate_with_retry(call_session_id, subtitles)
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
    card_candidates = _sanitize_card_candidates(result.get("card_candidates"))

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


async def _generate_with_retry(
    call_session_id: int,
    subtitles: list[dict],
) -> dict | None:
    """
    요약 생성만 재시도한다. 중간 실패마다 DB를 FAILED로 바꾸지 않기 위해
    모든 시도가 끝난 뒤에야 호출 측이 상태를 확정한다.
    """
    for attempt in range(1, MAX_SUMMARY_ATTEMPTS + 1):
        result = await generate_summary(subtitles)
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
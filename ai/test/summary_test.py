"""
요약 모델 비교 테스트.

사용법: python summary_test.py

임의의 2분 팬미팅 대화를 넣고 여러 모델의 요약 결과를 비교.
summarizer.py의 generate_summary를 그대로 사용.
모델 이름의 접두사(gpt-/claude-/gemini-)로 provider를 자동 판별하므로
MODELS 리스트에 원하는 모델 이름만 추가하면 됨.
"""

import asyncio
import time
from dotenv import load_dotenv

load_dotenv()

from pipeline.summarizer import generate_summary

# ── 테스트용 대화 데이터 (약 2분 분량) ────────────────────────────────────────

TEST_SUBTITLES = [
    {"speaker_role": "host", "original_text": "안녕하세요! 만나서 반가워요."},
    {"speaker_role": "fan", "original_text": "안녕하세요! 진짜 떨려요 드디어 만나뵙네요."},
    {"speaker_role": "host", "original_text": "어머 떨지 마세요. 편하게 얘기해요. 요즘 어떻게 지내세요?"},
    {"speaker_role": "fan", "original_text": "저 이번 달에 대학교 졸업해요! 4년 내내 팬이었는데 졸업 전에 꼭 영통 하고 싶었어요."},
    {"speaker_role": "host", "original_text": "와 졸업 축하드려요! 4년이나 팬 해주셨어요? 감동이에요."},
    {"speaker_role": "fan", "original_text": "네 1학년 때 콘서트 보고 팬 됐어요. 그때 불러주신 별빛이라는 노래가 제 인생곡이에요."},
    {"speaker_role": "host", "original_text": "별빛! 저도 그 노래 정말 좋아하는데. 다음 콘서트에서 꼭 부를게요."},
    {"speaker_role": "fan", "original_text": "진짜요? 약속이에요! 그리고 저 졸업하고 디자인 회사에 취업했어요."},
    {"speaker_role": "host", "original_text": "디자인이요? 멋지다! 어떤 디자인 하세요?"},
    {"speaker_role": "fan", "original_text": "UI/UX 디자인이요. 사실 언니 앨범 디자인 보면서 이쪽에 관심 갖게 됐어요."},
    {"speaker_role": "host", "original_text": "세상에 그런 인연이 있었군요. 나중에 우리 앨범 디자인 해주세요."},
    {"speaker_role": "fan", "original_text": "정말요? 그게 제 꿈이에요! 꼭 그렇게 하고 싶어요."},
    {"speaker_role": "host", "original_text": "그리고 혹시 다음에 팬미팅 오실 수 있어요?"},
    {"speaker_role": "fan", "original_text": "네! 8월 서울 팬미팅 꼭 갈 거예요. 포토카드도 받고 싶어요."},
    {"speaker_role": "host", "original_text": "좋아요! 그때 봐요. 오늘 정말 즐거웠어요."},
    {"speaker_role": "fan", "original_text": "저도요! 최고의 생일 선물이에요. 사실 오늘 제 생일이거든요."},
    {"speaker_role": "host", "original_text": "오늘이 생일이에요?! 생일 축하해요! 몰라서 미안해요."},
    {"speaker_role": "fan", "original_text": "아니에요 영통 자체가 선물이에요. 감사합니다 정말!"},
]

# 비교할 모델 목록 (gpt-/claude-/gemini- 접두사로 provider 자동 판별)
MODELS = [
    "gpt-4o-mini",
    "gpt-5-mini",
    "claude-sonnet-4-6",
    "gemini-2.5-flash",
]


async def test_model(model_name: str) -> None:
    print(f"\n{'='*60}")
    print(f"모델: {model_name}")
    print(f"{'='*60}")

    start = time.time()
    result = await generate_summary(TEST_SUBTITLES, model=model_name)
    elapsed = time.time() - start

    if result:
        print(f"소요시간: {elapsed:.2f}초")
        print(f"summary : {result.get('summary')}")
        print(f"keywords: {result.get('keywords')}")
    else:
        print(f"실패 ({elapsed:.2f}초)")


async def main() -> None:
    print("대화 내용:")
    print("-" * 40)
    for s in TEST_SUBTITLES:
        role = "인플루언서" if s["speaker_role"] == "host" else "팬"
        print(f"{role}: {s['original_text']}")
    print("-" * 40)

    for model in MODELS:
        await test_model(model)

    print(f"\n{'='*60}")
    print("테스트 완료")


if __name__ == "__main__":
    asyncio.run(main())
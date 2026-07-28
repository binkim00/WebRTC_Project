import os
from dotenv import load_dotenv
load_dotenv()

from google.cloud import speech

client = speech.SpeechClient()

# 실제로 짧은 무음 오디오를 보내서 인증 확인
config = speech.RecognitionConfig(
    encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
    sample_rate_hertz=16000,
    language_code="ko-KR",
)
audio = speech.RecognitionAudio(content=b"\x00" * 3200)  # 무음 데이터

try:
    response = client.recognize(config=config, audio=audio)
    print("API 호출 성공:", response)
except Exception as e:
    print("API 호출 실패:", e)
FROM python:3.11-slim

WORKDIR /app

# livekit-agents 가 콘솔 모드용으로 sounddevice 를 끌고 온다. 리눅스 wheel 은 PortAudio 를
# 번들하지 않고 시스템 라이브러리를 요구하므로(윈도우 wheel 은 번들해서 로컬에서는 안 걸린다)
# 미리 넣어 둔다. start 모드에서는 지연 import 라 안 걸릴 수도 있지만, 걸리면 기동 즉시 죽는다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libportaudio2 \
 && rm -rf /var/lib/apt/lists/*

# requirements.txt(직접 의존성 목록) 대신 lock 을 설치한다. livekit-agents 는 0.x 와 1.x 의
# API 가 서로 달라 범위 지정(>=0.12.0)으로 두면 빌드 시점마다 다른 버전이 들어온다.
# 로컬에서 검증된 조합은 livekit-agents 1.6.6 / livekit 1.1.13 이다.
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock

COPY . .

CMD ["python", "agent.py", "start"]
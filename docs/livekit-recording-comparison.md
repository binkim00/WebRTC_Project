# 영상통화 녹화 방식 비교 및 전환 기준

## 결론

현재 4 vCPU 운영 서버에서는 브라우저 녹화를 기본값으로 유지한다. LiveKit Egress는
클라이언트 종료와 무관하게 안정적으로 MP4를 만들고 양쪽 영상을 합성할 수 있지만, 단일
Room Composite 작업이 평균 약 1.80 CPU 코어, 순간 최대 약 2.75 코어를 사용했다. 따라서
Egress는 동시 작업 1건 제한과 장애 복구가 검증된 뒤 제한적으로 켜고, 여러 팬미팅을 동시에
녹화하려면 Egress worker를 별도 서버로 분리한다.

## 동일 기준 비교

| 기준 | 브라우저 MediaRecorder + 업로드 | LiveKit Room Composite Egress |
| --- | --- | --- |
| 녹화 실행 위치 | 팬 브라우저 | 서버 Egress worker |
| 현재 영상 구성 | 인플루언서 원격 영상 1개 + 양쪽 오디오 | 방 레이아웃에 포함된 양쪽 영상·오디오 |
| 결과 형식 | 브라우저 지원에 따라 WebM 또는 MP4 | H.264/AAC MP4로 고정 |
| 클라이언트 종료·새로고침 | 메모리 chunk와 업로드 기회를 잃을 수 있음 | 서버 작업은 계속 진행 가능 |
| 통화 종료 후 처리 | 전체 Blob을 팬이 업로드 | worker가 공유 저장소에 직접 기록 |
| 팬 단말 부하 | 인코딩, 메모리 chunk, 업로드 사용 | 일반 LiveKit 송수신 외 녹화 부하 없음 |
| 서버 부하 | 업로드 수신·파일 저장 위주 | Chromium 합성·인코딩 CPU 부하 큼 |
| 브라우저 호환성 | MediaRecorder 코덱 지원에 영향받음 | 팬 브라우저 녹화 API와 무관 |
| 진행 상태 추적 | 업로드 성공 시 바로 AVAILABLE | STARTING → RECORDING → PROCESSING → AVAILABLE/FAILED |
| 운영 복잡도 | 낮음 | worker, Redis, webhook, 공유 볼륨, 동시성 제한 필요 |

## PoC 수치

실제 운영 서버에서 2 publisher와 2 subscriber가 참여한 96.456초 Room Composite 녹화를
측정했다.

- 결과: H.264 1280×720 30fps + AAC 44.1kHz MP4, 30,008,141 bytes
- 패킷 손실: subscriber 8개 수신 트랙 모두 0%
- Egress CPU: 평균 179.87%(약 1.80 코어), 최대 275.45%(약 2.75 코어)
- Egress 메모리: 평균 442.09 MiB, 최대 470.40 MiB
- 전체 호스트 CPU: 평균 48.72%, 최대 60.10%
- LiveKit CPU: 평균 12.56%, 최대 14.49%

이 수치는 단일 녹화의 기능 가능성을 보여줄 뿐 동시 2건 이상의 안전성을 보장하지 않는다.

## 장애 영향 비교

| 장애 | 브라우저 방식 | Egress 방식 |
| --- | --- | --- |
| 팬 탭 닫힘·브라우저 종료 | 녹화 또는 업로드 유실 가능 | 녹화 지속 가능 |
| 팬 네트워크 단절 | 마지막 업로드 실패 가능 | 서버가 받은 트랙까지 기록 가능 |
| backend 재시작 | 종료 업로드 API가 잠시 실패할 수 있음 | 이미 시작한 worker는 계속될 수 있으나 상태 조정 필요 |
| Egress worker 자원 부족 | 영향 없음 | 녹화만 FAILED, 통화는 계속 유지해야 함 |
| 공유 볼륨 누락 | 영향 없음 | 완료 웹훅 후 파일 검증에서 FAILED |
| webhook 중복·역순 | 영향 적음 | 멱등 상태 전환과 재조회 필요 |

## 모드 전환 규칙

운영 Compose의 단일 변수 `RECORDING_EGRESS_ENABLED`를 backend 런타임 플래그와 frontend
빌드 인자에 함께 전달한다.

| 값 | backend | frontend | 결과 |
| --- | --- | --- | --- |
| `false` | Egress 시작 안 함 | MediaRecorder 사용 | 기존 브라우저 녹화 |
| `true` | 동의된 통화에 Egress 시작 | MediaRecorder 중지 | Egress만 녹화 |

frontend 값은 Vite 빌드 시 고정되므로 플래그 변경 뒤 frontend 이미지를 다시 빌드해야 한다.
backend와 frontend의 값이 다르면 녹화 누락 또는 이중 녹화가 생길 수 있으므로 배포 전
두 컨테이너의 설정을 함께 검증한다.

## Egress 전환 승인 조건

1. 동시에 시작되는 두 번째 녹화를 애플리케이션과 worker 양쪽에서 거부한다.
2. 시작 RPC 실패, worker 종료, webhook 유실·중복, 파일 누락을 자동으로 FAILED 또는 복구
   가능한 상태로 정리한다.
3. 녹화 실패가 LiveKit 통화 종료나 다음 팬 입장에 영향을 주지 않는다.
4. CPU 포화 기준과 즉시 중단 절차를 모니터링·운영 문서에 명시한다.
5. frontend와 backend가 같은 Egress 플래그로 배포됐음을 확인한다.


# LiveKit Egress 운영 서버 자원 점검

## 점검 결과

2026-08-04 운영 서버에서 유휴 상태의 단일 스냅샷을 측정했다.

| 항목 | 측정값 | PoC 판정 |
| --- | ---: | --- |
| 논리 CPU | 4 vCPU | 제한적으로 가능 |
| 시스템 부하 | 0.05 / 0.10 / 0.04 | 유휴 상태 |
| 전체 메모리 | 15 GiB | 가능 |
| 사용 가능 메모리 | 약 11 GiB | 가능 |
| Swap | 없음 | 주의 필요 |
| 루트 디스크 | 309 GB | 가능 |
| 디스크 여유 | 275 GB | 가능 |
| 기존 녹화 파일 | 129 MB | 영향 작음 |
| Docker 이미지 | 4.211 GB | 영향 작음 |
| Docker 빌드 캐시 | 24.03 GB | 필요 시 22.38 GB 회수 가능 |

현재 주요 컨테이너 메모리는 backend 약 709 MiB, Jenkins 약 743 MiB, MySQL 약
596 MiB, LiveKit 약 40 MiB다. 이후 2명이 접속한 90초 Room Composite 테스트에서
Egress CPU는 평균 약 1.80코어, 최대 약 2.75코어였고 호스트 CPU는 평균 48.72%,
최대 60.10%였다. 상세 결과는 `livekit-egress-poc-result.md`에 기록했다.

## 자원 제한 확인

현재 backend, LiveKit, frontend, nginx, Jenkins, Portainer, Redis, MySQL 컨테이너에는
CPU 및 메모리 상한이 설정되어 있지 않다. Egress가 인코딩 중 CPU를 많이 사용하면
LiveKit과 backend가 함께 영향을 받을 수 있다.

## 판정

같은 서버에서 Room Composite Egress **1건 PoC는 가능**하다. 다만 공식 기본 CPU 비용이
3코어이고 서버 전체가 4 vCPU이므로 다음 조건을 지켜야 한다.

1. 실제 팬미팅이 없는 시간에만 PoC를 실행한다.
2. 동시 Egress 작업은 1건으로 제한한다.
3. 녹화 중 `docker stats`와 LiveKit 연결 품질을 함께 관찰한다.
4. CPU 포화나 통화 품질 저하가 발생하면 즉시 Egress를 중지한다.
5. 이 결과만으로 같은 서버 운영 배치를 확정하지 않는다.

메모리와 디스크는 단일 녹화 PoC에 충분하다. 다만 단일 작업도 순간적으로 약 2.75코어를
사용했으므로 현재 4 vCPU 서버에서 2건 이상 동시 녹화는 허용하지 않는다. 운영에서 여러
녹화를 동시에 수행해야 한다면 Egress worker를 별도 서버로 분리하는 것을 우선 검토한다.

## 3단계 적용 조건

- Egress 서비스는 PoC용 profile 또는 명시적 실행 대상으로 두어 평상시 자동 기동하지 않는다.
- 세션 최대 시간과 작업 동시성을 제한한다.
- 기존 브라우저 녹화는 유지한다.
- 출력은 `/srv/melly/uploads` 아래의 별도 PoC 경로에 저장한다.
- 운영 배포 스크립트의 기본 `up` 대상에는 Egress를 아직 포함하지 않는다.

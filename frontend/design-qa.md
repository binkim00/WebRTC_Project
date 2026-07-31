# Design QA

- source visual truth path: `C:\Users\SSAFY\.codex\visualizations\2026\07\23\019f8cfe-7be8-7e41-9bcb-cf8e2e08d0d7\source-desktop.png`
- implementation screenshot path: `C:\Users\SSAFY\.codex\visualizations\2026\07\23\019f8cfe-7be8-7e41-9bcb-cf8e2e08d0d7\implementation-desktop-final.png`
- combined comparison path: `C:\Users\SSAFY\.codex\visualizations\2026\07\23\019f8cfe-7be8-7e41-9bcb-cf8e2e08d0d7\design-qa-comparison-final.png`
- mobile screenshots:
  - `C:\Users\SSAFY\.codex\visualizations\2026\07\23\019f8cfe-7be8-7e41-9bcb-cf8e2e08d0d7\implementation-mobile-hero.png`
  - `C:\Users\SSAFY\.codex\visualizations\2026\07\23\019f8cfe-7be8-7e41-9bcb-cf8e2e08d0d7\implementation-mobile-menu.png`
  - `C:\Users\SSAFY\.codex\visualizations\2026\07\23\019f8cfe-7be8-7e41-9bcb-cf8e2e08d0d7\implementation-mobile-family.png`
- desktop viewport: 1440 × 900 CSS px
- mobile viewport: 390 × 844 CSS px
- source pixels: 1440 × 900
- implementation pixels: 1440 × 900
- density normalization: 동일 CSS viewport와 동일 캡처 픽셀 크기로 비교
- state: 고정 헤더가 보이는 핑크색 선언문 섹션, 모바일 메뉴 열림 상태, 모바일 팬 스토리 상태

## Full-view comparison evidence

원본과 구현 화면을 한 장에 좌우로 배치해 비교했다. 두 화면 모두 고정형 상단 메뉴, 핑크색 전체 화면 배경, 중앙의 매우 큰 응축 영문 타이포그래피, 비스듬히 겹친 이미지, 라임색 강조 요소를 사용한다. 원본 자산과 브랜드 문구는 복사하지 않고 MELLY의 로컬 이미지와 팬미팅 콘텐츠로 대체했다.

## Focused region comparison evidence

핵심 시각 요소인 헤더, 대형 타이포그래피, 콜라주 이미지와 강조 배지가 1440 × 900 비교 화면에서 충분히 크게 확인되어 별도 확대 비교는 필요하지 않았다. 모바일에서는 히어로, 전체 메뉴, 캐러셀을 각각 별도로 캡처했다.

## Required fidelity surfaces

- Fonts and typography: 첫 구현의 Arial 기반 대형 문자가 원본보다 넓어 보인 문제를 확인해 영문 디스플레이 텍스트를 `Impact`, `Arial Narrow` 순서로 변경했다. 작은 UI 문구와 한국어는 가독성 높은 시스템 폰트를 유지했다.
- Spacing and layout rhythm: 긴 전체 화면 섹션, 넓은 여백, 이미지 겹침과 대형 제목의 밀도를 원본 흐름에 맞췄다. 모바일은 가로 오버플로 없이 375px 콘텐츠 폭 안에 정리된다.
- Colors and visual tokens: 원본의 핑크·라임·검정·연보라 대비를 MELLY용 로컬 CSS 변수로 재구성했다. 텍스트와 컨트롤 대비는 충분하다.
- Image quality and asset fidelity: 외부 이미지를 핫링크하거나 복사하지 않았다. 프로젝트에 이미 포함된 고해상도 MELLY 이미지 4개만 사용했으며 각 슬롯에 맞춰 `object-fit`과 비율을 조정했다.
- Copy and content: 원본 상품·아티스트 문구를 복제하지 않고 MELLY 팬미팅 탐색, 인플루언서 소개, 팬의 기억, 이벤트 참여 흐름으로 전환했다.

## Comparison history

### Iteration 1

- [P2] 모바일 메뉴 오버레이가 본문 아래에 합성되는 문제
  - Fix: 페이지에 독립 stacking context를 만들고, 본문·드로어·헤더의 z-index 계층을 명시했다.
  - Post-fix evidence: `implementation-mobile-menu.png`에서 라임색 전체 화면 메뉴와 네 개 링크가 본문을 완전히 덮는다.
- [P2] 대형 영문 제목이 원본보다 넓어 구조적 밀도가 떨어지는 문제
  - Fix: 디스플레이 제목에 응축형 시스템 폰트 스택을 적용했다.
  - Post-fix evidence: `design-qa-comparison-final.png`에서 제목 폭과 행간이 원본의 압축된 리듬에 가까워졌다.

## Findings

- P0/P1/P2: 남은 문제 없음.
- [P3] 원본의 맞춤 일러스트 대신 MELLY 로컬 사진과 캐릭터를 사용해 콜라주 밀도는 더 단순하다. 저작권과 브랜드 구분을 위한 의도적 차이다.

## Primary interactions tested

- 전체 화면 메뉴 열기·닫기
- 메뉴에서 페이지 내부 섹션 이동
- 팬 이야기 이전·다음 버튼
- 팬 이야기 인디케이터 상태 변경
- 데스크톱 1440 × 900 반응형 렌더링
- 모바일 390 × 844 반응형 렌더링
- 브라우저 콘솔 오류 및 경고 없음

## Implementation checklist

- [x] 기존 홈과 분리된 예시 라우트
- [x] 고정 헤더와 전체 메뉴
- [x] 장문 스크롤 내러티브
- [x] 이벤트 카드와 내부 링크
- [x] 팬 이야기 캐러셀
- [x] 데스크톱·모바일 레이아웃
- [x] 키보드 포커스가 가능한 버튼과 링크
- [x] 린트·TypeScript·프로덕션 빌드

final result: passed

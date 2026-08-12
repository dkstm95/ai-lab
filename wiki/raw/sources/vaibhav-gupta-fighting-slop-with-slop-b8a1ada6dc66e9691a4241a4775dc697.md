# Vaibhav Gupta: Fighting Slop with Slop Source Note

Supplied video: https://youtu.be/bKT2wOec_rg?si=xL1qoZKJ2YqESDV0
Supplied video title: [한영자막] 슬롭에는 슬롭으로 맞섭니다 — Vaibhav Gupta, Boundary
Supplied video publisher: Tech Bridge
Supplied video published: 2026-08-08
Supplied video duration: 21:02
Canonical event stream: https://www.youtube.com/watch?v=htM02KMNZnk
Canonical event stream title: WF2026: Software Factories & Keynotes ft. Microsoft, OpenAI, OpenClaw, Z.ai (GLM), MiniMax, HF
Canonical publisher: AI Engineer
Speaker: Vaibhav Gupta
Organization: Boundary
Talk: Fighting Slop with Slop
Event: AI Engineer World's Fair 2026
Supporting field guide: https://analoghq.ai/aie-2026
Secondary transcript-based note: https://www.80aj.com/2026/07/02/vaibhav-gupta-slop-slop/
Retrieved: 2026-08-12

## Ingest Focus

이 노트는 AI가 만든 코드를 사람이 모두 읽기 어려워진 상황에서 Boundary가 구조적 품질을 유지하는 방식을 정리한다. 발표자가 말한 팀 규칙, 설계 문서, 자동 검사, 에이전트 평가, 에이전트 중심 언어 설계를 서로 다른 실천으로 보존한다.

## Structured Notes

### 슬롭을 읽지 않은 코드로 정의한다

- Gupta는 슬롭을 단순히 보기 싫은 AI 코드가 아니라 사람이 읽지 않은 코드로 정의한다.
- 이 정의는 생성 주체보다 검토 가능성과 신뢰 형성에 초점을 둔다. 사람이 작성했어도 아무도 읽지 않았다면 같은 문제가 생긴다.
- 그는 코드 생성 속도가 계속 높아지므로 지금이 코드베이스에 읽지 않은 코드가 가장 적은 시점일 수 있다고 경고한다.

### 도구 선택보다 불변 규칙을 통일한다

- Boundary는 팀원에게 하나의 AI 코딩 도구를 강제하지 않는다. 발표자는 구성원이 원하는 도구를 쓰되 시스템의 불변 규칙을 지키게 한다고 설명한다.
- 작은 `architecture.md`는 컴파일러와 주요 계층의 안정된 책임과 의존 방향만 기록한다. 도구별 사용 절차나 자주 바뀌는 세부 사항은 이 문서에 섞지 않는다.
- 의존 관계 시각화와 CI 검사는 에이전트가 새 패키지나 계층 간 의존을 추가할 때 구조 규칙 위반을 잡는다.
- Supporting field guide는 이 검사 체계를 도입한 뒤 핵심 구조가 3~4개월 동안 안정적으로 유지됐다는 발표 내용을 기록한다.

### 설계 문서를 사람이 실제로 읽게 만든다

- Boundary는 Notion과 GitHub에 흩어진 설계 토론을 버전 관리되는 Markdown 문서와 Slack에서 읽기 쉬운 표시 방식으로 바꿨다.
- 설계 문서를 다루는 CLI는 사람과 에이전트가 같은 기록을 읽고 갱신할 수 있게 한다.
- 새 문서와 변경 사항을 알리는 Slack 채널은 회사에서 가장 많이 읽는 채널이 되었다고 발표자는 말한다.
- 이 과정의 목적은 문서를 많이 만드는 데 있지 않다. 구현 전에 사람이 설계 의도와 구조를 읽고 판단하게 만드는 데 있다.

### 에이전트 출력도 비교 가능한 공학 대상으로 만든다

- 발표는 LLM 함수의 프롬프트, 도구 호출, 구조화된 출력, 실패 지점을 실행 기록으로 남겨야 개선할 수 있다고 주장한다.
- 한 에이전트가 만든 실행 기록을 다른 에이전트가 읽고 오류, 환각, 언어 기능 사용을 찾을 수 있다.
- 서로 다른 스킬, 프롬프트, 모델을 도구 호출 수, 오류 수, 결과 정확도와 같은 지표로 비교하면 A/B 테스트와 회귀 검사가 가능해진다.
- 두 번째 에이전트의 주관적 승인만으로는 검증이 되지 않는다. 스키마 적합성, 테스트 통과, 도구 호출 결과처럼 사람이 다시 확인할 수 있는 근거가 필요하다.

### 에이전트가 쓰는 기반 언어를 다시 설계한다

- Gupta는 TypeScript를 포함한 기존 언어가 사람의 생산성과 이전 언어의 호환성을 중심으로 발전했기 때문에 암묵적 형 변환과 누적된 예외가 남아 있다고 지적한다.
- 발표에 나온 Bamboo는 사람의 편의만이 아니라 에이전트가 만든 코드를 신뢰하기 위한 엄격함을 설계 목표로 둔 언어다. Boundary는 별도로 BAML 생태계를 개발한다.
- 발표가 소개한 기능에는 저비용 실행 추적, 의미 기반 코드 검색, 자동 CLI 노출, 빠짐없는 오류 추론, 타입이 보존되는 여러 언어 간 연동이 포함된다.
- 타입 시스템 데모는 0으로 나누기와 같이 정적으로 알 수 있는 실패를 실행 전에 드러내는 방향을 보여준다.
- Supporting field guide는 한 에이전트가 Bamboo로 부분적인 C 컴파일러를 하루 안에 만들었다는 발표 사례를 기록한다. 이는 발표자의 사례이며 독립적으로 재현된 성능 검증은 아니다.

## Practical Interpretation

- AI 도구를 하나로 통일하기 전에 저장소가 반드시 지켜야 할 계층, 의존 방향, 데이터 규칙을 작고 검사 가능한 형태로 정의한다.
- `architecture.md`에는 오래 유지할 구조만 남긴다. 작업 절차와 세부 지침은 에이전트가 검색할 수 있는 별도 설계 문서로 분리한다.
- 생성량이 늘어날수록 코드 리뷰를 단순히 생략하지 않는다. 사람의 판단을 설계 단계로 옮기고 CI, 타입 검사, 실행 추적과 비교 평가가 반복 검사를 맡게 한다.
- 에이전트가 다른 에이전트를 평가할 때는 설명형 점수보다 테스트 결과, 스키마 위반, 도구 호출 수, 재현 가능한 실패를 남기게 한다.
- 기존 언어와 도구에서 반복되는 오류가 프롬프트로 해결되지 않으면 더 엄격한 타입, API, 코드 생성 계층에서 오류 가능성 자체를 줄인다.

## Source Limits

- supplied video는 원본 발표의 한국어·영어 자막 편집본이다. 이 노트는 해당 영상의 화면, 설명, 챕터와 원본 행사 스트림을 확인하고 두 개의 외부 요약으로 세부 구조를 대조해 작성한 의역이다.
- 영상의 transcript API는 수집 시 빈 응답을 반환했다. 이 노트는 전체 자막을 보존하거나 발언을 그대로 옮긴 기록이 아니다.
- 코드 리뷰 기간, 구조 안정 기간, Slack 사용량, 컴파일러 구현 시간, 제품 기능은 발표자 또는 행사 요약의 보고다. 수집 과정에서 Boundary의 저장소나 운영 환경으로 재현하지 않았다.
- 코드 리뷰를 생략하는 방식은 명시적 구조, 자동 검사, 추적과 팀 책임이 함께 있을 때의 사례다. 일반적인 무검토 배포 권고로 해석하면 안 된다.
- Bamboo, BAML과 관련 도구의 이름과 기능은 2026년 8월 이후 바뀔 수 있다.

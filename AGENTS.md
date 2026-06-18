# AI 작업 지침

이 문서는 AI 작업자의 문서 지도다.
작업 전 필요한 문서만 골라 읽는다.

## 문서 지도

- `README.md`: 프로젝트 목적, 빠른 실행, CLI/service 사용법
- `README.ko.md`: 한국어 프로젝트 개요와 빠른 실행
- `docs/system-design.md`: monorepo 구조, 패키지 책임, 의존 방향, provider 방식
- `docs/development-guide.md`: 설치, 실행, 검증, Git hook 기준
- `docs/testing-guide.md`: 테스트 작성과 리뷰 기준
- `docs/contribution-guide.md`: Spring Framework를 참고한 commit, PR, review 기준
- `packages/wiki/src/index.ts`: LLM Wiki 저장 구조, page schema, lint 규칙

## 작업 기준

- 코드 변경 후 관련 문서가 최신인지 확인한다.
- 실행과 검증 기준은 `docs/development-guide.md`를 따른다.
- 테스트 작성 기준은 `docs/testing-guide.md`를 따른다.
- 커밋, PR, 리뷰 기준은 `docs/contribution-guide.md`를 따른다.
- 패키지 책임과 의존 방향은 `docs/system-design.md`를 따른다.
- wiki에 글, 출처, 답변을 추가하는 요청은 먼저 `packages/wiki/src/index.ts`의 schema와 lint 규칙을 확인하고 `workspace.root/wiki` 구조에 맞춘다.
- 새 명령, 패키지, 문서 지도가 바뀌면 `pnpm docs:check`가 통과하도록 관련 문서를 함께 갱신한다.
- Markdown은 짧고 직관적으로 쓴다. 같은 설명을 여러 문서에 반복하지 말고, 자세한 기준은 해당 주제 문서에만 둔다.
- 분기, 상태, 예외 처리, 중복 테스트를 줄인다.
- 의미 있는 동작은 package public API로 드러내고, incidental helper는 local로 둔다.
- 함수는 15~25라인, parameter 4개 이하를 기본 기준으로 삼는다.
- 실제 API 호출, 구독 기반 외부 runner 호출, 네트워크 의존 테스트는 기본 검증 경로에 넣지 않는다.
- provider SDK는 `packages/model-providers` 안에 격리한다.
- CLI/service adapter에 핵심 로직을 직접 넣지 않는다.

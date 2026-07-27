# AI 작업 지침

이 문서는 AI 작업자의 진입점이다.
작업 전 `SOUL.md`를 먼저 읽고, 작업 성격에 따라 필요한 SSOT 문서만 추가로 읽는다.

## 항상 먼저 읽기

- `SOUL.md`: 사용자의 공개 가능한 판단 기준, 작업 선호, AI 위임 기준

## 작업별 참조

- 프로젝트 목적, 빠른 실행, CLI/service 사용법: `README.md`, `README.ko.md`
- 문서, Wiki, README 등 사람이 읽는 글의 작성, 수정, 검토: `$hope:write`
- monorepo 구조, 패키지 책임, 의존 방향, provider 방식: `docs/system-design.md`
- 설치, 실행, 검증, Git hook 기준: `docs/development-guide.md`
- 테스트 작성과 리뷰 기준: `docs/testing-guide.md`
- 외부 runner 규약, 동의, 신뢰 경계: `docs/external-runner.md`
- Codex·Claude 구독 CLI runner 설정과 제한: `docs/subscription-runner.md`
- commit, PR, review 기준: `docs/contribution-guide.md`
- 작업 회고, memory 후보, 승인 기반 자가진화 정책: `docs/self-evolution-guide.md`
- 개인 맥락 기억 prototype의 목표, 비목표, 저장/검색/평가 기준: `docs/subbrain-design.md`
- LLM Wiki 저장 구조, page schema, lint 규칙: `packages/wiki/src/index.ts`

## Wiki 기억 사용

- 구현, 리뷰, 판단 작업을 시작할 때 현재 요청과 관련된 승인 기억이 있을 수 있으면 `pnpm cli wiki memory retrieve "<요청 요약>"`로 최대 3개를 확인한다.
- 검색된 기억은 지침 보조 자료다. 현재 사용자 요청, 상위 지침, SSOT, 확인된 근거가 항상 우선한다.
- 기존 Wiki page의 비파괴 재생성·비교: `docs/wiki-rebuild.md`

공통 글쓰기 원칙의 SSOT는 Hope의 `write` 기능이다. 이 저장소에는 출처,
claim 상태, 승인 흐름처럼 ai-lab에만 필요한 규칙을 둔다. Hope를 쓸 수 없는
provider-neutral Wiki 작업은 `packages/wiki/src/index.ts`의 fallback 제약을 따른다.

## 우선순위

상위 시스템 지침, 보안 정책, 사용자 명시 지시, `SOUL.md`, 작업별 SSOT 문서 순서로 따른다.
세부 규칙은 각 SSOT 문서를 기준으로 하며, 이 파일에 반복해 적지 않는다.

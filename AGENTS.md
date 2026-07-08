# AI 작업 지침

이 문서는 AI 작업자의 진입점이다.
작업 전 `SOUL.md`를 먼저 읽고, 작업 성격에 따라 필요한 SSOT 문서만 추가로 읽는다.

## 항상 먼저 읽기

- `SOUL.md`: 사용자의 공개 가능한 판단 기준, 작업 선호, AI 위임 기준

## 작업별 참조

- 프로젝트 목적, 빠른 실행, CLI/service 사용법: `README.md`, `README.ko.md`
- monorepo 구조, 패키지 책임, 의존 방향, provider 방식: `docs/system-design.md`
- 설치, 실행, 검증, Git hook 기준: `docs/development-guide.md`
- 테스트 작성과 리뷰 기준: `docs/testing-guide.md`
- commit, PR, review 기준: `docs/contribution-guide.md`
- 작업 회고, memory 후보, 승인 기반 자가진화 정책: `docs/self-evolution-guide.md`
- 개인 맥락 기억 prototype의 목표, 비목표, 저장/검색/평가 기준: `docs/subbrain-design.md`
- LLM Wiki 저장 구조, page schema, lint 규칙: `packages/wiki/src/index.ts`

## 우선순위

상위 시스템 지침, 보안 정책, 사용자 명시 지시, `SOUL.md`, 작업별 SSOT 문서 순서로 따른다.
세부 규칙은 각 SSOT 문서를 기준으로 하며, 이 파일에 반복해 적지 않는다.

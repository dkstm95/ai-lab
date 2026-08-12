---
title: "Vaibhav Gupta: Fighting Slop with Slop"
slug: vaibhav-gupta-fighting-slop-with-slop
kind: source
status: active
createdAt: 2026-08-12T05:52:12.055Z
updatedAt: 2026-08-12T05:55:00.000Z
reviewAfter: 2027-02-12T00:00:00.000Z
sources:
  - raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
---

## Summary

Vaibhav Gupta는 에이전트가 만든 코드를 사람이 모두 읽을 수 없을 때 구조적 품질을 지키는 방법을 설명한다. 작은 구조 문서, 기계가 검사하는 불변 규칙, 사람이 읽는 설계 문서, 비교 가능한 실행 기록과 엄격한 언어 설계가 핵심이다. 이 방식은 코드 리뷰를 단순히 없애는 것이 아니라 사람의 판단을 설계 단계로 옮기고 반복 검사를 자동화한다.

## Key Claims

- accepted: Gupta는 슬롭을 생성 주체와 관계없이 사람이 읽지 않은 코드로 정의한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: Boundary는 팀원에게 하나의 에이전트 코딩 도구를 강제하는 대신 시스템의 불변 규칙을 지키게 한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: 작은 `architecture.md`는 주요 언어 처리 계층의 안정된 책임과 의존 방향만 기록한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: 의존 관계 시각화와 CI 검사는 에이전트가 구조 규칙을 어기는 의존을 추가할 때 이를 감지한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: 발표자는 구조 검사 체계를 도입한 뒤 핵심 구조가 3~4개월 동안 안정적으로 유지됐다고 보고한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: Boundary는 설계 토론을 버전 관리되는 Markdown 문서와 Slack에서 읽기 쉬운 표시 방식으로 바꿨다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: 발표자는 설계 문서 알림 채널이 회사에서 가장 많이 읽는 Slack 채널이 되었다고 말한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: 실행 기록을 남기면 다른 에이전트가 실패와 환각을 찾고 서로 다른 스킬, 프롬프트와 모델을 비교할 수 있다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: 에이전트 평가는 주관적 승인보다 스키마 적합성, 테스트 통과 여부, 도구 호출과 같이 다시 확인할 수 있는 근거를 남겨야 한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: Gupta는 TypeScript를 비롯한 기존 언어의 암묵적 형 변환과 누적된 예외를 에이전트가 대량으로 증폭할 수 있다고 지적한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: 발표에 나온 Bamboo는 저비용 실행 추적, 의미 기반 코드 검색, 자동 CLI 노출, 빠짐없는 실패 추론과 타입이 보존되는 여러 언어 간 연동을 목표로 한다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md
- accepted: 타입 시스템 데모는 0으로 나누기와 같이 정적으로 알 수 있는 실패를 실행 전에 드러내는 방향을 보여준다.
  source: raw/sources/vaibhav-gupta-fighting-slop-with-slop-b8a1ada6dc66e9691a4241a4775dc697.md

## Application Notes

- hypothesis: 에이전트 도구를 통일하기 전에 저장소가 반드시 지켜야 할 계층, 의존 방향과 스키마 제약을 작고 검사 가능한 형태로 정의한다.
- hypothesis: `architecture.md`에는 오래 유지할 구조만 남기고 작업 절차와 세부 지침은 에이전트가 검색할 수 있는 설계 문서로 분리한다.
- hypothesis: 생성량이 늘어날수록 사람의 판단을 설계 단계로 옮기고 CI, 타입 검사, 실행 추적과 비교 평가가 반복 검사를 맡게 한다.
- hypothesis: 에이전트가 다른 에이전트를 평가할 때는 설명형 점수보다 테스트 통과 여부, 스키마 위반, 도구 호출 수와 재현 가능한 실패를 남기게 한다.
- hypothesis: 프롬프트로 같은 실패에 반복 대응하기보다 더 엄격한 타입, API와 코드 생성 계층에서 실패 가능성을 줄인다.

## Source Limits

이 source note는 supplied video의 화면, 설명과 챕터를 원본 행사 스트림 및 외부 요약 두 개와 대조해 의역했다. 전체 자막은 보존하지 않았다. 코드 리뷰 기간, 구조 안정 기간, Slack 사용량, 구현 시간과 도구 기능은 발표자 또는 행사 요약의 보고이며 수집 과정에서 독립적으로 재현하지 않았다. 이 사례는 명시적 구조, 자동 검사, 추적과 팀 책임 없이 코드 리뷰를 생략하라는 권고가 아니다.

## Links

- [[human-steering-coding-workflow]]

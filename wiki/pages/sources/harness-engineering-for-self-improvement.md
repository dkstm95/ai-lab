---
title: Harness Engineering for Self-Improvement
slug: harness-engineering-for-self-improvement
kind: source
status: active
createdAt: 2026-08-10T12:44:00.460Z
updatedAt: 2026-08-10T12:44:00.460Z
reviewAfter: 2027-02-06T12:44:00.460Z
sources:
  - raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
---

## Summary

Lilian Weng은 기반 LLM과 실제 환경 사이의 실행 계층을 하네스라고 정의하고, 이를 재귀적 자기 개선(RSI)의 실용적인 단기 기반으로 본다. 글은 하네스 설계 패턴, 최적화 단계, 자동 연구와 자기 개선 사례, 실패 요인, 인간의 통제 지점을 함께 정리한다.

## Key Claims

- accepted: 하네스는 기반 LLM을 둘러싸며 실행을 조정하고, 계획, 도구 호출, 행동, 컨텍스트 구성, 산출물 저장과 검증 방식을 결정한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 현대의 하네스 공학은 LLM, 기억, 도구, 계획을 결합하는 초기 에이전트 틀에 워크플로 설계, 검증, 권한 통제, 지속 기록을 더한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 범용 하네스는 복잡한 내부 로직을 감추면서 단순한 인터페이스를 제공해야 하며, 글은 이를 운영체제와 유사한 설계 문제로 본다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 자동화 워크플로의 기본 반복 구조는 목표를 세우고, 실행하고, 관찰하거나 시험하고, 개선한 뒤 다시 실행하는 과정이다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 장기 작업에서는 전체 로그를 컨텍스트에 계속 넣기보다 실험 기록, 코드 변경, 논문 요약, 오류 추적, 과거 실행 이력을 파일로 보존해야 한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 서브에이전트 병렬 실행은 명시적이고 점검 가능해야 하며, 산출물을 파일, 로그, 진행 기록으로 남겨야 중단 뒤에도 복구하고 실행 이력을 분석할 수 있다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 주요 코딩 에이전트의 표준 인터페이스는 파일 시스템, 셸, 코드와 Git 도구, 외부 컨텍스트, 웹, 산출물, 백그라운드 작업, 에이전트 위임으로 수렴하고 있다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 글은 LLM이 곧바로 자기 파라미터를 다시 쓰는 경로보다 하네스를 개선해 자동 연구를 가능하게 하고, 더 나은 LLM이 다시 하네스의 과도한 복잡성을 줄이는 경로를 단기적인 RSI 시나리오로 제시한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 하네스의 최적화 대상은 지시 프롬프트에서 구조화된 컨텍스트, 워크플로, 하네스 코드, 최적화기 코드로 확장된다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: Agentic Context Engineering은 컨텍스트를 길어지는 단일 프롬프트가 아니라 식별자가 있는 항목형 플레이북으로 갱신하고, 결정적 병합으로 반복 재작성에서 생기는 컨텍스트 붕괴를 줄인다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: Meta Context Engineering은 컨텍스트 구성 메커니즘과 내용을 분리해 함께 최적화하며, Meta-Harness는 무엇을 저장하고 검색해 LLM에 보여 줄지를 정하는 코드 자체를 최적화 대상으로 삼는다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: ADAS와 AFlow 같은 접근은 에이전트 워크플로 설계를 코드로 표현한 탐색 문제로 바꾸고, 후보를 실행하고 검증해 더 나은 구조를 선택한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: Self-Harness는 검증기로 확인한 실패 패턴을 찾고, 편집 범위를 제한한 변경을 제안한 뒤, held-in과 held-out 시험 모두에서 회귀가 없는 후보만 받아들이는 반복 구조를 사용한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: Agentic Harness Engineering은 편집 가능한 구성 요소, 실행 경험, 변경 결정을 각각 관찰 가능하게 만들고, 각 변경을 근거와 다음 검증에서 확인할 예측에 묶는다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 자기 개선 반복 과정이 보상 해킹으로 채점기나 실행 조건을 바꾸지 못하게 하려면 실행 기록, 추적기, 검증기, LLM 설정을 편집 범위 밖의 읽기 전용 표면으로 두어야 한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 진화 탐색은 후보를 자동으로 채점하고 적합도를 수치화하기 쉬운 문제에 잘 맞지만, 채점이 느리거나 모호하거나 휴리스틱에 의존하는 영역에서는 효율과 신뢰성이 떨어진다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: STOP 실험은 재귀 구조만으로 개선이 보장되지 않으며 기반 LLM이 개선 메커니즘을 다룰 만큼 충분히 유능해야 함을 보여 준다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 하네스를 유용하게 수정하는 능력과 수정된 하네스를 실제 작업에서 활용하는 능력은 독립된 축이므로 따로 측정해야 한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 글은 하네스와 LLM 파라미터를 한 반복에서 함께 최적화하는 방향을 초기 단계로 보며, SIA 실험은 LLM 구성과 약한 기준선 때문에 증거가 아직 잠정적이라고 판단한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 남은 과제는 약하고 모호한 채점기, 컨텍스트와 기억의 수명 주기, 실패 기록의 보존, 다양성 붕괴, 보상 해킹, 장기적인 성공 기준, 인간의 역할이다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 저자는 검증기와 권한 통제를 자기 개선 반복 과정 밖에 두고, held-out 시험, 실행 추적 감사, 중요한 결정 지점의 인간 검토를 결합할 것을 제안한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html
- accepted: 인간의 역할은 반복 과정에서 사라지는 것이 아니라 더 적절한 시점과 추상화 수준에서 감독하고 방향을 정하는 쪽으로 이동해야 한다.
  source: raw/sources/harness-engineering-for-self-improvement-45bc3793c36e42f79749f84af5107617.html

## Source Limits

- hypothesis: 이 글은 여러 연구를 엮은 조사와 저자의 해석이므로, 개별 방법의 성능이나 재현성을 판단할 때는 원 논문과 구현을 다시 확인해야 한다.
- hypothesis: 2026년의 사전 공개 논문, LLM 비교, 벤치마크 수치는 바뀔 수 있으므로 정식 근거로 사용할 때 최신 상태를 검증해야 한다.
- hypothesis: 객관적인 검증기가 있는 작업에서 얻은 자기 개선 성과를 연구 취향이나 장기 유지보수처럼 판단 기준이 모호한 영역에 그대로 일반화할 수 없다.

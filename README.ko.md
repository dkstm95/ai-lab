# ai-lab

AI 아이디어를 직접 구현하고 테스트하기 위한 TypeScript-first 개인 실험실이다.

English guide: `README.md`

이 저장소는 특정 실험 하나를 위한 프로젝트가 아니다. CLI, 로컬 HTTP 서비스, 모델 provider routing, agent 실행 흐름, workspace 파일 관리, local tool을 작게 갖춘 monorepo 기반을 제공한다. 실제 API provider와 구독 기반 외부 runner는 기본 검증 경로에서 제외하고, fake provider로 재현 가능한 smoke/test 흐름을 유지한다.

## 빠른 실행

```bash
pnpm install
pnpm check
pnpm cli --help
pnpm cli run hello "hello"
pnpm coverage
```

로컬 서비스를 실행한다.

```bash
pnpm service:dev
```

기본 endpoint:

- `GET /health`
- `POST /agent/hello`
- `GET /subbrain`

`/subbrain`은 로컬 prototype page다. 내부 JSON route는 데모 helper이며
안정적인 product API가 아니다.

## 구조

```text
apps/cli                 터미널 진입점
apps/service             Hono 기반 로컬 HTTP 서비스
packages/protocol        패키지 간 통신 규약과 schema
packages/config          환경 설정과 모델 profile 설정
packages/model-providers provider adapter와 routing
packages/agent-runtime   모델/tool 실행 흐름
packages/workspace       workspace root와 path helper
packages/wiki            local markdown LLM Wiki workspace
packages/subbrain        개인 사건 기억 prototype
packages/local-tools     agent runtime이 호출할 수 있는 local tool
docs/                    설계, 개발, 테스트 가이드
```

## Hope

외부 [Hope](https://github.com/dkstm95/hope) plugin으로 AI 코드 작업 전후의
사람 의도와 이해를 연결한다.

- `$hope:align`은 구현 전에 해결되지 않은 판단을 드러내고 사용자가 승인한
  의도를 변경 불가능한 revision으로 고정한다.
- `$hope:diff`는 정확한 로컬 변경에 review를 묶고, 승인된 의도가 있으면 실제
  구현과 비교하며, 근거 기반 설명·자동 채점 퀴즈·인터랙티브 microworld를
  만든다.

관계의 방향은 `$hope:align`에서 `$hope:diff`로 향한다. `$hope:diff`가 코드 결함이나 의도
변경 필요성을 드러낼 수는 있지만 승인된 의도를 몰래 고치지 않는다. 의도를
바꾸려면 사용자가 새 revision을 승인해야 한다. `$hope:align` 없이 `$hope:diff`만
사용할 수도 있다.

Hope의 비공개 작업 bundle은 review와 merge가 끝날 때까지 로컬에 유지한다.
생성 bundle은 기본적으로 commit하지 않고, 명시적으로 보존하지 않았다면 merge
후 전체를 폐기한다. 오래 남길 지식만 test, 코드 주석, ADR, runbook, commit,
pull request처럼 이미 책임이 정해진 위치로 승격한다. Alpha는 활성 Codex 구독
session을 사용하며 `packages/agent-runtime`과 그 fake provider 밖에서 동작한다.

## LLM Wiki 흐름

LLM Wiki는 agent 내부 tool로 관리하지만, 승인된 wiki page는 사람이 다시 읽고 질문할 수 있는 지식이다. Agent는 `packages/local-tools`를 통해 source 등록, ingest/query/evolve task packet 생성, 재사용 답변 파일링, 검증된 wiki update 적용, lint, run 기록을 수행한다. 사람이 직접 쓰는 wiki CLI는 두지 않는다.

반복 사용할 코드는 `packages/*`에 둔다. 사람이 직접 실행해야 하는 흐름만 `apps/cli` 또는 `apps/service`에서 노출한다. provider SDK나 외부 runner 세부사항은 `packages/model-providers` 안에 격리한다.

## 검증

```bash
pnpm check
```

`pnpm check`는 format, lint, dependency boundary, typecheck, test, build, docs check를 실행한다. 문서와 실제 script가 어긋나면 실패해야 한다.

## 문서

- `README.md`
- `README.ko.md`
- `docs/system-design.md`
- `docs/development-guide.md`
- `docs/testing-guide.md`
- `docs/contribution-guide.md`
- `docs/self-evolution-guide.md`
- `docs/subbrain-design.md`
- `AGENTS.md`

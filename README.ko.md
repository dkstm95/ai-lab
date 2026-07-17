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

## DiffScope

AI 코드 작업 하나가 완료되면 변경을 승인하거나 commit하기 전에 외부
[DiffScope](https://github.com/dkstm95/diff-scope) plugin의 `$diff`를 사용한다.
현재 로컬 working-tree 변경을 세 파일로 만든다.

- `explanation.md`: 근거와 before-to-after 흐름을 담은 설명 문서
- `artifact.json`: 검증된 provider-neutral `ArtifactV1` 데이터
- `index.html`: offline 자동 채점 퀴즈와 인터랙티브 microworld

Alpha는 활성 Codex 구독 session을 사용하고 완료된 한 작업 단위의
`HEAD -> working tree`만 지원한다. DiffScope는 별도 공개 저장소가 SSOT이므로
ai-lab도 다른 project와 같은 공개 도구를 소비한다. fake provider를 쓰는
`packages/agent-runtime`에는 포함되지 않는다.

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

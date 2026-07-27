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

## LLM Wiki 흐름

LLM Wiki는 관리 영역에 복사한 source와 사람이 읽을 수 있는 재사용 markdown 지식을 저장한다. 현재 구현은 안전한 답변 proposal·승격 기반이며, 실행 가능한 LLM workflow는 아직 아니다. 신뢰된 integration만 workspace 내부 source를 등록한다. Wiki package의 agent-safe tool factory는 ingest/query/evolve task packet 생성과 답변 proposal 준비까지만 할 수 있고 source를 가져오거나 답변을 직접 승격할 수 없다. 아직 기본 runtime에는 연결하지 않았다. 현재 approval/promotion 경로는 재사용 답변 proposal에만 구현돼 있다. 신뢰된 호출자가 사람이 proposal의 정확한 digest를 검토했다고 확인하면, wiki package는 그 확인을 검증하지만 reviewer를 직접 인증하지는 않는다. 이어서 target/source hash와 전체 candidate를 다시 검증하고 검토된 byte만 승격한 뒤 audit log를 직접 append한다. Wiki lint는 source traversal, directory, symbolic link도 거부한다. 사람이 직접 쓰는 wiki CLI는 아직 두지 않는다.

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

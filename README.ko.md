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

LLM Wiki는 관리 영역에 복사한 source와 사람이 읽을 수 있는 재사용 markdown 지식을
저장한다. 답변 흐름은 모델 API를 호출하지 않으며 한 AI 업체에 의존하지 않는다.

```bash
pnpm cli wiki init
pnpm cli wiki source add notes.md --title "조사 노트"
pnpm cli wiki answer task "무엇을 재사용 지식으로 남길까?" \
  --sources <source-id> --out task.json

# .ai-lab/wiki-exchange/task.json의 prompt를 원하는 AI에 전달한다.
# AI가 반환한 JSON을 .ai-lab/wiki-exchange/result.json으로 저장한다.

pnpm cli wiki answer propose \
  --task task.json --result result.json --out proposal.json
pnpm cli wiki answer review proposal.json
pnpm cli wiki answer apply proposal.json \
  --reviewer "<이름>" --accept-digest "<검토한-전체-digest>"
```

task에는 선택한 source 원문이 들어간다. 구독형 서비스나 다른 모델에 전달하기 전에
내용을 확인해야 한다. 같은 result 규약을 웹 구독, 로컬 모델, 향후 신뢰된 외부 runner가
공유한다. task와 proposal 생성은 실제 Wiki page를 바꾸지 않는다. apply는 사람이 검토한
전체 digest를 요구한다. 이후 현재 Wiki, source hash, candidate lint, 검토한 byte를 다시
확인하고 승격과 audit 기록을 수행한다.

source 선택은 신뢰된 integration이 소유한다. agent-safe tool은 source를 가져오거나 외부
전달용 task를 만들거나 proposal을 apply할 수 없다. 경로 이탈, symbolic link, 오래된 task,
알 수 없는 evidence ID, 과도하게 큰 artifact, 잘못된 교환 데이터는 거부한다.

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

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

# 또는 감사한 wrapper로 result.json을 만든다. 첫 실행은 정확한 runner
# manifest를 공개하며 두 digest가 일치하지 않으면 실행하지 않는다.
pnpm cli wiki answer run \
  --task task.json --out result.json \
  --runner-id my-wrapper \
  --runner-executable /absolute/path/to/my-wrapper \
  --runner-args-json '[]' \
  --runner-trusted-files-json '[]' \
  --accept-task-digest "<전체-task-digest>" \
  --trust-runner my-wrapper \
  --accept-runner-digest "<공개된-전체-runner-digest>"

pnpm cli wiki answer propose \
  --task task.json --result result.json --out proposal.json
pnpm cli wiki answer review proposal.json
pnpm cli wiki answer apply proposal.json \
  --reviewer "<이름>" --accept-digest "<검토한-전체-digest>"
```

task에는 선택한 source 원문, Wiki schema와 index, 최대 5개의 관련 page가 들어간다.
구독형 서비스나 다른 모델에 전달하기 전에 공개 내용을 확인해야 한다. 같은 엄격한 result
규약을 웹 구독, 로컬 모델, 신뢰된 runner wrapper가 공유한다. task와 proposal 생성은 실제
Wiki page를 바꾸지 않는다. host의 runner 흐름은 result artifact만 만들며 proposal과
apply는 별도 명령으로 남는다.

외부 runner는 ai-lab의 stdin/stdout envelope를 구현해야 한다. 공식 AI CLI가 이 규약을
직접 구현한다고 가정하면 안 된다. provider adapter는 해당 CLI와 별도 로그인을 감싸는
감사된 wrapper다. ai-lab은 API key를 요구하지 않지만, wrapper가 구독 또는 API 과금 중
어느 경로를 사용했는지 증명하지도 못한다.

저장소에는 정확한 버전을 고정한 Codex와 Claude 구독 CLI profile이 포함된다. ai-lab에
API key를 주지 않고 별도로 로그인한 계정을 사용한다. 설정법, 지원 버전, 중요한 한계는
`docs/subscription-runner.md`에 정리되어 있다.

wrapper는 sandbox가 아니라 같은 사용자 권한으로 실행되는 신뢰된 프로그램이다. 따라서
사용자의 파일, credential, process, network에 접근하거나 이를 바꿀 수 있다. 비공개 임시
작업 디렉터리와 새 환경변수 집합은 우발적인 노출을 줄일 뿐 그 접근을 막지 않는다.
취소 뒤에도 runner의 독립 descendant가 남을 수 있다. 동의 전에 실행 파일과 정확한
runner digest를 검토해야 한다. 상세 규약은 `docs/external-runner.md`에 있다.

apply는 사람이 검토한 전체 digest를 요구한다. 이후 현재 Wiki, source hash, candidate
lint, 검토한 byte를 다시 확인하고 승격과 audit 기록을 수행한다.

기존 source·concept page의 비파괴 재생성, 비교, digest 승인 기반 승격 절차는
`docs/wiki-rebuild.md`에 있다.

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
- `docs/external-runner.md`
- `docs/subscription-runner.md`
- `docs/contribution-guide.md`
- `docs/self-evolution-guide.md`
- `docs/subbrain-design.md`
- `AGENTS.md`

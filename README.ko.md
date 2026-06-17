# ai-lab

AI 아이디어를 직접 구현하고 테스트하기 위한 TypeScript-first 개인 실험실이다.

English guide: `README.md`

이 저장소는 특정 실험 하나를 위한 프로젝트가 아니다. CLI, 로컬 HTTP 서비스, 모델 provider routing, agent 실행 흐름, workspace 파일 관리, local tool을 작게 갖춘 monorepo 기반을 제공한다. 실제 API provider와 구독 기반 외부 runner는 기본 검증 경로에서 제외하고, fake provider로 재현 가능한 smoke/test 흐름을 유지한다.

## 빠른 실행

```bash
pnpm install
pnpm check
pnpm cli --help
pnpm cli idea add "LLM Wiki" --source "https://example.com"
pnpm cli idea list
pnpm cli run hello "hello"
pnpm coverage
```

로컬 서비스를 실행한다.

```bash
pnpm service:dev
```

기본 endpoint:

- `GET /health`
- `GET /ideas`
- `POST /agent/hello`

## 구조

```text
apps/cli                 터미널 진입점
apps/service             Hono 기반 로컬 HTTP 서비스
packages/protocol        패키지 간 통신 규약과 schema
packages/config          환경 설정과 모델 profile 설정
packages/model-providers provider adapter와 routing
packages/agent-runtime   모델/tool 실행 흐름
packages/workspace       ideas/files 작업공간
packages/local-tools     agent runtime이 호출할 수 있는 local tool
ideas/                   아이디어 메모와 구현 계획
docs/                    설계, 개발, 테스트 가이드
```

## 아이디어 추가 흐름

아이디어는 markdown 문서로 기록한다.

```bash
pnpm cli idea add "My AI idea" --source "https://example.com" --notes "First notes"
```

반복 사용할 코드는 `packages/*`에 둔다. 사람이 실행하는 흐름은 `apps/cli` 또는 `apps/service`에서 노출한다. provider SDK나 외부 runner 세부사항은 `packages/model-providers` 안에 격리한다.

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
- `AGENTS.md`

## Project Instructions

공통 프로젝트 규칙은 아래 파일을 따른다: @AGENTS.md

## Claude Code Configuration

### Skills
| Skill | 트리거 조건 |
|-------|------------|
| `commit` | "커밋해줘", 작업 완료 후 커밋 필요 시 |
| `release` | "릴리즈해줘", 새 버전 배포 시 |
| `build-fix` | 빌드 에러 발생 시 |
| `code-review` | 커밋 전 코드 리뷰 요청 시 |
| `tdd` | 새 기능/함수 구현 시 TDD 적용 |
| `obsidian-cli` | Obsidian vault 조작 시 |
| `frontend-design` | UI/컴포넌트 작성 시 |
| `readme-guide` | README 작성/수정 시 |


### Agents

특정 역할에 특화된 서브에이전트. Task 도구로 spawn된다.

| Agent | 역할 |
|-------|------|
| `ts-developer` | TypeScript 구현 |
| `code-reviewer` | 코드 리뷰 |
| `tester` | 테스트 작성/실행 |
| `planner` | 구현 계획 수립 |
| `obsidian-researcher` | Obsidian API 조사 |
| `ux-ui-specialist` | UX/UI 설계 |

### Hooks (`.claude/hooks/`)

- `lint-check.sh` — 코드 변경 후 lint 자동 실행
- `post-build-reload.sh` — 빌드 후 Obsidian 플러그인 리로드
- `stop-verify.sh` — 세션 종료 전 검증

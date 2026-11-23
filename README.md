# whycommit

AI가 설명해 주는 도구가 아니라, AI가 **묻는** 도구입니다.

커밋과 PR 시점에 에이전트가 면접 질문처럼 "왜 이렇게 했어요?"라고 물어서, 내가 만든 코드를 내가 이해하고 넘어가게 돕습니다.

> 이 README는 초안입니다. 첫 버전을 만드는 중이라, 설치 명령과 동작을 확인한 환경은 검증이 끝나면 갱신합니다.

## 왜 만들었나

바이브 코딩을 하다 보면 AI가 알려 준 대로 만들고 넘어가기 쉽습니다. "왜 이렇게 했지?", "다른 방법은 없었나?"를 고민하지 않으면 코드는 돌아가도 내 것이 되지 않습니다.

whycommit은 이 고민을 커밋과 PR이라는 자연스러운 멈춤 지점에 끼워 넣습니다. 에이전트가 정답을 먼저 알려 주는 대신 먼저 묻고, 내가 답하지 못한 부분만 해설하고, 나중에 다시 물어봅니다.

- 커밋 제목 추천은 부가 기능입니다. 핵심은 **퀴즈와 복습**입니다.
- 점수나 등급은 없습니다. "모르겠다"도 괜찮습니다. 모의 면접을 봐 주는 선배처럼 묻습니다.
- 대신 채점은 엄격합니다. 핵심 이유를 말하지 못한 애매한 답을 맞다고 해 주지 않습니다.

## 무엇을 하나

| 스킬 | 언제 쓰나 | 하는 일 |
|---|---|---|
| `commit` | 자주, 가볍게 | 스테이징된 변경을 읽고 커밋 제목 후보 3개를 보여 줍니다. 고른 제목을 확인받은 뒤 커밋합니다. |
| `quiz` | 작업 단위가 끝났을 때 | 마지막 퀴즈 이후의 변경에서 설계 결정을 뽑아 2~5문제를 묻습니다. 결과를 학습 노트에 남기고, PR 본문이나 커밋 본문에 들어갈 기록 초안을 만듭니다. |
| `review` | 원할 때 | 이해하지 못했던 주제를 다른 각도로 다시 묻습니다. 맞히면 "이해한 내용"으로 옮깁니다. |

질문은 세 종류뿐입니다.

- **왜 이렇게 했나**: 이 선택의 이유
- **다른 방법은 없나**: 대안과 장단점
- **이게 없으면 어떻게 되나**: 동작 원리

"무엇을 바꿨나"처럼 diff만 읽으면 답할 수 있는 질문이나, 변경과 상관없는 CS 암기 질문은 하지 않습니다.

## 사용 예시

아래는 동작 방식을 보여 주기 위한 예시입니다.

### commit

```text
> /whycommit:commit

스테이징된 파일 2개: src/auth/session.js, src/auth/session.test.js
최근 커밋은 "feat: ..." 형식에 한국어로 쓰여 있어요.

커밋 제목 후보
1. feat: 401 응답을 받았을 때만 토큰 갱신
2. feat: 세션 만료 시 토큰 자동 갱신
3. refactor: 토큰 갱신 로직을 세션 모듈로 분리
4. 직접 입력
5. 다시 생성

> 1

이 제목으로 커밋할게요. 본문은 비워 둡니다.
  feat: 401 응답을 받았을 때만 토큰 갱신
진행할까요?

> 응

커밋했어요. 퀴즈를 안 본 커밋이 3개 있어요.
```

### quiz

```text
> /whycommit:quiz

지금 브랜치는 feat/token-refresh, 기본 브랜치는 main이에요.
1. PR 모드로 진행 (추천)
2. 마무리 모드로 진행

> 1

main에서 갈라진 뒤의 커밋 3개를 볼게요. 3문제 낼게요.

[1/3] src/auth/session.js 42~58줄
토큰을 요청마다 갱신하지 않고, 401 응답을 받았을 때만 갱신하게 했네요.
왜 이렇게 했어요?

> 매번 갱신하면 서버에 요청이 너무 많이 가서요.

방향은 맞아요. 하나만 더 물어볼게요.
요청 5개가 동시에 401을 받으면 갱신 요청은 몇 번 나가나요?

> 음... 모르겠어요.

괜찮아요, 이 부분은 같이 보고 넘어가요.
지금 코드에서는 5번 나가요. 요청마다 따로 refreshToken()을 부르기 때문이에요.
(정답과 이유, 다른 방법과 장단점을 이어서 설명합니다)

...

오늘 한 작업과 남은 작업 초안이에요. 고칠 부분이 있으면 말해 주세요.
```

### review

```text
> /whycommit:review

이 프로젝트에서 다시 볼 주제가 4개 있어요. 여러 번 놓쳤거나 오래된 것부터 볼게요.

[1/4] 동시에 온 401 응답과 중복 토큰 갱신
지난번에는 "몇 번 나가나"를 물었죠. 이번에는 다르게 물어볼게요.
src/auth/session.js의 refreshPromise 변수를 지우면 어떤 일이 생기나요?

...

2개 해결, 2개 남음
```

## 필요한 것

- **git**
- **Claude Code**: 플러그인으로 설치할 때. 다른 에이전트는 [지원 에이전트](#지원-에이전트)를 보세요.
- **Node.js 18 이상**: 학습 노트와 상태를 다루는 스크립트를 실행합니다. 외부 패키지는 설치하지 않습니다. `node --version`으로 확인할 수 있고, 없으면 스킬이 설치 방법을 안내하고 멈춥니다.
- **GitHub CLI(`gh`), 로그인 상태**: PR 모드에서만 필요합니다. 없으면 마무리 모드로 진행하거나 PR 본문만 만들어 볼 수 있습니다.
  - 설치: `winget install --id GitHub.cli` (Windows), `brew install gh` (macOS)
  - 로그인: `gh auth login`

## 설치

<!-- TODO(GitHub 공개 후): roof1004/whycommit에서 실제로 설치되는지 확인한다. 로컬 마켓플레이스로는 확인함. -->

### Claude Code 플러그인 (추천)

터미널에서 두 줄로 설치합니다.

```sh
claude plugin marketplace add roof1004/whycommit
claude plugin install whycommit@whycommit
```

Claude Code 안에서 설치해도 됩니다.

```text
/plugin marketplace add roof1004/whycommit
/plugin install whycommit@whycommit
```

Claude Code v2.1.292 이상이면 한 줄로도 됩니다.

```sh
claude plugin install whycommit --marketplace roof1004/whycommit
```

설치한 뒤 Claude Code를 다시 시작하거나 `/reload-plugins`를 실행하면 `/whycommit:commit`, `/whycommit:quiz`, `/whycommit:review`로 부를 수 있습니다. 기본으로는 모든 프로젝트에서 켜집니다. 한 프로젝트에서만 쓰려면 그 프로젝트 폴더에서 두 명령에 `--scope project`를 붙이세요.

### 플러그인 없이 (Agent Skills 표준 스킬로)

플러그인을 쓰지 않거나, 다른 에이전트에서 쓸 때의 방법입니다.

```sh
git clone https://github.com/roof1004/whycommit.git
node whycommit/tools/install-skills.mjs --dest ~/.claude/skills   # Claude Code
node whycommit/tools/install-skills.mjs --dest ~/.agents/skills   # .agents/skills를 읽는 에이전트
```

- 스킬은 `whycommit-commit`, `whycommit-quiz`, `whycommit-review`라는 이름으로 설치됩니다. `commit`, `review` 같은 짧은 이름은 다른 스킬이나 에이전트의 내장 명령과 겹치기 쉽기 때문입니다. 예를 들어 Claude Code에서 `/review`는 이미 내장 명령입니다.
- 같은 이름의 다른 스킬이 이미 있으면 아무것도 설치하지 않고 멈춥니다. 다른 접두사를 쓰려면 `--prefix my-`, 그래도 바꾸려면 `--force`를 붙입니다.
- `--dry-run`을 붙이면 어디에 설치될지만 보여 줍니다.
- 업데이트는 `git pull` 뒤에 같은 명령을 다시 실행하면 됩니다.

### 업데이트

직접 만든 마켓플레이스는 자동 업데이트가 기본으로 꺼져 있습니다. 새 버전이 나오면 업데이트합니다.

```sh
claude plugin marketplace update whycommit
claude plugin update whycommit@whycommit
```

`/plugin`의 Marketplaces 화면에서 자동 업데이트를 켤 수도 있습니다.

### 지우기

```sh
claude plugin uninstall whycommit@whycommit
claude plugin marketplace remove whycommit
```

학습 노트(`~/whycommit`)는 지워지지 않습니다. 필요 없으면 그 폴더를 직접 지우세요.

### 문제 해결

- **`gh`나 `node`를 설치했는데 명령을 못 찾는다**: 설치하기 전에 열려 있던 터미널과 편집기는 예전 PATH를 계속 씁니다. VS Code 같은 편집기는 창을 모두 닫고 다시 켜세요. 편집기 안에서 새 터미널 탭만 여는 것으로는 안 됩니다.
- **`marketplace add`가 SSH 오류로 실패한다**: GitHub SSH 키가 없으면 환경변수 `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`을 설정하고 다시 실행하세요.
- **스크립트를 실행할 때마다 권한을 묻는다**: whycommit은 `node .../wc.mjs` 명령으로 기록을 다룹니다. 권한 확인 창에서 이 명령을 계속 허용하도록 고를 수 있습니다.

## 사용법

| 명령 | 설명 |
|---|---|
| `/whycommit:commit` | 커밋 제목 후보를 보고 골라서 커밋합니다. 퀴즈는 내지 않고 푸시도 하지 않습니다. |
| `/whycommit:quiz` | 쌓인 변경으로 퀴즈를 봅니다. 작업 브랜치에서는 PR 모드, 기본 브랜치에서는 마무리 모드를 제안합니다. |
| `/whycommit:review` | 지금 프로젝트에서 이해하지 못한 주제를 복습합니다. 레포 밖에서 실행하면 모든 프로젝트가 대상입니다. |
| `/whycommit:review 전체` | 모든 프로젝트의 주제를 복습합니다. |

### quiz의 두 가지 모드

- **PR 모드**: 퀴즈가 끝나면 PR 제목과 본문을 제안합니다. 이미 PR이 있으면 본문 전체를 덮어쓰지 않고 whycommit 부분만 갱신합니다.
- **마무리 모드**: 마지막 커밋을 아직 푸시하지 않았다면 그 커밋의 메시지 본문에 기록합니다. 이미 푸시했다면 커밋은 건드리지 않고 학습 노트에만 남깁니다.

### 안전장치

- 커밋, 푸시, PR 생성과 수정은 항상 미리보기를 보여 주고 확인을 받은 뒤 실행합니다.
- 강제 푸시는 하지 않습니다. 이미 푸시한 커밋은 수정하지 않습니다.

## 학습 노트는 어디에 저장되나

홈 폴더의 `whycommit` 폴더에 저장됩니다.

- macOS, Linux: `~/whycommit/`
- Windows: `C:\Users\<사용자 이름>\whycommit\`

```text
whycommit/
├── config.json              설정
├── tmp/                     실행 중에만 쓰는 임시 파일 (끝나면 지워짐)
└── projects/
    └── <owner>/<repo>/      프로젝트마다 하나
        ├── notes.md         읽기용 학습 노트
        ├── notes.json       학습 노트 원본 (스크립트가 관리)
        └── state.json       마지막으로 퀴즈를 본 커밋 등
```

- 레포 밖에 저장되므로 **GitHub에 올라가지 않고, 스테이징될 일도 없습니다.** 데이터 폴더가 git 레포 안에 있으면 저장을 거부합니다. 홈 폴더 자체를 git으로 관리한다면 `WHYCOMMIT_HOME` 환경변수로 레포 밖의 다른 폴더를 지정하세요.
- 노트는 `notes.md`를 열어서 읽습니다. 이 파일은 기록할 때마다 다시 만들어지므로 직접 고쳐도 덮어써집니다. 채점이 틀렸다고 생각하면 퀴즈 중에 이의를 제기하세요.
- 프로젝트는 원격 저장소 이름(`owner/repo`)으로 구분합니다. 원격이 없으면 폴더 이름을 씁니다.

## 설정

`~/whycommit/config.json`은 첫 실행 때 기본값으로 만들어집니다. 처음에는 아무것도 묻지 않습니다.

| 키 | 기본값 | 설명 |
|---|---|---|
| `quiz.minQuestions`, `quiz.maxQuestions` | 2, 5 | 문제 수 범위. 설계 결정의 수에 따라 이 범위에서 정합니다. |
| `quiz.followUpsPerQuestion` | 1 | 답이 맞지만 얕을 때 한 번 더 묻는 횟수입니다. |
| `body.includeLearning` | `false` | 켜면 PR이나 커밋 본문에 이해한 내용과 이해하지 못한 내용의 주제를 한 줄씩 넣습니다. |
| `review.count` | 5 | review 한 번에 묻는 주제 수입니다. |
| `language` | `"auto"` | 사용자가 쓰는 언어를 따라갑니다. `"ko"`, `"en"`처럼 고정할 수도 있습니다. |
| `writingStyle` | `""` | 기록 초안을 쓸 때 "앞으로도 이렇게 써줘"라고 하면 저장됩니다. |

파일을 직접 고치다 값이 잘못되면, whycommit은 파일을 덮어쓰지 않고 그 값만 기본값으로 쓰면서 알려 줍니다.

## 동작을 확인한 환경

<!-- TODO(7단계): 검증이 끝나면 결과로 바꾼다. -->

| 환경 | 상태 |
|---|---|
| macOS (zsh, bash) | 확인 예정 |
| Windows PowerShell | 확인 예정 |
| Windows Git Bash | 확인 예정 |
| Linux | 확인 예정 |

스크립트 테스트는 GitHub Actions에서 위 네 환경으로 자동 실행합니다.

## 한계

- **퀴즈 답을 AI에게 물어보는 건 막을 수 없습니다.** whycommit은 강제하는 도구가 아니라, 멈춰서 생각하게 만드는 도구입니다.
- **학습 노트는 내 컴퓨터에만 있습니다.** 컴퓨터를 바꾸면 노트가 사라질 수 있습니다.
- 채점은 에이전트의 판단이라 틀릴 수 있습니다. 동의하지 않으면 문제마다 한 번 반론할 수 있습니다.

## 지원 에이전트

<!-- TODO(7단계): 검증 후 "Claude Code에서 검증함"으로 바꾼다. -->

- **Claude Code**: 첫 버전은 Claude Code에서 검증합니다.
- **Codex 등 다른 에이전트**: 표준 형식([Agent Skills](https://agentskills.io))으로 만들어서 동작할 가능성이 높지만, 아직 확인하지 못했습니다. 테스트 결과를 이슈로 알려 주시면 반영하겠습니다.

## 레포 구조

```text
whycommit/
├── .claude-plugin/
│   ├── plugin.json        플러그인 매니페스트 (버전은 여기 한 곳에만)
│   └── marketplace.json   같은 레포를 마켓플레이스로 쓰기 위한 목록
├── skills/                Agent Skills 표준 스킬
│   ├── commit/            SKILL.md, scripts/
│   ├── quiz/              SKILL.md, scripts/, references/
│   └── review/            SKILL.md, scripts/, references/
├── src/                   스크립트 원본. 고칠 때는 여기만 고칩니다
├── shared/                여러 스킬이 함께 쓰는 문서의 원본 (채점 기준)
├── tools/
│   ├── sync-skills.mjs    원본을 스킬 폴더로 복사
│   └── install-skills.mjs 플러그인 없이 표준 스킬로 설치
├── test/                  스크립트·스킬 형식 테스트
└── docs/plan.md           기획 문서
```

버전을 올릴 때는 `.claude-plugin/plugin.json`의 `version`만 바꿉니다. 버전이 같으면 이미 설치한 사람에게 업데이트가 가지 않습니다.

## 개발

필요한 것은 Node.js 18 이상과 git뿐입니다. 외부 패키지는 쓰지 않습니다.

```sh
node test/run.mjs                   # 스크립트 테스트
node tools/sync-skills.mjs          # 원본을 각 스킬 폴더로 복사
node tools/sync-skills.mjs --check  # 사본이 원본과 같은지 확인 (CI에서도 실행)
```

각 스킬은 자기 폴더 밖을 참조하지 않아야 하기 때문에(Agent Skills 표준) 스킬마다 사본을 둡니다. 원본만 고치고 동기화 도구로 복사합니다.

| 원본 | 사본 |
|---|---|
| `src/` | `skills/*/scripts/` (모든 스킬) |
| `shared/references/grading.md` | `skills/quiz/references/`, `skills/review/references/` (채점 기준) |

스크립트 규칙:

- 실행은 항상 `node <경로>/wc.mjs <명령>`으로 합니다. 실행 권한이나 셔뱅에 기대지 않습니다.
- 인자에는 ASCII 옵션과 경로만 넣습니다. 질문·답·해설 같은 내용은 UTF-8 파일로 넘깁니다.
- 결과는 JSON 하나로 출력합니다. 종료 코드는 성공 0, 실패 1, 사용법 오류 2입니다.
- 파일은 BOM 없는 UTF-8, LF로 씁니다.

## 라이선스

[MIT](LICENSE) © roof1004

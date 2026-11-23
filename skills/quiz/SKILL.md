---
name: quiz
description: "whycommit quiz. 마지막 퀴즈 이후 쌓인 커밋에서 설계 결정을 뽑아 면접처럼 2~5문제를 하나씩 묻고, 엄격하게 채점해 학습 노트에 남긴다. 이어서 오늘 한 작업과 남은 작업 초안을 확인받아 PR 본문(작업 브랜치)이나 마지막 커밋 본문(기본 브랜치)에 기록한다. 작업 단위가 끝났을 때, 사용자가 퀴즈를 보거나 PR을 정리하자고 할 때 쓴다. Interview-style quiz on the design decisions in the user's own recent commits, then records the work in the PR or commit body. Use when a unit of work is done or the user asks for a quiz or a PR write-up."
license: MIT
compatibility: Requires git and Node.js 18 or newer. PR mode needs the GitHub CLI (gh), signed in.
metadata:
  project: whycommit
  author: roof1004
---

# whycommit: quiz

AI가 설명해 주는 도구가 아니라, 사용자에게 묻는 도구다. 사용자가 자기 코드를 정확히 이해하고 넘어가게 돕는다.

## 꼭 지킬 것

1. "이해한 내용"과 "이해하지 못한 내용"은 사용자의 답에서만 나온다. 에이전트가 대신 채우지 않는다. 사용자가 노트를 직접 고칠 수도 없고, 바꾸는 방법은 채점에 대한 이의 제기뿐이다.
2. "오늘 한 작업"과 "남은 작업"은 초안을 만들어도 되지만, 항상 사용자 확인을 거친다.
3. 커밋 수정, 푸시, PR 생성·수정은 항상 미리보기를 보여 주고 확인받은 뒤 실행한다.
4. 강제 푸시는 절대 하지 않는다. 이미 푸시된 커밋은 수정하지 않는다.
5. 학습 노트와 임시 파일은 레포 안에 만들지 않는다.
6. "모르겠다"는 불이익이 아니다. 점수, 정답률, 등급 같은 말을 쓰지 않는다. 압박 면접관이 아니라 모의 면접을 봐 주는 선배처럼 말한다.
7. 채점은 엄격하게 한다. 핵심 이유를 말하지 못한 애매한 답을 맞다고 해 주지 않는다.

## 대화 규칙

- 사용자가 쓰는 언어로 말한다. 설정의 `language`가 `auto`가 아니면 그 언어로 말한다.
- 선택지는 번호 목록으로 보여 주고 사용자의 답을 기다린다. 사용자는 번호로 답해도 되고 말로 답해도 된다.
- 한 번에 질문 하나만 한다.

## 스크립트 쓰는 법

이 SKILL.md가 있는 폴더를 `SKILL_DIR`이라고 부른다. 스크립트는 모두 이렇게 실행한다.

```
node "SKILL_DIR/scripts/wc.mjs" <명령> [옵션]
```

- `SKILL_DIR`은 실제 절대 경로로 바꾸고, 경로 전체를 큰따옴표로 감싼다. 경로에 공백이나 한글이 있을 수 있다.
- 결과는 JSON 하나다. `"ok": false`면 `error.code`를 보고 아래 "멈춰야 할 때"를 따른다.
- 한글 같은 비ASCII 내용은 명령줄 인자나 파이프로 넘기지 않는다. `env`가 알려 준 `tmpDir` 폴더에 UTF-8 파일로 쓰고 그 경로만 넘긴다.
- `tmpDir`은 이번 실행 전용 폴더다. 스킬을 끝낼 때는, 중간에 멈출 때도, 마지막에 `wc.mjs tmp clean --dir "<tmpDir>"`를 실행한다.

## 함께 읽을 문서

아래 문서는 `SKILL_DIR/references/`에 있다. 그 단계에 들어갈 때 읽는다.

- `formats.md`: 스크립트에 넘길 JSON 파일을 처음 만들기 전에
- `grading.md`: 5단계(퀴즈)를 시작하기 전에. 질문 만드는 법, 채점, 꼬리 질문, 해설, 이의 제기
- `record.md`: 6단계(기록 초안)를 시작하기 전에
- `finish.md`: 7단계(PR이나 커밋에 기록)를 시작하기 전에

## 순서

### 1. 준비

1. `node --version`을 실행한다. 명령이 없거나 18보다 낮으면 "Node.js가 없을 때"의 안내를 보여 주고 멈춘다.
2. `wc.mjs env`를 실행한다.
   - `repo.inRepo`가 false면 git 레포 안에서 실행해 달라고 하고 멈춘다. `repo.hasCommits`가 false면 커밋이 없다고 알리고 멈춘다.
   - `dataHomeSafe`가 false면 학습 데이터 폴더가 git 레포 안에 있어서 쓸 수 없다고 알리고 멈춘다 (`WHYCOMMIT_HOME`으로 레포 밖 폴더를 지정하라고 안내).
   - `tmpDir`, `config`, `project`를 기억한다.
   - `project.legacyLocal`이 있으면 한 번 묻는다. "원격 저장소가 생기기 전에 쌓인 노트가 있어요. 이 프로젝트의 노트로 옮길까요? 1. 옮기기 2. 그대로 두기". 1이면 `wc.mjs project migrate-local`.
3. `wc.mjs repo status`를 실행한다. `staged`, `unstaged`, `untracked` 중 하나라도 있으면 "커밋하지 않은 변경은 이번 퀴즈에 포함되지 않아요"라고 한 줄 알린다.
4. `wc.mjs gh status`를 실행하고 `ready`와 `defaultBranch`를 기억한다.

### 2. 모드 정하기

1. `wc.mjs range`를 실행한다. `gh status`의 `defaultBranch`가 있으면 `--default-branch <그 이름>`을 붙인다.
2. 결과의 `defaultBranch`가 null이면, `git branch --format=%(refname:short)`로 브랜치 목록을 보여 주고 기본 브랜치를 번호로 고르게 한다. 이후 `--default-branch`로 넘긴다.
3. 모드를 제안하고 확인받는다.
   - 지금 브랜치가 기본 브랜치면 마무리 모드다.

     ```
     기본 브랜치(<이름>)라서 마무리 모드로 진행할게요. 기록은 마지막 커밋 본문에 남겨요 (아직 푸시하지 않았을 때만).
     1. 마무리 모드로 진행
     2. 그만두기
     ```
   - 작업 브랜치이고 `gh` 준비가 됐으면(`ready` true):

     ```
     1. PR 모드로 진행 (추천)
     2. 마무리 모드로 진행
     ```
   - 작업 브랜치인데 `gh` 준비가 안 됐으면, 이유(설치 안 됨 / `gh auth login` 필요 / 원격이 GitHub이 아님)를 한 줄로 말하고 묻는다.

     ```
     1. 마무리 모드로 진행
     2. PR 본문만 만들어서 보여 주기
     ```
4. 고른 모드를 기억한다: PR 모드, 마무리 모드, PR 본문만.

### 3. 범위

`wc.mjs quiz changes --mode <pr|finish> --out "<tmpDir>/changes.json"`를 실행한다. PR 모드와 "PR 본문만"은 `--mode pr`, 마무리 모드는 `--mode finish`. 기본 브랜치를 알고 있으면 `--default-branch`를 붙인다.

- `stale`이 null이 아니면, 지난번 퀴즈 기준 커밋(`stale.recorded`)이 rebase나 amend로 사라진 것이다. 묻는다.

  ```
  지난번에 퀴즈를 본 커밋이 지금 브랜치 기록에 없어요. rebase나 amend로 바뀐 것 같아요.
  1. 범위를 처음부터 다시 잡기 (커밋 <count>개)
  2. 지금 커밋을 기준으로 표시만 하고 끝내기
  ```

  1이면 그대로 진행한다 (`changes.json`이 이미 처음부터 잡은 범위다). 2면 `wc.mjs state set-last-quizzed`를 실행하고 끝낸다.
- `empty`가 true면 끝낸다. "마지막 퀴즈 이후 새 커밋이 없어요"라고 알린다. 마무리 모드에서 `reason`이 `all_pushed`면 "아직 푸시하지 않은 커밋이 없어요"라고 알린다.
- `changes.json`을 읽는다.
  - `commits`: 범위의 커밋 (`sha`, `subject`)
  - `files`: 바뀐 파일과 분류(`class`). docs, asset, lockfile, rename_only, format_only, code
  - `skipCandidate`: 모든 파일이 code가 아니면 true
  - `diff`: 변경 내용. `diffTruncated`가 true면 잘린 것이다. 필요하면 파일을 직접 연다.
  - `todos`: 바뀐 파일의 TODO 주석 (기록 초안에 쓴다)

### 4. 설계 결정과 문제 수

1. diff와 바뀐 파일의 주변 코드를 읽고 설계 결정을 뽑는다. 설계 결정은 다른 선택지가 있었는데 이렇게 한 것이다. 예를 들어 구조와 책임 나누기, 자료구조, 라이브러리·API 선택, 에러 처리, 상태·동시성 관리, 성능과 단순함 사이의 선택, 보안 처리.
2. 건너뛰기를 판단한다. 아래 중 하나면 설계 결정이 없는 것으로 보고 제안한다.
   - `skipCandidate`가 true다.
   - code 파일의 변경이 주석만 바뀌었거나, 구조는 그대로고 숫자·문자열 같은 설정 값만 바뀌었다.

   새 의존성 추가, 설정 파일에 새 키나 구조 추가, 코드 흐름 변경이 하나라도 있으면 제안하지 않는다.

   ```
   이번 변경은 문서·주석·포맷팅·설정 값만 바뀐 것 같아요. 퀴즈는 건너뛰어도 될 것 같아요.
   1. 건너뛰고 기록만 하기
   2. 그래도 퀴즈 보기
   ```

   1이면 6단계로 간다.
3. 이미 이해한 주제를 뺀다. `wc.mjs notes list --status understood --out "<tmpDir>/understood.json"`를 읽고, 같은 결정을 다루는 주제는 뺀다.
4. 코드를 읽다가 문제로 보이는 곳이 있으면(선언만 하고 쓰지 않은 값, 정의되지 않은 이름, 처리하지 않은 에러, 해제하지 않은 자원 등) **확인 질문**을 하나 만들 수 있다. 퀴즈당 최대 1문제이고 문제 수 안에 넣는다. 만드는 법과 채점은 `grading.md`의 "확인 질문"을 따른다. 사용자에게 문제를 먼저 알려 주지 않는다.
5. 문제 수를 정한다. 기준은 줄 수가 아니라 남은 설계 결정의 수다(확인 질문 1개를 넣었으면 그것도 센다). 이를 `config.quiz.minQuestions`~`maxQuestions` 범위에 맞춘다.
   - 결정이 최소보다 적으면 같은 결정을 다른 질문 유형으로 물어서 채운다.
   - 최대보다 많으면 되돌리기 어렵거나 버그 위험이 큰 것을 고른다.
   - 남은 결정이 하나도 없으면(모두 이미 이해함) 그렇다고 알리고, 2번의 건너뛰기 선택지를 보여 준다.
6. 먼저 알린다. "3문제 낼게요. 모르면 '모르겠다', 넘기려면 '넘어가기', 그만하려면 '그만'이라고 해 주세요. 코드를 보면서 답해도 괜찮아요."

### 5. 퀴즈

`references/grading.md`를 읽고 시작한다. 문제마다 아래를 반복한다.

1. 질문 하나를 한다. 어느 파일의 어느 부분인지 짚는다.
2. 사용자의 답을 기다린다.
3. `grading.md`의 기준으로 채점하고, 판정에 따라 꼬리 질문이나 해설로 이어 간다.
4. 그 문제가 끝나면(꼬리 질문까지) 바로 `<tmpDir>/quiz-<번호>.json`을 쓰고 `wc.mjs notes add --file <그 파일>`로 저장한다. 돌려받은 `ids`를 모아 둔다. 판정과 해설 뒤에 다음 질문을 이어서 해도 된다.
   - **사용자에게 차례를 넘기기 전에 저장을 끝낸다.** 판정과 해설을 쓰고 나서 다음 질문이나 멈춤 안내를 보여 주기 전에, 같은 차례 안에서 저장한다. 사용자의 다음 메시지를 기다리는 동안에는 답한 문제가 모두 저장돼 있어야 한다. 그래야 "그만"이나 세션이 끊겨도 남는다.
   - 반론이 올 수 있다고 저장을 미루지 않는다. 반론은 저장한 뒤에 `notes dispute`로 고친다.
5. 채점에 대한 반론은 문제당 한 번 받는다. 다음 질문을 받은 뒤에 앞 문제에 반론해도 받는다 (`grading.md`의 "이의 제기").

마지막 문제가 끝나면 그 문제를 저장한 뒤, 판정·해설과 같은 메시지에서 이 안내를 보여 주고 멈춘다. 바로 다음 단계로 넘어가지 않는다.

```
퀴즈는 여기까지예요. 채점에 동의하지 않는 문제가 있으면 말해 주세요.
없으면 "응"이라고 해 주세요. 기록 초안으로 넘어갈게요.
```

- "넘어가기": 그 문제는 기록하지 않고 다음 문제로 간다.
- "그만": 지금까지 저장한 것만 남기고 끝낸다. PR과 커밋은 건드리지 않고, `state set-last-quizzed`도 하지 않는다. `wc.mjs notes stats`로 남은 주제 수를 확인해 "여기까지 기록했어요. 복습할 주제가 N개 쌓였어요"라고 알린 뒤(N이 0이면 "복습할 주제는 없어요"), `tmp clean`을 하고 끝낸다.

### 6. 기록 초안

마무리 모드면 먼저 `wc.mjs git pushed`를 실행한다. `safeToRewrite`가 false면 마지막 커밋이 이미 푸시돼서 기록할 곳이 없다. 초안을 만들지 않고 "마지막 커밋이 이미 푸시돼서 커밋은 그대로 둬요. 퀴즈 결과는 학습 노트에 저장했어요."라고 알린 뒤 8단계로 간다.

그 밖에는 `references/record.md`를 읽고 따른다. 오늘 한 작업과 남은 작업 초안을 만들고, 사용자가 "응"이라고 할 때까지 고친다.

### 7. 마무리

`references/finish.md`를 읽고, 고른 모드(PR 모드 / 마무리 모드 / PR 본문만)의 절차를 따른다.

### 8. 끝내기

1. `wc.mjs state set-last-quizzed`를 실행한다. 7단계에서 커밋 본문을 기록했으면 이미 갱신돼 있지만, 다시 실행해도 된다.
2. `wc.mjs notes stats`를 실행한다.
3. 짧게 요약한다. 이번에 이해한 주제와 다시 볼 주제를 한 줄씩 적고, 마지막에 "복습할 주제가 N개 쌓였어요"를 쓴다. N은 `notUnderstood`다. N이 0이면 "복습할 주제는 없어요"라고 쓴다. 점수나 비율은 말하지 않는다.
4. `wc.mjs tmp clean --dir "<tmpDir>"`.

## 멈춰야 할 때

멈출 때도 `tmpDir`을 만들었다면 `tmp clean`을 먼저 한다. 퀴즈 중에 멈추더라도 이미 저장한 노트는 그대로 둔다.

| error.code | 할 일 |
|---|---|
| `NOT_A_GIT_REPO`, `DETACHED_HEAD` | 브랜치에 체크아웃된 git 레포에서 실행해 달라고 하고 멈춘다. |
| `DATA_DIR_IN_GIT_REPO` | 1단계의 `dataHomeSafe`와 같이 안내하고 멈춘다. |
| `NEED_DEFAULT_BRANCH`, `NO_SUCH_BRANCH` | 기본 브랜치를 물어 `--default-branch`로 다시 실행한다. |
| `NO_MERGE_BASE` | 이 브랜치가 기본 브랜치와 공통 기록이 없다고 알리고, 마무리 모드로 할지 묻는다. |
| `INVALID_INPUT` | 메시지를 보고 입력 파일을 고쳐 다시 실행한다. 노트의 상태를 바꾸려고 결과(result)를 고치지 않는다. |
| `GH_NOT_READY`, `GH_FAILED` | 이유를 알리고 "PR 본문만 만들어서 보여 주기"로 바꿀지 묻는다. |
| 그 밖의 코드 | `error.message`를 알리고 멈춘다. `finish.md`에 따로 적힌 코드는 거기를 따른다. |

## Node.js가 없을 때

whycommit은 학습 기록을 다루는 스크립트를 Node.js로 실행한다. 설치를 대신 진행하지 말고, 설치한 뒤 다시 불러 달라고 안내한다.

- Windows: `winget install OpenJS.NodeJS.LTS`
- macOS: `brew install node`
- Linux: 배포판의 패키지 관리자, 또는 https://nodejs.org

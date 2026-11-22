---
name: commit
description: "whycommit commit. 스테이징된 변경을 읽고 커밋 제목 후보 3개를 번호 목록으로 보여 준 뒤, 사용자가 고르고 확인하면 그 제목으로 커밋한다. 퀴즈는 내지 않고 푸시도 하지 않는다. 사용자가 커밋하자고 하거나 커밋 제목을 추천해 달라고 할 때 쓴다. Suggests three commit titles for the staged changes and commits the one the user picks after confirmation. Use when the user asks to commit or wants commit title suggestions."
license: MIT
compatibility: Requires git and Node.js 18 or newer.
metadata:
  project: whycommit
  author: roof1004
---

# whycommit: commit

스테이징된 변경으로 커밋 제목 후보 3개를 보여 주고, 사용자가 고른 제목으로 커밋한다.
자주, 가볍게 쓰는 스킬이니 질문을 늘리지 말고 빠르게 끝낸다.

하지 않는 것: 퀴즈, 푸시, 커밋 본문 쓰기, 이미 있는 커밋 수정(amend), 훅 건너뛰기(`--no-verify`), 사용자 확인 없는 스테이징.

## 대화 규칙

- 사용자가 쓰는 언어로 말한다.
- 선택지는 번호 목록으로 보여 주고 사용자의 답을 기다린다. 사용자는 번호로 답해도 되고 말로 답해도 된다.
- 커밋은 항상 미리보기를 보여 주고 확인받은 뒤에 한다.

## 스크립트 쓰는 법

이 SKILL.md가 있는 폴더를 `SKILL_DIR`이라고 부른다. 스크립트는 모두 이렇게 실행한다.

```
node "SKILL_DIR/scripts/wc.mjs" <명령> [옵션]
```

- `SKILL_DIR`은 실제 절대 경로로 바꾸고, 경로 전체를 큰따옴표로 감싼다. 경로에 공백이나 한글이 있을 수 있다.
- 결과는 JSON 하나다. `"ok": false`면 `error.code`를 보고 아래 "멈춰야 할 때"를 따른다.
- 한글 같은 비ASCII 내용은 명령줄 인자나 파이프로 넘기지 않는다. `env`가 알려 준 `tmpDir` 폴더에 UTF-8 파일로 쓰고 그 경로만 넘긴다.
- 레포 안에는 파일을 만들지 않는다.
- `tmpDir`은 이번 실행 전용 폴더다. 스킬을 끝낼 때는, 중간에 멈출 때도, 마지막에 `wc.mjs tmp clean --dir "<tmpDir>"`를 실행해 지운다.

## 순서

### 1. 준비

1. `node --version`을 실행한다. 명령이 없거나 버전이 18보다 낮으면 "Node.js가 없을 때"의 안내를 보여 주고 멈춘다.
2. `wc.mjs env`를 실행한다.
   - `repo.inRepo`가 false면 git 레포 안에서 실행해 달라고 하고 멈춘다.
   - `dataHomeSafe`가 false면 학습 데이터 폴더(`dataHome`)가 git 레포 안에 있어서 쓸 수 없다고 알리고 멈춘다. 환경변수 `WHYCOMMIT_HOME`으로 레포 밖 폴더를 지정하면 된다고 안내한다.
   - `tmpDir` 값(이번 실행 전용 임시 폴더)을 기억해 둔다.

### 2. 스테이징 확인

`wc.mjs repo status`를 실행한다.

- `conflicts`가 있으면 병합 충돌을 먼저 해결해야 한다고 알리고 멈춘다.
- `staged`가 있으면 3단계로 간다.
- `staged`, `unstaged`, `untracked`가 모두 비어 있으면 커밋할 변경이 없다고 알리고 끝낸다.
- `staged`는 비어 있고 다른 변경이 있으면, 변경된 파일을 수정 / 새 파일 / 삭제로 나눠 보여 주고 묻는다.

  ```
  스테이징된 변경이 없어요. 아래 파일이 바뀌었어요.
  (파일 목록)
  1. 전부 스테이징하고 계속
  2. 그만두기
  ```

  - 목록에 비밀이 들어 있을 만한 파일(`.env`, 키·인증서 파일 등)이 있으면 그 파일을 짚어 준다.
  - 1이면 `wc.mjs repo stage-all`을 실행한다.
  - 일부만 커밋하고 싶다고 하면, 원하는 파일을 직접 스테이징한 뒤 다시 불러 달라고 안내한다.

### 3. 변경과 기록 읽기

`wc.mjs commit context --out "<tmpDir>/commit-context.json"`을 실행하고, 그 파일을 읽는다.

- `diff`: 스테이징된 변경. `diffTruncated`가 true면 잘린 것이니, 필요하면 `git diff --cached -- <파일>`로 더 본다.
- `recentSubjects`: 최근 커밋 제목 (최신 순)
- `hints.conventionalShare`, `hints.koreanShare`: 최근 제목 중 `feat:` 같은 형식과 한글이 차지하는 비율. 참고만 한다.
- `unstagedCount`, `untrackedCount`: 이번 커밋에 들어가지 않는 변경 수

### 4. 제목 형식 정하기

- 최근 커밋이 있으면 그 형식을 따른다. 접두사(`feat:`, `fix:` 등)를 쓰는지, 범위 표기(`feat(auth):`)를 쓰는지, 언어, 길이, 끝맺음을 본다.
- 최근 커밋이 없으면 `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:` 중 맞는 접두사를 붙이고 사용자의 언어로 쓴다.

### 5. 후보 3개 만들기

- 스테이징된 변경에 실제로 있는 내용만 쓴다. 대화에서 드러난 작업 의도는 보태도 되지만, 변경에 없는 일을 지어내지 않는다.
- 세 후보는 관점을 다르게 한다. 예: 무엇을 했나 / 왜 했나 / 더 넓은 단위로 묶기.
- 한 줄로 짧게 쓴다 (한글은 50자 안팎, 영어는 72자 이하). 마침표로 끝내지 않는다.

### 6. 고르게 하기

이 형식으로 보여 주고 답을 기다린다.

```
커밋 제목 후보
1. <후보 1>
2. <후보 2>
3. <후보 3>
4. 직접 입력
5. 다시 생성
```

- 4: 제목을 입력받는다. 받은 문장은 고치지 않는다. 여러 줄이면 한 줄로 해 달라고 한다.
- 5: 사용자가 방향을 말했으면 반영해 새 후보 3개를 만들고 6단계를 다시 한다.
- 사용자가 후보를 말로 고쳐 달라고 하면("1번을 더 짧게") 고친 제목으로 7단계에 간다.

### 7. 확인

고른 제목을 그대로 보여 주고 묻는다.

```
이 제목으로 커밋할게요. 본문은 비워 둡니다.
  <제목>
1. 커밋
2. 다시 고르기
```

- 스테이징 안 된 변경이 있으면(`unstagedCount + untrackedCount` > 0) "스테이징 안 된 변경 N개는 이번 커밋에 들어가지 않아요"를 함께 알린다.
- 2면 6단계로 돌아간다.

### 8. 커밋

1. 제목 한 줄만 `<tmpDir>/commit-title.txt`에 UTF-8로 쓴다.
2. `wc.mjs commit create --file "<tmpDir>/commit-title.txt"`를 실행한다.

`git commit -m`을 직접 쓰지 않는다. 한글 제목이 셸에서 깨질 수 있다.

### 9. 마무리

`wc.mjs tmp clean --dir "<tmpDir>"`로 임시 폴더를 지운 뒤, 두 줄로 끝낸다.

```
커밋했어요 (<short>).
퀴즈를 안 본 커밋이 N개 있어요.
```

- N은 결과의 `unquizzed.count`다.
- `unquizzed.count`가 null이면 둘째 줄 대신 "기본 브랜치를 알 수 없어서 퀴즈를 안 본 커밋 수는 세지 못했어요"라고 쓴다.

## 멈춰야 할 때

멈출 때도 `tmpDir`을 만들었다면 `wc.mjs tmp clean --dir "<tmpDir>"`를 먼저 실행한다.

| error.code | 할 일 |
|---|---|
| `NOT_A_GIT_REPO` | git 레포 안에서 실행해 달라고 하고 멈춘다. |
| `DATA_DIR_IN_GIT_REPO` | 1단계의 `dataHomeSafe`와 같이 안내하고 멈춘다. |
| `NOTHING_STAGED` | 2단계로 돌아간다. |
| `MERGE_CONFLICTS` | 충돌을 먼저 해결해야 한다고 알리고 멈춘다. |
| `COMMIT_FAILED` | `error.details.output`을 보여 준다. 훅이 막았다면 무엇이 문제인지 짚어 주고 멈춘다. 훅을 건너뛰자고 하지 않는다. |
| `INVALID_INPUT` | 제목 파일을 고쳐서 다시 실행한다. |
| `GIT_NOT_FOUND` | git을 설치해야 한다고 알리고 멈춘다. |
| 그 밖의 코드 | `error.message`를 알리고 멈춘다. |

## Node.js가 없을 때

whycommit은 학습 기록을 다루는 스크립트를 Node.js로 실행한다. 설치를 대신 진행하지 말고, 설치한 뒤 다시 불러 달라고 안내한다.

- Windows: `winget install OpenJS.NodeJS.LTS`
- macOS: `brew install node`
- Linux: 배포판의 패키지 관리자, 또는 https://nodejs.org

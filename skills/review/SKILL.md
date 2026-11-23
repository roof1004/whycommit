---
name: review
description: "whycommit review. 학습 노트에서 이해하지 못한 주제를 골라(여러 번 놓친 것, 오래 안 본 것 먼저) 예전과 다른 각도로 다시 묻는다. 맞히면 이해한 내용으로 옮기고, 못 맞히면 예전과 다른 방식으로 다시 해설한다. git은 건드리지 않는다. 사용자가 복습하자고 할 때 쓴다. 인자로 '전체'를 주면 모든 프로젝트를 본다. Reviews topics the user did not understand in earlier whycommit quizzes, asking from a new angle. Use when the user wants to review; pass '전체' or 'all' to include every project."
license: MIT
compatibility: Requires Node.js 18 or newer. Run inside a git repository to review that project only.
metadata:
  project: whycommit
  author: roof1004
---

# whycommit: review

예전 퀴즈에서 이해하지 못한 주제를 다시 묻는다. 사용자가 원할 때 쓴다.

## 꼭 지킬 것

1. "이해한 내용"과 "이해하지 못한 내용"은 사용자의 답에서만 나온다. 맞혔을 때만 이해한 내용으로 옮긴다. 그 밖에 상태를 바꾸는 방법은 채점에 대한 이의 제기뿐이다.
2. "모르겠다"는 불이익이 아니다. 점수, 정답률, 등급 같은 말을 쓰지 않는다. 모의 면접을 봐 주는 선배처럼 말한다.
3. 채점은 퀴즈와 같은 기준으로 엄격하게 한다.
4. **git을 건드리지 않는다.** git 명령을 직접 실행하지 않는다. 코드는 파일을 열어서 본다. (스크립트가 프로젝트를 알아내려고 git 정보를 읽기만 한다.)
5. 노트와 임시 파일은 레포 안에 만들지 않는다.

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

아래 문서는 `SKILL_DIR/references/`에 있다.

- `grading.md`: 첫 질문 전에. 질문 유형, 채점, 꼬리 질문, 해설, 이의 제기 기준이다. 퀴즈와 같은 문서다. "확인 질문"은 퀴즈에서만 쓰니 건너뛴다.
- `formats.md`: 첫 기록 전에

## 순서

### 1. 준비

1. `node --version`을 실행한다. 명령이 없거나 18보다 낮으면 "Node.js가 없을 때"의 안내를 보여 주고 멈춘다.
2. `wc.mjs env`를 실행한다.
   - `dataHomeSafe`가 false면 학습 데이터 폴더가 git 레포 안에 있어서 쓸 수 없다고 알리고 멈춘다.
   - `tmpDir`, `config`, `repo`, `project`를 기억한다.

### 2. 범위와 주제 고르기

1. 범위를 정한다.
   - 사용자가 "전체"나 "all"이라고 했거나 인자로 줬으면: 전체
   - 아니면 `repo.inRepo`가 true면: 이 프로젝트
   - 레포 밖이면: 전체. "레포 밖이라 모든 프로젝트에서 골랐어요"라고 알린다.
2. `wc.mjs review pick --scope <project|all> --out "<tmpDir>/review.json"`을 실행한다. 한 번에 고르는 수는 설정(`review.count`)을 따른다.
3. `picked`가 0이면 "복습할 주제가 없어요"라고 알리고 끝낸다. 범위가 이 프로젝트였으면 "다른 프로젝트까지 보려면 '전체'라고 해 주세요"를 덧붙인다.
4. `review.json`을 읽는다. `picked[]`마다 `project`, `entry`(주제, 예전 질문과 답과 해설이 든 `attempts`, `files`, `wrongCount`)가 있다. 여러 번 놓친 것, 오래 안 본 것 순서로 이미 정렬돼 있다.
5. 먼저 알린다. "복습할 주제가 <total>개 있어요. 여러 번 놓쳤거나 오래 안 본 것부터 <picked>개 볼게요. 모르면 '모르겠다', 넘기려면 '넘어가기', 그만하려면 '그만'이라고 해 주세요."

### 3. 주제마다

`references/grading.md`를 읽고 시작한다. 주제마다 아래를 반복한다.

1. **다른 각도로 묻는다.**
   - `entry.attempts`의 예전 질문을 그대로 반복하지 않는다. 질문 유형(왜 / 다른 방법 / 없으면)이나 상황을 바꾼다. 예: 예전에 "갱신 요청이 몇 번 나가나요?"였으면, 이번엔 "이 변수를 함수 안으로 옮기면 어떻게 되나요?"
   - 원래 코드가 남아 있으면 그 코드를 짚어서 묻는다. `project`가 `review.json`의 `currentProject`와 같고 `entry.files`의 파일이 지금 레포(`repo.top`)에 있으면 열어서 관련 부분을 찾는다. 줄 번호는 바뀌었을 수 있으니 내용으로 찾는다.
   - 다른 프로젝트의 주제이거나 코드가 없어졌으면 개념으로 묻고, "그때 코드는 지금 레포에 없어서 개념으로 물어볼게요"라고 짚는다.
   - 질문 앞에 순서와 주제를 붙인다. 범위가 전체면 프로젝트도 붙인다. 예: "[1/5] 동시에 온 401 응답과 중복 갱신 (roof1004/app)"
2. 사용자의 답을 기다린다.
3. `grading.md`의 기준으로 채점한다.
4. 판정에 따라 기록한다. 주제가 끝날 때마다 바로 저장한다 (형식은 `formats.md`). **사용자에게 차례를 넘기기 전에 저장을 끝낸다.** 다음 주제나 멈춤 안내를 보여 주기 전에, 같은 차례 안에서 저장한다. 반론이 올 수 있다고 저장을 미루지 않는다. 반론은 저장한 뒤에 `notes dispute`로 고친다.
   - `correct`, `shallow`: `wc.mjs notes review-result --file <파일>`. 이해한 내용으로 옮겨지고 해결한 날짜가 적힌다. `shallow`면 `grading.md`대로 꼬리 질문을 하고, 그 결과는 `wc.mjs notes add`로 따로 기록한다 (`parentId`는 이 주제의 id).
   - `partial`, `wrong`, `dont_know`: **예전과 다른 방식으로** 다시 해설한다. `entry.attempts`의 예전 해설을 보고, 같은 설명을 되풀이하지 않는다. 한 줄씩 실행을 따라가기, 작은 예시 코드, 반대 상황과 비교하기, 비유 같은 다른 길로 설명한다. 정답, 이유, 대안과 장단점은 그대로 들어간다. 그 해설을 넣어 `wc.mjs notes review-result`로 기록하면, 주제는 그대로 남고 횟수가 올라간다.
5. 채점에 대한 반론은 주제당 한 번 받는다. 다음 질문을 받은 뒤에 와도 받는다 (`grading.md`의 "이의 제기", 기록은 `notes dispute`).

- "넘어가기": 그 주제는 기록하지 않고 다음 주제로 간다.
- "그만": 지금까지 저장한 것만 남기고 4단계로 간다.

마지막 주제가 끝나면 그 주제를 저장한 뒤, 판정·해설과 같은 메시지에서 이 안내를 보여 주고 멈춘다.

```
복습은 여기까지예요. 채점에 동의하지 않는 주제가 있으면 말해 주세요.
없으면 "응"이라고 해 주세요.
```

### 4. 요약

1. `wc.mjs notes stats --scope <같은 범위>`를 실행한다.
2. 이번에 해결한 주제를 한 줄씩 적고, 이렇게 끝낸다. 해결은 이번에 이해한 내용으로 옮긴 수, 남음은 범위 안의 `notUnderstood`다.

   ```
   3개 해결, 4개 남음
   ```

   점수나 비율은 말하지 않는다. 남은 주제가 있으면 "다음에 또 불러 주세요" 정도로 짧게 덧붙인다.
3. `wc.mjs tmp clean --dir "<tmpDir>"`.

## 멈춰야 할 때

멈출 때도 `tmpDir`을 만들었다면 `tmp clean`을 먼저 한다. 이미 저장한 기록은 그대로 둔다.

| error.code | 할 일 |
|---|---|
| `DATA_DIR_IN_GIT_REPO` | 1단계의 `dataHomeSafe`와 같이 안내하고 멈춘다. |
| `NOT_A_GIT_REPO` | 범위를 전체로 바꿔 다시 실행한다. |
| `ALREADY_UNDERSTOOD` | 그 주제는 이미 해결돼 있다. 다음 주제로 간다. |
| `ALREADY_DISPUTED` | 그 주제는 이미 한 번 이의를 받았다고 알린다. |
| `INVALID_INPUT` | 메시지를 보고 입력 파일을 고쳐 다시 실행한다. 노트의 상태를 바꾸려고 결과(result)를 고치지 않는다. |
| `UNKNOWN_PROJECT`, `NOTE_NOT_FOUND` | `review.json`의 `project`와 `id`를 그대로 썼는지 확인하고 다시 실행한다. |
| 그 밖의 코드 | `error.message`를 알리고 멈춘다. |

## Node.js가 없을 때

whycommit은 학습 기록을 다루는 스크립트를 Node.js로 실행한다. 설치를 대신 진행하지 말고, 설치한 뒤 다시 불러 달라고 안내한다.

- Windows: `winget install OpenJS.NodeJS.LTS`
- macOS: `brew install node`
- Linux: 배포판의 패키지 관리자, 또는 https://nodejs.org

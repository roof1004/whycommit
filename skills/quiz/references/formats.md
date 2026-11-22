# 스크립트에 넘기는 파일 형식

모든 파일은 `tmpDir` 안에 UTF-8로 쓴다.

## 퀴즈 결과: `notes add --file`

문제 하나가 끝날 때마다 한 파일을 쓴다. 그 문제의 본 질문, 꼬리 질문, 나눈 항목을 모두 담는다.

```json
{
  "entries": [
    {
      "ref": "q1",
      "topic": "401 응답에서만 토큰을 갱신한 이유",
      "questionType": "why",
      "files": [{ "path": "src/auth/session.js", "lines": "42-58" }],
      "commits": ["a1b2c3d"],
      "attempt": {
        "question": "토큰을 요청마다 갱신하지 않고 401일 때만 갱신했네요. 왜 이렇게 했어요?",
        "answerSummary": "매번 갱신하면 서버 요청이 많아져서",
        "result": "shallow"
      }
    },
    {
      "ref": "q1-f1",
      "parentRef": "q1",
      "topic": "동시에 온 401 응답과 중복 갱신",
      "questionType": "what_if",
      "files": [{ "path": "src/auth/session.js", "lines": "42-58" }],
      "attempt": {
        "question": "요청 5개가 동시에 401을 받으면 갱신 요청은 몇 번 나가나요?",
        "answerSummary": "",
        "result": "dont_know",
        "explanation": "정답: 지금 코드에서는 5번 나가요.\n이유: ...\n대안: ..."
      }
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `topic` | 예 | 한 줄 주제 (200자 이하) |
| `attempt.question` | 예 | 실제로 한 질문 |
| `attempt.answerSummary` | `dont_know`가 아니면 예 | 사용자 답 요약 |
| `attempt.result` | 예 | `correct`, `shallow`, `partial`, `wrong`, `dont_know` |
| `attempt.explanation` | 이해하지 못한 항목이면 예 | 해설 전체 (여러 줄 가능) |
| `attempt.dispute` | 아니요 | 이의 제기가 있었으면 `{"originalResult": "...", "outcome": "changed" \| "kept"}` |
| `status` | `partial`이면 예 | `understood` 또는 `not_understood`. 다른 결과에서는 쓰지 않아도 되고, 쓰면 결과와 맞아야 한다 |
| `ref`, `parentRef` | 아니요 | 같은 파일 안에서 꼬리 질문을 본 질문에 잇는 이름 |
| `questionType` | 아니요 | `why`, `alternative`, `what_if` |
| `files`, `commits` | 아니요 | 관련 위치와 커밋 |

결과(`ids`)로 받은 노트 id는 마무리 모드에서 학습 내용을 넣을 때 쓴다.

## 이의 제기: `notes dispute --file`

이미 저장한 문제에 사용자가 반론했을 때 쓴다. 문제당 한 번만 된다.

```json
{
  "outcome": "changed",
  "updates": [{ "id": "20261122-a1b2c3", "result": "correct" }]
}
```

- `outcome`: 판정을 바꿨으면 `"changed"`, 유지했으면 `"kept"`. 유지해도 기록해야 한 번 쓴 것으로 남는다.
- `updates`: 그 문제로 저장한 항목을 모두 넣는다. 본 질문, 꼬리 질문, 일부만 맞음으로 나눈 항목까지 전부. 그래야 그 문제 전체에서 한 번만 이의 제기를 받는다. 판정이 바뀌지 않는 항목도 넣고, `result`에는 원래 결과를 그대로 적는다.
  - `result`: 다시 판단한 결과 (`"kept"`면 생략)
  - `status`: 결과가 `partial`일 때만
  - `explanation`: 다시 판단해서 이해하지 못한 부분이 생겼고 해설이 바뀌었을 때

## 기록 초안: `body render --file`

```json
{
  "done": [
    "401 응답을 받으면 토큰을 갱신하고 다시 요청",
    "동시에 온 401에서 갱신이 한 번만 일어나게 처리"
  ],
  "todo": [
    { "text": "갱신에 실패하면 로그아웃", "source": "plan" },
    { "text": "재시도 횟수 제한", "source": "todo", "ref": "src/auth/session.js:12" },
    { "text": "에러 메시지 다듬기", "source": "issue", "ref": "#7" },
    { "text": "캐시는 다음 PR에서", "source": "conversation" },
    { "text": "token을 가져오는 코드 추가", "source": "quiz" },
    { "text": "사용자가 직접 쓴 항목", "source": "user" }
  ],
  "learning": { "include": true, "ids": ["20261122-a1b2c3"] }
}
```

- `done`: 오늘 한 작업. 비우기로 했으면 빈 배열.
- `todo`: 남은 작업. `source`는 `plan`, `conversation`, `todo`, `issue`, `quiz`(확인 질문으로 확인된 문제), `user` 중 하나.
- `learning`: 생략하면 설정(`body.includeLearning`)을 따른다.
  - `include`: 이번에 학습 내용을 넣을지
  - `ids`: 이 노트들의 주제만 넣는다 (마무리 모드)
  - `branch`: 이 브랜치의 노트 주제를 넣는다. `ids`와 `branch`를 모두 생략하면 현재 브랜치
- 이해한 내용과 이해하지 못한 내용의 주제를 이 파일에 직접 쓰지 않는다. 스크립트가 노트에서 가져오고, 직접 쓰면 거부한다.

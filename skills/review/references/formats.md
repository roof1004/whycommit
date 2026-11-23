# 스크립트에 넘기는 파일 형식 (복습)

모든 파일은 `tmpDir` 안에 UTF-8로 쓴다. 복습은 레포 밖에서도, 다른 프로젝트의 주제도 다루므로 **항상 `project`를 넣는다**. 값은 `review.json`의 `picked[].project`를 그대로 쓴다.

## 복습 결과: `notes review-result --file`

주제 하나가 끝날 때마다 한 파일을 쓴다.

```json
{
  "project": "roof1004/app",
  "id": "20261122-a1b2c3",
  "attempt": {
    "question": "refreshPromise를 request 함수 안으로 옮기면 어떻게 되나요?",
    "answerSummary": "요청마다 변수가 새로 생겨서 갱신이 요청 수만큼 나간다",
    "result": "correct"
  }
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `project`, `id` | 예 | `review.json`의 `picked[].project`와 `picked[].entry.id` |
| `attempt.question` | 예 | 이번에 실제로 한 질문 |
| `attempt.answerSummary` | `dont_know`가 아니면 예 | 사용자 답 요약. 사용자가 한 말만 |
| `attempt.result` | 예 | `correct`, `shallow`, `partial`, `wrong`, `dont_know` |
| `attempt.explanation` | 못 맞혔으면 예 | 예전과 다른 방식으로 다시 한 해설 전체 |
| `attempt.dispute` | 아니요 | 저장 전에 이의 제기가 있었으면 `{"originalResult": "...", "outcome": "changed" \| "kept"}` |

- `correct`, `shallow`면 이해한 내용으로 옮겨지고 해결한 날짜가 적힌다.
- `partial`, `wrong`, `dont_know`면 주제는 그대로 남고 횟수가 하나 올라간다. 이때 `explanation`이 없으면 저장이 거부된다.

## 꼬리 질문: `notes add --file`

`shallow`라서 꼬리 질문을 했을 때, 그 결과를 따로 기록한다.

```json
{
  "project": "roof1004/app",
  "entries": [
    {
      "parentId": "20261122-a1b2c3",
      "source": "review",
      "topic": "갱신이 끝난 뒤 refreshPromise를 비우는 이유",
      "questionType": "what_if",
      "files": [{ "path": "src/auth/session.js", "lines": "7" }],
      "attempt": {
        "question": "finally에서 refreshPromise를 null로 되돌리지 않으면 어떻게 되나요?",
        "answerSummary": "",
        "result": "dont_know",
        "explanation": "정답: ...\n이유: ...\n대안: ..."
      }
    }
  ]
}
```

- `parentId`: 복습한 주제의 id. `source`: 항상 `"review"`.
- 나머지 필드와 규칙은 퀴즈와 같다. 이해하지 못했으면 `explanation`이 필요하다.

## 이의 제기: `notes dispute --file`

이미 저장한 주제에 사용자가 반론했을 때 쓴다. 주제당 한 번만 된다.

```json
{
  "project": "roof1004/app",
  "outcome": "changed",
  "updates": [{ "id": "20261122-a1b2c3", "result": "correct" }]
}
```

- `outcome`: 판정을 바꿨으면 `"changed"`, 유지했으면 `"kept"`. 유지해도 기록해야 한 번 쓴 것으로 남는다.
- `updates`: 그 주제와, 그 주제에서 나온 꼬리 질문 항목을 모두 넣는다. 판정이 바뀌지 않는 항목은 `result`에 원래 결과를 그대로 적는다.
- 복습 결과가 바뀌면 스크립트가 그 복습이 올린 횟수와 해결 날짜를 함께 되돌린다.

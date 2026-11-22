# 마무리: PR이나 커밋에 기록하기

어느 모드든 실행 전에 미리보기를 보여 주고 확인받는다. 강제 푸시는 하지 않고, 이미 푸시한 커밋은 고치지 않는다.

## PR 모드

### 1. 푸시

`wc.mjs git pushed`를 실행한다.

- `pushed`가 true면 이미 원격에 있으니 2로 간다. 그 뒤 로컬 커밋이 더 있으면 false가 나온다.
- false면 묻는다.

  ```
  PR을 만들려면 브랜치(<이름>)를 원격에 올려야 해요.
  1. 푸시하기
  2. 푸시하지 않고 PR 본문만 보기
  ```

  1이면 `wc.mjs repo push`. 2면 아래 "PR 본문만"으로 간다.
- `PUSH_REJECTED`: 원격에 이 브랜치에 없는 커밋이 있다는 뜻이다. 강제 푸시를 제안하지 않는다. 먼저 pull이나 rebase를 해야 한다고 알리고, "PR 본문만"으로 바꿀지 묻는다.

### 2. PR이 있는지 보기

`wc.mjs pr status`를 실행한다 (기록 초안 때 이미 했으면 그 결과를 쓴다).

- `exists`가 false이고 `otherPrs`에 닫혔거나 머지된 PR만 있으면 "이 브랜치의 PR #N은 이미 머지됐어요(닫혔어요). 새 PR을 만들까요? 1. 새 PR 만들기 2. 만들지 않기"라고 묻는다.

### 3-A. 새 PR 만들기

1. `wc.mjs pr template`를 실행한다. 템플릿이 여러 개면 번호로 고르게 한다. 하나면 그것을 쓴다.
2. PR 제목을 제안한다. 이 브랜치의 작업 전체를 한 줄로 쓰고, 레포의 커밋 제목 형식을 따른다.
3. `wc.mjs pr preview --section "<tmpDir>/section.md" --out "<tmpDir>/pr-body.md"`를 실행한다. 템플릿이 있으면 `--template <경로>`를 붙인다.
4. 제목과 `pr-body.md` 전체를 보여 주고 묻는다. 템플릿 내용은 그대로 두고 그 아래에 whycommit 부분이 붙는다는 것을 알린다.

   ```
   이 내용으로 PR을 만들까요? (<브랜치> → <기본 브랜치>)
   1. PR 만들기
   2. 제목 고치기
   3. 기록 다시 고치기
   ```
5. 제목을 `<tmpDir>/pr-title.txt`에 쓰고 `wc.mjs pr create --title-file "<tmpDir>/pr-title.txt" --section "<tmpDir>/section.md" --base <기본 브랜치>`를 실행한다. 템플릿을 썼으면 같은 `--template`을 붙인다.
6. 결과의 `url`을 보여 준다.

### 3-B. 이미 있는 PR 고치기

본문 전체를 덮어쓰지 않는다. whycommit 부분(`<!-- whycommit:start -->`부터 `<!-- whycommit:end -->`까지)만 바꾼다.

1. `wc.mjs pr preview --section "<tmpDir>/section.md" --out "<tmpDir>/pr-body.md" --out-current "<tmpDir>/current.md"`를 실행한다.
2. `sectionState`에 따라 보여 주고 묻는다.

| sectionState | 뜻 | 보여 줄 것과 선택지 |
|---|---|---|
| `unchanged` | 지난번에 whycommit이 쓴 그대로다 | 새 whycommit 부분을 보여 주고, 나머지 본문은 그대로라고 알린다. "1. 바꾸기 2. 그만두기" |
| `absent` | 사용자가 만든 PR이라 whycommit 부분이 아직 없다 | 본문 맨 아래에 붙일 내용을 보여 준다. "1. 붙이기 2. 그만두기" |
| `edited` | 사용자가 GitHub에서 whycommit 부분을 고쳤다 | `current.md`와 새 내용의 차이를 줄 단위로 보여 준다. "1. 새 내용으로 바꾸기 2. GitHub에서 고친 내용을 살려서 기록 다시 고치기 3. 그대로 두기" |
| `unknown` | whycommit 부분이 있지만 이 컴퓨터에 쓴 기록이 없다 | `edited`와 같이 다룬다. |
| `removed` | whycommit이 썼던 부분을 사용자가 지웠다 | 지운 것 같다고 알린다. "1. 다시 붙이기 2. 붙이지 않기" |

   - 2-B(edited의 2번)를 고르면 `current.md`를 출발점으로 `record.md`의 고치기로 돌아간다.
   - 그만두기나 그대로 두기를 고르면 PR은 건드리지 않는다. 퀴즈 기록은 이미 노트에 있다.
3. 확인받으면 `wc.mjs pr update --section "<tmpDir>/section.md" --expect-body-hash <preview의 bodyHash>`를 실행한다.
   - `needsConfirm`이 있었으면(edited, unknown, removed) 사용자가 동의한 경우에만 `--confirm <needsConfirm 값>`을 붙인다.
4. `url`을 보여 준다.

오류가 나면:
- `BODY_CHANGED`: 미리보기 뒤에 누군가 PR 본문을 고친 것이다. 1번부터 다시 하고 새 미리보기를 보여 준다.
- `NEEDS_CONFIRMATION`: 사용자에게 보여 주고 동의를 받지 않은 것이다. 2번으로 돌아간다.
- `SECTION_BROKEN`: whycommit 마커가 깨졌거나 두 번 들어 있다. GitHub에서 시작 마커와 끝 마커가 하나씩만 남게 고쳐 달라고 안내한다. 고쳐 주기 전에는 PR을 건드리지 않는다.

## PR 본문만

`gh`가 없거나 푸시하지 않기로 한 경우다.

1. `wc.mjs pr template`로 템플릿을 확인한다 (여러 개면 고르게 한다).
2. `wc.mjs pr preview --offline --section "<tmpDir>/section.md" --out "<tmpDir>/pr-body.md"`를 실행한다. 템플릿이 있으면 `--template`을 붙인다.
3. `pr-body.md` 전체를 코드 블록으로 보여 주고, PR을 만들 때 붙여 넣으면 된다고 알린다. PR 제목도 한 줄 제안한다.
4. `<!-- whycommit:start -->` 마커를 지우지 않고 붙여 넣으면, 다음에 whycommit이 그 부분만 갱신할 수 있다고 알린다.

## 마무리 모드

푸시는 하지 않는다.

1. `wc.mjs git pushed`를 실행한다.
2. `safeToRewrite`가 false면(이미 푸시했거나 확인할 수 없음) 커밋을 건드리지 않는다. "마지막 커밋은 이미 푸시돼서 그대로 뒀어요. 퀴즈 기록은 학습 노트에만 저장했어요."라고 알리고 끝낸다.
3. `safeToRewrite`가 true면:
   1. `wc.mjs commit amend-body --file "<tmpDir>/body.txt" --dry-run --out "<tmpDir>/message.txt"`를 실행한다.
   2. `message.txt` 전체(커밋 제목 + 기존 본문 + 새 기록)를 보여 주고 묻는다.

      ```
      마지막 커밋(<sha 7자리>)의 메시지를 이렇게 바꿀게요. 코드 변경은 그대로예요.
      1. 커밋 본문에 기록하기
      2. 기록하지 않기 (노트에만 저장)
      ```
   3. 1이면 `wc.mjs commit amend-body --file "<tmpDir>/body.txt"`를 실행한다. 이 명령은 스테이징해 둔 변경을 커밋에 섞지 않고, "마지막으로 퀴즈를 본 커밋"을 새 커밋으로 옮긴다.
   4. `ALREADY_PUSHED`가 나면 2번처럼 알리고 끝낸다.

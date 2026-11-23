import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { KO, createSandbox, git, makeRepo, readJsonFile, wc, wcOk } from './helpers.mjs';

const MULTILINE_EXPLANATION = [
  '지금 코드에서는 갱신 요청이 5번 나가요.',
  '',
  '```js',
  '# 이 줄은 마크다운 제목이 아니라 코드예요',
  'if (!refreshPromise) refreshPromise = refreshToken();',
  '```',
  '',
  '대안: 요청 큐를 두는 방법도 있어요.',
].join('\n');

/** 퀴즈 한 번 분량: 얕은 정답 + 꼬리 질문(모르겠다) + 일부 정답을 둘로 나눈 것 */
function quizInput() {
  return {
    entries: [
      {
        ref: 'q1',
        topic: '401 응답에서만 토큰을 갱신한 이유',
        questionType: 'why',
        files: [{ path: 'src\\auth\\session.js', lines: '42-58' }],
        commits: ['ABCDEF1234567'],
        attempt: {
          question: '토큰을 요청마다 갱신하지 않고 401일 때만 갱신했네요. 왜 이렇게 했어요?',
          answerSummary: '매번 갱신하면 서버 요청이 많아져서',
          result: 'shallow',
        },
      },
      {
        ref: 'q1-f',
        parentRef: 'q1',
        topic: `동시에 온 401 응답과 중복 갱신 (${KO})`,
        questionType: 'what_if',
        attempt: {
          question: '요청 5개가 동시에 401을 받으면 갱신 요청은 몇 번 나가나요?',
          answerSummary: '',
          result: 'dont_know',
          explanation: MULTILINE_EXPLANATION,
        },
      },
      {
        topic: '캐시 키에 사용자 id를 넣은 이유',
        status: 'understood',
        attempt: { question: '캐시 키를 이렇게 만든 이유와 대안은?', answerSummary: '사용자별로 분리하려고', result: 'partial' },
      },
      {
        topic: '캐시 키 방식의 대안과 단점',
        status: 'not_understood',
        attempt: {
          question: '캐시 키를 이렇게 만든 이유와 대안은?',
          answerSummary: '사용자별로 분리하려고',
          result: 'partial',
          explanation: '대안으로 사용자별 캐시 인스턴스를 둘 수 있지만 메모리를 더 써요.',
        },
      },
    ],
  };
}

test('퀴즈 결과를 한글·줄바꿈 그대로 저장하고 상태를 결과에서 정한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, `레포 ${KO}`);
  git(sb, repo, ['switch', '-q', '-c', 'feat/token']);

  const out = wcOk(sb, ['notes', 'add', '--file', sb.input('quiz.json', quizInput())], { cwd: repo });
  assert.equal(out.added, 4);
  assert.deepEqual(out.stats, { understood: 2, notUnderstood: 2, total: 4 });

  const notes = readJsonFile(path.join(sb.home, 'projects', '_local', `레포 ${KO}`, 'notes.json'));
  const [main, followup, partOk, partMissing] = notes.entries;

  assert.equal(main.status, 'understood');
  assert.equal(main.wrongCount, 0);
  assert.equal(main.branch, 'feat/token');
  assert.deepEqual(main.files, [{ path: 'src/auth/session.js', lines: '42-58' }]);
  assert.deepEqual(main.commits, ['abcdef1234567']);
  assert.equal(main.kind, 'question');

  assert.equal(followup.kind, 'followup');
  assert.equal(followup.parentId, main.id, '꼬리 질문은 본 질문과 따로 기록하되 연결한다');
  assert.equal(followup.status, 'not_understood');
  assert.equal(followup.wrongCount, 1, '"모르겠다"도 다시 볼 횟수에 센다');
  assert.equal(followup.topic, `동시에 온 401 응답과 중복 갱신 (${KO})`);
  assert.equal(followup.attempts[0].explanation, MULTILINE_EXPLANATION, '여러 줄 해설이 그대로 남는다');

  assert.equal(partOk.status, 'understood');
  assert.equal(partMissing.status, 'not_understood');
  assert.equal(partMissing.attempts[0].result, 'partial');
});

test('notes.json과 notes.md는 BOM 없는 UTF-8, LF이고 md에 두 구역이 있다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const out = wcOk(sb, ['notes', 'add', '--file', sb.input('quiz.json', quizInput())], { cwd: repo });

  for (const file of [out.notesMd, out.notesMd.replace(/notes\.md$/, 'notes.json')]) {
    const bytes = fs.readFileSync(file);
    assert.notEqual(bytes[0], 0xef, `${file}: BOM`);
    assert.equal(bytes.includes(0x0d), false, `${file}: CR`);
  }
  const md = fs.readFileSync(out.notesMd, 'utf8');
  assert.match(md, /## 이해하지 못한 내용 \(2\)/);
  assert.match(md, /## 이해한 내용 \(2\)/);
  assert.match(md, /- 이어진 질문: 401 응답에서만 토큰을 갱신한 이유/);
  assert.match(md, /> # 이 줄은 마크다운 제목이 아니라 코드예요/, '내용 속 # 줄은 인용문 안에 갇힌다');
  assert.doesNotMatch(md, /정답률|점수|등급/);
  assert.ok(md.indexOf('이해하지 못한 내용') < md.indexOf('## 이해한 내용'));
});

test('PowerShell 등이 만든 BOM+CRLF 입력 파일도 받고, 저장된 내용에는 CR이 없다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const json = JSON.stringify(quizInput(), null, 2).replace(/\n/g, '\r\n').replace(/\\n/g, '\\r\\n');
  const file = sb.input('crlf.json', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json, 'utf8')]));
  wcOk(sb, ['notes', 'add', '--file', file], { cwd: repo });
  const notes = readJsonFile(path.join(sb.home, 'projects', '_local', 'repo', 'notes.json'));
  assert.equal(notes.entries[1].attempts[0].explanation, MULTILINE_EXPLANATION);
});

test('상태와 결과가 어긋나거나 해설이 빠지면 저장을 거부하고, 아무것도 쓰지 않는다 (원칙 1)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const base = { topic: '주제', attempt: { question: '질문', answerSummary: '답' } };
  const cases = {
    '정답인데 이해 못 함으로': { ...base, status: 'not_understood', attempt: { ...base.attempt, result: 'correct' } },
    '틀렸는데 이해함으로': { ...base, status: 'understood', attempt: { ...base.attempt, result: 'wrong', explanation: '해설' } },
    '일부 정답인데 status 없음': { ...base, attempt: { ...base.attempt, result: 'partial' } },
    '이해 못 함인데 해설 없음': { ...base, attempt: { ...base.attempt, result: 'wrong' } },
    '모르는 결과': { ...base, attempt: { ...base.attempt, result: 'great' } },
    '주제 없음': { attempt: { ...base.attempt, result: 'correct' } },
    '없는 parentRef': { ...base, parentRef: 'nope', attempt: { ...base.attempt, result: 'correct' } },
  };
  for (const [name, entry] of Object.entries(cases)) {
    const valid = { topic: '먼저 오는 정상 항목', attempt: { question: 'q', answerSummary: 'a', result: 'correct' } };
    const r = wc(sb, ['notes', 'add', '--file', sb.input(`${name}.json`, { entries: [valid, entry] })], { cwd: repo });
    assert.equal(r.status, 1, name);
    assert.equal(r.json.error.code, 'INVALID_INPUT', name);
  }
  assert.equal(fs.existsSync(path.join(sb.home, 'projects', '_local', 'repo', 'notes.json')), false);
});

test('복습에서 맞히면 이해한 내용으로 옮기고 해결한 날짜를 적는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const env = { WHYCOMMIT_TODAY: '2026-11-01' };
  const added = wcOk(sb, ['notes', 'add', '--file', sb.input('quiz.json', quizInput())], { cwd: repo, env });
  const followupId = added.ids.find((x) => x.ref === 'q1-f').id;

  const review = {
    id: followupId,
    attempt: { question: 'refreshPromise를 지우면 어떤 일이 생기나요?', answerSummary: '갱신이 요청 수만큼 중복된다', result: 'correct' },
  };
  const out = wcOk(sb, ['notes', 'review-result', '--file', sb.input('review.json', review)], {
    cwd: repo,
    env: { WHYCOMMIT_TODAY: '2026-11-20' },
  });
  assert.equal(out.status, 'understood');
  assert.equal(out.resolvedAt, '2026-11-20');
  assert.deepEqual(out.stats, { understood: 3, notUnderstood: 1, total: 4 });

  const entry = readJsonFile(path.join(sb.home, 'projects', '_local', 'repo', 'notes.json')).entries.find(
    (e) => e.id === followupId,
  );
  assert.equal(entry.attempts.length, 2);
  assert.equal(entry.attempts[1].source, 'review');
  assert.match(fs.readFileSync(out.notesMd, 'utf8'), /- 해결한 날짜: 2026-11-20/);

  const again = wc(sb, ['notes', 'review-result', '--file', sb.input('review.json', review)], { cwd: repo });
  assert.equal(again.json.error.code, 'ALREADY_UNDERSTOOD');
});

test('복습에서 못 맞히면 그대로 두고 횟수를 올린다. 다시 한 해설이 꼭 있어야 한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const added = wcOk(sb, ['notes', 'add', '--file', sb.input('quiz.json', quizInput())], { cwd: repo });
  const id = added.ids.find((x) => x.ref === 'q1-f').id;
  const attempt = { question: '다른 각도의 질문', answerSummary: '잘 모르겠어요', result: 'wrong' };

  const noExplanation = wc(sb, ['notes', 'review-result', '--file', sb.input('r1.json', { id, attempt })], { cwd: repo });
  assert.equal(noExplanation.json.error.code, 'INVALID_INPUT');

  const out = wcOk(
    sb,
    ['notes', 'review-result', '--file', sb.input('r2.json', { id, attempt: { ...attempt, explanation: '이번엔 그림으로 설명해 볼게요.' } })],
    { cwd: repo },
  );
  assert.equal(out.status, 'not_understood');
  assert.equal(out.wrongCount, 2);
  assert.match(fs.readFileSync(out.notesMd, 'utf8'), /- 다시 볼 횟수: 2/);
});

test('이의 제기 결과를 함께 남긴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const input = {
    entries: [
      {
        topic: '재시도 간격을 늘린 이유',
        attempt: {
          question: '왜 지수 백오프를 썼나요?',
          answerSummary: '서버가 회복할 시간을 주려고. 고정 간격이면 동시에 몰린다',
          result: 'correct',
          dispute: { originalResult: 'shallow', outcome: 'changed' },
        },
      },
    ],
  };
  const out = wcOk(sb, ['notes', 'add', '--file', sb.input('d.json', input)], { cwd: repo });
  assert.match(fs.readFileSync(out.notesMd, 'utf8'), /이의 제기 후 판단 바뀜/);
});

test('notes list는 상태별로 골라 --out 파일에 쓴다 (이미 이해한 주제를 빼는 데 씀)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  wcOk(sb, ['notes', 'add', '--file', sb.input('quiz.json', quizInput())], { cwd: repo });
  const out = sb.outPath('understood.json');
  const r = wcOk(sb, ['notes', 'list', '--status', 'understood', '--out', out], { cwd: repo });
  assert.equal(r.count, 2);
  assert.deepEqual(
    readJsonFile(out).entries.map((e) => e.topic),
    ['401 응답에서만 토큰을 갱신한 이유', '캐시 키에 사용자 id를 넣은 이유'],
  );
});

test('레포 밖에서는 입력 파일의 project로 기록한다 (전체 복습의 꼬리 질문)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, `복습 ${KO}`);
  const added = wcOk(sb, ['notes', 'add', '--file', sb.input('quiz.json', quizInput())], { cwd: repo });
  const outside = sb.dir('레포 밖');

  const followup = {
    project: `_local/복습 ${KO}`,
    entries: [
      {
        parentId: added.ids[0].id,
        source: 'review',
        topic: '복습 중 꼬리 질문',
        attempt: { question: 'q', answerSummary: 'a', result: 'wrong', explanation: '해설' },
      },
    ],
  };
  const out = wcOk(sb, ['notes', 'add', '--file', sb.input('f.json', followup)], { cwd: outside });
  assert.equal(out.project, `_local/복습 ${KO}`);
  assert.equal(out.stats.total, 5);
  const saved = readJsonFile(path.join(sb.home, 'projects', '_local', `복습 ${KO}`, 'notes.json')).entries.at(-1);
  assert.equal(saved.attempts[0].source, 'review');
  assert.equal(saved.branch, 'main', '레포 밖에서 기록해도 본 항목의 브랜치를 물려받는다');

  const unknown = wc(sb, ['notes', 'add', '--file', sb.input('u.json', { ...followup, project: 'no/such' })], { cwd: outside });
  assert.equal(unknown.json.error.code, 'UNKNOWN_PROJECT');
  const noRepo = wc(sb, ['notes', 'add', '--file', sb.input('n.json', { entries: followup.entries })], { cwd: outside });
  assert.equal(noRepo.json.error.code, 'NOT_A_GIT_REPO');
});

test('노트는 레포 안에 생기지 않고 스테이징되지 않는다 (시나리오 14)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  wcOk(sb, ['notes', 'add', '--file', sb.input('quiz.json', quizInput())], { cwd: repo });
  git(sb, repo, ['add', '-A']);
  assert.equal(git(sb, repo, ['status', '--porcelain']).trim(), '');
});

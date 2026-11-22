import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KO, createSandbox, makeRepo, readJsonFile, wc, wcOk } from './helpers.mjs';

function entry(topic, result = 'wrong') {
  return {
    topic,
    attempt: {
      question: `${topic}에 대한 질문`,
      answerSummary: result === 'dont_know' ? '' : '답',
      result,
      explanation: result === 'correct' ? undefined : `${topic} 해설`,
    },
  };
}

function add(sb, repo, topics, today, result) {
  return wcOk(sb, ['notes', 'add', '--file', sb.input(`${today}.json`, { entries: topics.map((t) => entry(t, result)) })], {
    cwd: repo,
    env: { WHYCOMMIT_TODAY: today },
  });
}

function missAgain(sb, repo, id, today) {
  const attempt = { question: '다시', answerSummary: '모름', result: 'dont_know', explanation: '다시 해설' };
  wcOk(sb, ['notes', 'review-result', '--file', sb.input(`miss-${id}-${today}.json`, { id, attempt })], {
    cwd: repo,
    env: { WHYCOMMIT_TODAY: today },
  });
}

test('여러 번 놓친 것 먼저, 같으면 가장 오래 안 본 것 먼저 고른다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const old = add(sb, repo, ['오래된 주제', '이해한 주제'], '2026-10-01', 'wrong');
  add(sb, repo, ['새 주제'], '2026-11-10', 'wrong');
  const mid = add(sb, repo, ['두 번 놓친 주제'], '2026-11-01', 'dont_know');
  missAgain(sb, repo, mid.ids[0].id, '2026-11-15');
  // "이해한 주제"는 복습에서 맞혀서 빠진다
  wcOk(sb, ['notes', 'review-result', '--file', sb.input('ok.json', { id: old.ids[1].id, attempt: { question: 'q', answerSummary: 'a', result: 'correct' } })], { cwd: repo });

  const out = sb.outPath('pick.json');
  const r = wcOk(sb, ['review', 'pick', '--out', out], { cwd: repo });
  assert.equal(r.picked, 3);
  assert.equal(r.total, 3);
  assert.deepEqual(
    readJsonFile(out).picked.map((p) => p.entry.topic),
    ['두 번 놓친 주제', '오래된 주제', '새 주제'],
  );
});

test('한 번에 고르는 수는 설정(review.count)을 따르고 --limit로 바꿀 수 있다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  add(sb, repo, ['1', '2', '3', '4', '5', '6', '7'], '2026-11-01', 'wrong');
  const out = sb.outPath('pick.json');
  assert.equal(wcOk(sb, ['review', 'pick', '--out', out], { cwd: repo }).picked, 5);
  wcOk(sb, ['config', 'set', '--key', 'review.count', '--value', '2']);
  assert.equal(wcOk(sb, ['review', 'pick', '--out', out], { cwd: repo }).picked, 2);
  const limited = wcOk(sb, ['review', 'pick', '--out', out, '--limit', '6'], { cwd: repo });
  assert.equal(limited.picked, 6);
  assert.equal(limited.total, 7);
});

test('"전체" 범위는 모든 프로젝트에서 고르고, 레포 밖에서도 된다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const a = makeRepo(sb, 'a', { remoteUrl: 'https://github.com/me/a.git' });
  const b = makeRepo(sb, `한글 프로젝트 ${KO}`);
  add(sb, a, ['A의 주제'], '2026-11-01', 'wrong');
  add(sb, b, ['B의 주제'], '2026-10-01', 'wrong');
  const outside = sb.dir('레포 밖 폴더');

  const out = sb.outPath('all.json');
  const r = wcOk(sb, ['review', 'pick', '--scope', 'all', '--out', out], { cwd: outside });
  assert.equal(r.currentProject, null);
  const picked = readJsonFile(out).picked;
  assert.deepEqual(
    picked.map((p) => [p.project, p.entry.topic]),
    [
      [`_local/한글 프로젝트 ${KO}`, 'B의 주제'],
      ['me/a', 'A의 주제'],
    ],
  );

  const projectOnly = wcOk(sb, ['review', 'pick', '--out', out], { cwd: a });
  assert.equal(projectOnly.picked, 1);
  assert.equal(readJsonFile(out).picked[0].project, 'me/a');

  assert.equal(wc(sb, ['review', 'pick', '--out', out], { cwd: outside }).json.error.code, 'NOT_A_GIT_REPO');
  const stats = wcOk(sb, ['notes', 'stats', '--scope', 'all'], { cwd: outside });
  assert.equal(stats.notUnderstood, 2);
  assert.equal(stats.projects.length, 2);
});

test('복습할 것이 없으면 0개를 돌려준다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  add(sb, repo, ['이해한 것'], '2026-11-01', 'correct');
  const r = wcOk(sb, ['review', 'pick', '--out', sb.outPath('p.json')], { cwd: repo });
  assert.equal(r.picked, 0);
  assert.equal(r.total, 0);
});

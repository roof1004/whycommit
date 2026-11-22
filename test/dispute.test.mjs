import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createSandbox, makeRepo, readJsonFile, wc, wcOk } from './helpers.mjs';

const notesOf = (sb) => readJsonFile(path.join(sb.home, 'projects', '_local', 'repo', 'notes.json')).entries;

function addOne(sb, repo, attempt, extra = {}) {
  const out = wcOk(sb, ['notes', 'add', '--file', sb.input(`a-${Math.random()}.json`, { entries: [{ topic: '재시도를 if로 한 번만 한 이유', ...extra, attempt: { question: '왜 if로 한 번만?', ...attempt } }] })], { cwd: repo });
  return out.ids[0].id;
}

test('이의 제기로 판정이 바뀌면 상태와 횟수가 함께 바뀌고, 문제당 한 번만 된다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const id = addOne(sb, repo, { answerSummary: '무한 루프 위험', result: 'wrong', explanation: '해설' });
  assert.equal(notesOf(sb)[0].status, 'not_understood');

  const out = wcOk(sb, ['notes', 'dispute', '--file', sb.input('d.json', { outcome: 'changed', updates: [{ id, result: 'correct' }] })], { cwd: repo });
  assert.deepEqual(out.updated, [{ id, status: 'understood', wrongCount: 0, resolvedAt: null }]);
  const entry = notesOf(sb)[0];
  assert.deepEqual(entry.attempts[0].dispute, { originalResult: 'wrong', outcome: 'changed' });
  assert.match(fs.readFileSync(out.notesMd, 'utf8'), /이의 제기 후 판단 바뀜/);

  const again = wc(sb, ['notes', 'dispute', '--file', sb.input('d2.json', { outcome: 'changed', updates: [{ id, result: 'wrong', explanation: 'x' }] })], { cwd: repo });
  assert.equal(again.json.error.code, 'ALREADY_DISPUTED');
  assert.equal(notesOf(sb)[0].status, 'understood');
});

test('판정을 유지해도 이의 제기 한 번을 쓴 것으로 남는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const id = addOne(sb, repo, { answerSummary: '성능 때문에', result: 'wrong', explanation: '해설' });
  wcOk(sb, ['notes', 'dispute', '--file', sb.input('d.json', { outcome: 'kept', updates: [{ id }] })], { cwd: repo });
  const entry = notesOf(sb)[0];
  assert.equal(entry.status, 'not_understood');
  assert.deepEqual(entry.attempts[0].dispute, { originalResult: 'wrong', outcome: 'kept' });
  const again = wc(sb, ['notes', 'dispute', '--file', sb.input('d2.json', { outcome: 'changed', updates: [{ id, result: 'correct' }] })], { cwd: repo });
  assert.equal(again.json.error.code, 'ALREADY_DISPUTED');
});

test('둘로 나눈 "일부만 맞음"은 함께 바꾼다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const added = wcOk(sb, ['notes', 'add', '--file', sb.input('p.json', {
    entries: [
      { ref: 'ok', topic: '맞은 부분', status: 'understood', attempt: { question: 'q', answerSummary: 'a', result: 'partial' } },
      { ref: 'miss', topic: '빠진 부분', status: 'not_understood', attempt: { question: 'q', answerSummary: 'a', result: 'partial', explanation: 'e' } },
    ],
  })], { cwd: repo });
  const ids = added.ids.map((x) => x.id);
  wcOk(sb, ['notes', 'dispute', '--file', sb.input('d.json', { outcome: 'changed', updates: ids.map((id) => ({ id, result: 'correct' })) })], { cwd: repo });
  assert.deepEqual(notesOf(sb).map((e) => e.status), ['understood', 'understood']);
});

test('복습에서 못 맞혔다가 이의 제기로 바뀌면, 그 복습이 올린 횟수를 되돌리고 해결 처리한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const id = addOne(sb, repo, { answerSummary: '', result: 'dont_know', explanation: '해설' });
  wcOk(sb, ['notes', 'review-result', '--file', sb.input('r.json', { id, attempt: { question: '다른 각도', answerSummary: '중복 갱신', result: 'wrong', explanation: '다시 해설' } })], { cwd: repo });
  assert.equal(notesOf(sb)[0].wrongCount, 2);

  const out = wcOk(sb, ['notes', 'dispute', '--file', sb.input('d.json', { outcome: 'changed', updates: [{ id, result: 'correct' }] })], {
    cwd: repo,
    env: { WHYCOMMIT_TODAY: '2026-12-01' },
  });
  assert.deepEqual(out.updated, [{ id, status: 'understood', wrongCount: 1, resolvedAt: '2026-12-01' }]);
  const entry = notesOf(sb)[0];
  assert.equal(entry.attempts[0].dispute, null, '첫 퀴즈 시도는 그대로');
  assert.deepEqual(entry.attempts[1].dispute, { originalResult: 'wrong', outcome: 'changed' });
});

test('이해 못 함으로 바꾸려면 해설이 있어야 한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const id = addOne(sb, repo, { answerSummary: 'a', result: 'correct' });
  const r = wc(sb, ['notes', 'dispute', '--file', sb.input('d.json', { outcome: 'changed', updates: [{ id, result: 'wrong' }] })], { cwd: repo });
  assert.equal(r.json.error.code, 'INVALID_INPUT');
  assert.equal(notesOf(sb)[0].attempts[0].dispute, null, '실패하면 아무것도 바뀌지 않는다');
});

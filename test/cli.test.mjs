import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSandbox, wc } from './helpers.mjs';

test('help는 사용법을 출력하고 0으로 끝난다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const r = wc(sb, ['help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: node wc\.mjs/);
});

test('모르는 명령은 USAGE 오류와 종료 코드 2', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const r = wc(sb, ['nope']);
  assert.equal(r.status, 2);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.error.code, 'USAGE');
});

test('모르는 옵션은 오타를 놓치지 않도록 거부한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const r = wc(sb, ['config', 'get', '--fiel', 'x']);
  assert.equal(r.status, 2);
  assert.match(r.json.error.message, /--fiel/);
});

test('ASCII 옵션에 한글을 넣으면 파일로 넘기라고 안내한다 (기획 9.1.4)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const r = wc(sb, ['config', 'set', '--key', 'language', '--value', '한국어']);
  assert.equal(r.status, 2);
  assert.match(r.json.error.message, /UTF-8 file/);
});

test('실패한 명령은 종료 코드 1과 오류 코드를 낸다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const r = wc(sb, ['state', 'get'], { cwd: sb.dir('레포 아님') });
  assert.equal(r.status, 1);
  assert.equal(r.json.error.code, 'NOT_A_GIT_REPO');
});

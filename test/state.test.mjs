import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { commitFile, createSandbox, git, makeRepo, wc, wcOk } from './helpers.mjs';

test('마지막으로 퀴즈를 본 커밋을 브랜치별로 쓰고 읽는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const first = git(sb, repo, ['rev-parse', 'HEAD']).trim();

  assert.equal(wcOk(sb, ['state', 'get'], { cwd: repo }).lastQuizzed, null);
  const set = wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });
  assert.equal(set.lastQuizzed, first);
  assert.equal(set.previous, null);

  git(sb, repo, ['switch', '-q', '-c', 'feat/로그인']);
  const second = commitFile(sb, repo, 'a.txt', 'a\n', 'feat: a');
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });

  const state = wcOk(sb, ['state', 'get'], { cwd: repo });
  assert.equal(state.branch, 'feat/로그인');
  assert.equal(state.lastQuizzed, second);
  assert.deepEqual(state.branches, { main: first, 'feat/로그인': second });
});

test('--sha로 특정 커밋을 지정하고, 커밋이 아니면 거부한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const first = git(sb, repo, ['rev-parse', 'HEAD']).trim();
  commitFile(sb, repo, 'b.txt', 'b\n', 'second');
  assert.equal(wcOk(sb, ['state', 'set-last-quizzed', '--sha', first.slice(0, 7)], { cwd: repo }).lastQuizzed, first);
  for (const bad of ['deadbeef', '--all', 'HEAD~99']) {
    const r = wc(sb, ['state', 'set-last-quizzed', `--sha=${bad}`], { cwd: repo });
    assert.equal(r.status, 1, bad);
    assert.equal(r.json.error.code, 'NO_SUCH_COMMIT', bad);
  }
});

test('HEAD가 브랜치가 아니면(detached) 기록하지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  git(sb, repo, ['checkout', '-q', '--detach']);
  const r = wc(sb, ['state', 'set-last-quizzed'], { cwd: repo });
  assert.equal(r.json.error.code, 'DETACHED_HEAD');
});

test('기획 문서 위치를 기억하고, "없음"도 기억한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  fs.mkdirSync(path.join(repo, 'docs'));
  fs.writeFileSync(path.join(repo, 'docs', '기획 문서.md'), '# 기획\n');

  wcOk(sb, ['state', 'set-plan-doc', '--path', path.join('docs', '기획 문서.md')], { cwd: repo });
  assert.deepEqual(wcOk(sb, ['state', 'get'], { cwd: repo }).planDoc, { path: 'docs/기획 문서.md' });

  wcOk(sb, ['state', 'set-plan-doc', '--none'], { cwd: repo });
  assert.deepEqual(wcOk(sb, ['state', 'get'], { cwd: repo }).planDoc, { path: null });

  assert.equal(wc(sb, ['state', 'set-plan-doc', '--path', 'missing.md'], { cwd: repo }).json.error.code, 'FILE_NOT_FOUND');
  const outside = sb.input('outside.md', '# x');
  assert.equal(wc(sb, ['state', 'set-plan-doc', '--path', outside], { cwd: repo }).json.error.code, 'INVALID_INPUT');
  assert.equal(wc(sb, ['state', 'set-plan-doc'], { cwd: repo }).status, 2);
});

test('상태 파일은 레포가 아니라 데이터 폴더에 생긴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });
  assert.ok(fs.existsSync(path.join(sb.home, 'projects', '_local', 'repo', 'state.json')));
  assert.equal(git(sb, repo, ['status', '--porcelain']).trim(), '');
});

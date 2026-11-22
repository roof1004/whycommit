import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { commitFile, createSandbox, git, makeRepo, wc, wcOk } from './helpers.mjs';

const range = (sb, repo, ...args) => wcOk(sb, ['range', ...args], { cwd: repo });

test('기본 브랜치에서 원격이 없으면 모든 커밋이 "아직 푸시 안 함" (마무리 모드)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  commitFile(sb, repo, 'a.txt', 'a\n', 'a');
  commitFile(sb, repo, 'b.txt', 'b\n', 'b');
  const r = range(sb, repo);
  assert.equal(r.mode, 'finish');
  assert.equal(r.defaultBranch, 'main');
  assert.equal(r.reason, 'unpushed');
  assert.equal(r.base, null);
  assert.equal(r.fromRoot, true);
  assert.equal(r.count, 3);
});

test('기록이 있으면 그 이후만, 새 커밋이 없으면 empty', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const quizzed = commitFile(sb, repo, 'a.txt', 'a\n', 'a');
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });
  assert.equal(range(sb, repo).empty, true);
  const next = commitFile(sb, repo, 'b.txt', 'b\n', 'b');
  const r = range(sb, repo);
  assert.equal(r.reason, 'last_quizzed');
  assert.equal(r.base, quizzed);
  assert.deepEqual(r.commits, [next]);
});

test('작업 브랜치는 PR 모드: 기본 브랜치에서 갈라진 뒤의 커밋', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const fork = git(sb, repo, ['rev-parse', 'HEAD']).trim();
  git(sb, repo, ['switch', '-q', '-c', 'feat/로그인']);
  commitFile(sb, repo, 'a.txt', 'a\n', 'a');
  commitFile(sb, repo, 'b.txt', 'b\n', 'b');
  git(sb, repo, ['switch', '-q', 'main']);
  commitFile(sb, repo, 'main.txt', 'm\n', 'main moves on');
  git(sb, repo, ['switch', '-q', 'feat/로그인']);

  const r = range(sb, repo);
  assert.equal(r.mode, 'pr');
  assert.equal(r.branch, 'feat/로그인');
  assert.equal(r.reason, 'merge_base');
  assert.equal(r.base, fork);
  assert.equal(r.count, 2);
});

test('푸시한 뒤에는 그 뒤의 커밋만 마무리 모드 범위다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, 'repo', { pushTo: true });
  commitFile(sb, repo, 'a.txt', 'a\n', 'a');
  git(sb, repo, ['push', '-q', '-u', 'origin', 'main']);
  const pushed = git(sb, repo, ['rev-parse', 'HEAD']).trim();
  assert.equal(range(sb, repo).reason, 'all_pushed');
  commitFile(sb, repo, 'b.txt', 'b\n', 'b');
  const r = range(sb, repo);
  assert.equal(r.reason, 'unpushed');
  assert.equal(r.base, pushed);
  assert.equal(r.count, 1);
});

test('기록된 커밋이 amend로 사라지면 stale로 알리고 기본 범위를 대신 계산한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  commitFile(sb, repo, 'a.txt', 'a\n', 'a');
  const recorded = wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo }).lastQuizzed;
  git(sb, repo, ['commit', '-q', '--amend', '-m', 'a (amended)']);

  const r = range(sb, repo);
  assert.deepEqual(r.stale, { recorded, reason: 'last_quizzed_not_ancestor' });
  assert.equal(r.reason, 'unpushed');
  assert.equal(r.count, 2);
  assert.equal(range(sb, repo, '--ignore-recorded').stale, null, '--ignore-recorded면 기록을 보지 않는다');
});

test('기록된 커밋이 아예 없으면 last_quizzed_missing', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });
  const stateFile = path.join(sb.home, 'projects', '_local', 'repo', 'state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  state.branches.main.lastQuizzed = '0123456789abcdef0123456789abcdef01234567';
  fs.writeFileSync(stateFile, JSON.stringify(state));
  assert.equal(range(sb, repo).stale.reason, 'last_quizzed_missing');
});

test('기본 브랜치는 원격 HEAD → main/master → init.defaultBranch 순으로 찾는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());

  const masterRepo = sb.dir('master-repo');
  git(sb, masterRepo, ['init', '-q', '-b', 'master']);
  commitFile(sb, masterRepo, 'a.txt', 'a\n', 'a');
  assert.equal(range(sb, masterRepo).defaultBranch, 'master');

  const remoteRepo = makeRepo(sb, 'remote-head', { pushTo: true });
  git(sb, remoteRepo, ['switch', '-q', '-c', 'trunk']);
  git(sb, remoteRepo, ['push', '-q', 'origin', 'trunk']);
  git(sb, remoteRepo, ['remote', 'set-head', 'origin', 'trunk']);
  const r = range(sb, remoteRepo);
  assert.equal(r.defaultBranch, 'trunk');
  assert.equal(r.defaultBranchSource, 'remote_head');
  assert.equal(r.mode, 'finish');
});

test('기본 브랜치를 모르면 count는 null이고, --default-branch로 알려 줄 수 있다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = sb.dir('develop-only');
  git(sb, repo, ['init', '-q', '-b', 'develop']);
  commitFile(sb, repo, 'a.txt', 'a\n', 'a');
  git(sb, repo, ['switch', '-q', '-c', 'feature']);
  commitFile(sb, repo, 'b.txt', 'b\n', 'b');

  const unknown = range(sb, repo);
  assert.equal(unknown.reason, 'unknown_default_branch');
  assert.equal(unknown.mode, null);
  assert.equal(unknown.count, null);

  const known = range(sb, repo, '--default-branch', 'develop');
  assert.equal(known.mode, 'pr');
  assert.equal(known.count, 1);
  assert.equal(wc(sb, ['range', '--default-branch', 'nope'], { cwd: repo }).json.error.code, 'NO_SUCH_BRANCH');
});

test('커밋이 하나도 없는 레포는 범위가 비어 있다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = sb.dir('empty');
  git(sb, repo, ['init', '-q', '-b', 'main']);
  const r = range(sb, repo);
  assert.equal(r.reason, 'no_commits');
  assert.equal(r.count, 0);
});

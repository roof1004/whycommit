import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commitFile, createSandbox, git, makeRepo, wcOk } from './helpers.mjs';

test('원격이 없으면 푸시되지 않은 것', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const out = wcOk(sb, ['git', 'pushed'], { cwd: repo });
  assert.equal(out.pushed, false);
  assert.equal(out.reason, 'no_remote');
  assert.equal(out.safeToRewrite, true);
});

test('푸시 전후와 새 커밋을 구분한다 (커밋 수정 전 안전장치)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, 'repo', { remoteUrl: 'https://github.com/o/r.git', pushTo: true });

  const before = wcOk(sb, ['git', 'pushed'], { cwd: repo });
  assert.equal(before.pushed, false);
  assert.equal(before.safeToRewrite, true);

  git(sb, repo, ['push', '-q', '-u', 'origin', 'main']);
  const after = wcOk(sb, ['git', 'pushed'], { cwd: repo });
  assert.equal(after.pushed, true);
  assert.equal(after.safeToRewrite, false);
  assert.deepEqual(after.remoteRefs, ['refs/remotes/origin/main']);

  commitFile(sb, repo, 'new.txt', '새 파일\n', 'feat: 새 커밋');
  assert.equal(wcOk(sb, ['git', 'pushed'], { cwd: repo }).pushed, false, '새 커밋은 아직 푸시 전');
  assert.equal(wcOk(sb, ['git', 'pushed', '--rev', 'HEAD~1'], { cwd: repo }).pushed, true, '이전 커밋은 푸시됨');
});

test('다른 브랜치로 푸시된 커밋도 푸시된 것으로 본다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, 'repo', { pushTo: true });
  git(sb, repo, ['push', '-q', 'origin', 'main:backup']);
  git(sb, repo, ['fetch', '-q', 'origin']);
  assert.equal(wcOk(sb, ['git', 'pushed'], { cwd: repo }).pushed, true);
});

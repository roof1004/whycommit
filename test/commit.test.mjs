import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { KO, commitFile, createSandbox, git, makeRepo, readJsonFile, wc, wcOk } from './helpers.mjs';

test('repo status는 스테이징·수정·새 파일·이름 바꾸기를 한글 파일명 그대로 구분한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  commitFile(sb, repo, '옛 이름.txt', '내용\n', 'add file');
  git(sb, repo, ['mv', '옛 이름.txt', `새 이름 ${KO}.txt`]);
  fs.writeFileSync(path.join(repo, 'README.md'), '# 바뀜\n');
  fs.mkdirSync(path.join(repo, '새 폴더'));
  fs.writeFileSync(path.join(repo, '새 폴더', '메모 파일.md'), '메모\n');

  const s = wcOk(sb, ['repo', 'status'], { cwd: repo });
  assert.deepEqual(s.staged, [{ status: 'R', path: `새 이름 ${KO}.txt`, from: '옛 이름.txt' }]);
  assert.deepEqual(s.unstaged, [{ status: 'M', path: 'README.md' }]);
  assert.deepEqual(s.untracked, ['새 폴더/메모 파일.md']);
  assert.deepEqual(s.conflicts, []);
  assert.equal(s.clean, false);
});

test('repo stage-all은 전부 스테이징하고, 충돌이 있으면 거부한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  fs.writeFileSync(path.join(repo, '새 파일.txt'), 'x\n');
  fs.writeFileSync(path.join(repo, 'README.md'), '# 바뀜\n');
  const out = wcOk(sb, ['repo', 'stage-all'], { cwd: repo });
  assert.deepEqual(out.staged.map((f) => f.path).sort(), ['README.md', '새 파일.txt'].sort());

  // 충돌 만들기
  git(sb, repo, ['commit', '-q', '-m', 'base']);
  git(sb, repo, ['switch', '-q', '-c', 'other']);
  commitFile(sb, repo, 'README.md', '# other\n', 'other');
  git(sb, repo, ['switch', '-q', 'main']);
  commitFile(sb, repo, 'README.md', '# main\n', 'main');
  try {
    git(sb, repo, ['merge', '-q', 'other']);
  } catch {
    // 충돌로 실패하는 것이 정상
  }
  assert.deepEqual(wcOk(sb, ['repo', 'status'], { cwd: repo }).conflicts, ['README.md']);
  const r = wc(sb, ['repo', 'stage-all'], { cwd: repo });
  assert.equal(r.json.error.code, 'MERGE_CONFLICTS');
  const c = wc(sb, ['commit', 'create', '--file', sb.input('t.txt', '제목')], { cwd: repo });
  assert.equal(c.json.error.code, 'MERGE_CONFLICTS');
});

test('commit context는 스테이징된 diff, 최근 제목, 형식 힌트를 파일로 쓴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  commitFile(sb, repo, 'a.js', 'a\n', 'feat: 로그인 화면 추가');
  commitFile(sb, repo, 'b.js', 'b\n', 'fix(auth): 토큰 만료 처리');
  fs.writeFileSync(path.join(repo, 'a.js'), 'a\n// 한글 주석 추가\n');
  git(sb, repo, ['add', 'a.js']);
  fs.writeFileSync(path.join(repo, 'b.js'), 'unstaged\n');

  const out = sb.outPath('ctx.json');
  const r = wcOk(sb, ['commit', 'context', '--out', out], { cwd: repo });
  assert.equal(r.stagedCount, 1);
  const ctx = readJsonFile(out);
  assert.match(ctx.diff, /\+\/\/ 한글 주석 추가/);
  assert.doesNotMatch(ctx.diff, /unstaged/, '스테이징 안 된 변경은 넣지 않는다');
  assert.deepEqual(ctx.recentSubjects, ['fix(auth): 토큰 만료 처리', 'feat: 로그인 화면 추가', 'init']);
  assert.equal(ctx.hints.conventionalShare, 0.67);
  assert.equal(ctx.hints.koreanShare, 0.67);
  assert.equal(ctx.unstagedCount, 1);
});

test('commit context는 긴 diff를 자르고, 기록이 없는 레포도 다룬다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = sb.dir('빈 레포');
  git(sb, repo, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(repo, 'big.txt'), 'x'.repeat(5000));
  git(sb, repo, ['add', 'big.txt']);
  const out = sb.outPath('ctx.json');
  const r = wcOk(sb, ['commit', 'context', '--out', out, '--max-diff-chars', '1000'], { cwd: repo });
  assert.equal(r.hasHistory, false);
  assert.equal(r.diffTruncated, true);
  assert.equal(readJsonFile(out).diff.length, 1000);
});

test('commit create는 파일의 한글 제목 한 줄로 커밋하고 본문은 비운다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git(sb, repo, ['add', 'a.txt']);
  fs.writeFileSync(path.join(repo, 'left.txt'), 'not staged\n');
  // PowerShell로 쓴 것처럼 BOM과 CRLF가 붙은 제목 파일
  const title = 'feat: 401 응답을 받았을 때만 토큰 갱신 "따옴표" $HOME';
  const file = sb.input('title.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${title}\r\n`)]));

  const out = wcOk(sb, ['commit', 'create', '--file', file], { cwd: repo });
  assert.equal(out.sha, git(sb, repo, ['rev-parse', 'HEAD']).trim());
  assert.equal(out.committedFiles, 1);
  assert.equal(out.leftUncommitted, 1);
  assert.equal(git(sb, repo, ['log', '-1', '--format=%s']).trim(), title);
  assert.equal(git(sb, repo, ['log', '-1', '--format=%b']).trim(), '', '본문은 비어 있어야 한다');
  assert.equal(fs.readdirSync(path.join(sb.home, 'tmp')).length, 0, '임시 메시지 파일이 남지 않는다');
  assert.deepEqual(out.unquizzed, { count: 2, mode: 'finish', reason: 'unpushed', stale: null });
});

test('"#"으로 시작하는 제목도 지워지지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git(sb, repo, ['add', 'a.txt']);
  wcOk(sb, ['commit', 'create', '--file', sb.input('t.txt', '#12 이슈 해결')], { cwd: repo });
  assert.equal(git(sb, repo, ['log', '-1', '--format=%s']).trim(), '#12 이슈 해결');
});

test('commit create는 빈 제목, 여러 줄, 스테이징 없음을 거부한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  assert.equal(wc(sb, ['commit', 'create', '--file', sb.input('t.txt', '제목')], { cwd: repo }).json.error.code, 'NOTHING_STAGED');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git(sb, repo, ['add', 'a.txt']);
  assert.equal(wc(sb, ['commit', 'create', '--file', sb.input('e.txt', '  \n')], { cwd: repo }).json.error.code, 'INVALID_INPUT');
  assert.equal(wc(sb, ['commit', 'create', '--file', sb.input('m.txt', '제목\n\n본문')], { cwd: repo }).json.error.code, 'INVALID_INPUT');
  assert.equal(git(sb, repo, ['rev-list', '--count', 'HEAD']).trim(), '1');
});

test('훅이 커밋을 막으면 COMMIT_FAILED와 훅 출력을 돌려준다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\necho "lint failed: missing semicolon" >&2\nexit 1\n');
  fs.chmodSync(hook, 0o755);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git(sb, repo, ['add', 'a.txt']);
  const r = wc(sb, ['commit', 'create', '--file', sb.input('t.txt', 'feat: 막힐 커밋')], { cwd: repo });
  assert.equal(r.status, 1);
  assert.equal(r.json.error.code, 'COMMIT_FAILED');
  assert.match(r.json.error.details.output, /lint failed/);
  assert.equal(git(sb, repo, ['rev-list', '--count', 'HEAD']).trim(), '1');
});

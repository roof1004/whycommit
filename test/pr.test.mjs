import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { END, START, findSection } from '../src/lib/prsection.mjs';
import { NO_GH, commitFile, createSandbox, fakeGh, git, makeRepo, readJsonFile, wc, wcOk } from './helpers.mjs';

const SECTION_1 = '### 오늘 한 작업\n- 토큰 갱신 추가\n\n### 남은 작업\n- 로그아웃 처리 (기획 문서)';
const SECTION_2 = '### 오늘 한 작업\n- 토큰 갱신 추가\n- 중복 갱신 방지\n\n### 남은 작업\n- 로그아웃 처리 (기획 문서)';
const TEMPLATE = '## 변경 사항\n\n<!-- 무엇을 바꿨는지 적어 주세요 -->\n\n## 체크리스트\n- [ ] 테스트\n';

function githubRepo(sb) {
  const repo = makeRepo(sb, 'repo', { remoteUrl: 'https://github.com/o/r.git', pushTo: true });
  git(sb, repo, ['switch', '-q', '-c', 'feat/토큰']);
  commitFile(sb, repo, 'src/a.js', 'a\n', 'feat: a');
  return repo;
}

test('gh 상태: 없음 / 로그인 안 함 / GitHub이 아닌 원격 / 준비됨', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);

  assert.deepEqual(wcOk(sb, ['gh', 'status'], { cwd: repo, env: NO_GH }), {
    ok: true,
    installed: false,
    authenticated: false,
    applicable: true,
    ready: false,
    defaultBranch: null,
  });
  const loggedOut = fakeGh(sb, { auth: false });
  assert.equal(wcOk(sb, ['gh', 'status'], { cwd: repo, env: loggedOut.env }).authenticated, false);

  const gh = fakeGh(sb);
  const ready = wcOk(sb, ['gh', 'status'], { cwd: repo, env: gh.env });
  assert.equal(ready.ready, true);
  assert.equal(ready.defaultBranch, 'main');

  const gitlab = makeRepo(sb, 'gitlab', { remoteUrl: 'https://gitlab.com/o/r.git' });
  const notGitHub = wcOk(sb, ['gh', 'status'], { cwd: gitlab, env: gh.env });
  assert.equal(notGitHub.applicable, false);
  assert.equal(notGitHub.ready, false);

  const r = wc(sb, ['pr', 'status'], { cwd: repo, env: NO_GH });
  assert.equal(r.json.error.code, 'GH_NOT_READY');
});

test('PR 템플릿 위치를 찾는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  assert.deepEqual(wcOk(sb, ['pr', 'template'], { cwd: repo }).templates, []);
  fs.mkdirSync(path.join(repo, '.github', 'PULL_REQUEST_TEMPLATE'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'pull_request_template.md'), TEMPLATE);
  fs.writeFileSync(path.join(repo, '.github', 'PULL_REQUEST_TEMPLATE', 'bug.md'), 'bug');
  fs.writeFileSync(path.join(repo, '.github', 'PULL_REQUEST_TEMPLATE', 'feature.md'), 'feature');
  assert.deepEqual(wcOk(sb, ['pr', 'template'], { cwd: repo }).templates, [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE/bug.md',
    '.github/PULL_REQUEST_TEMPLATE/feature.md',
  ]);
});

test('새 PR: 템플릿은 지우지 않고 그 아래에 whycommit 부분을 붙인다. 한글 제목은 파일로 넘긴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  fs.mkdirSync(path.join(repo, '.github'));
  fs.writeFileSync(path.join(repo, '.github', 'pull_request_template.md'), TEMPLATE);
  const gh = fakeGh(sb);
  const section = sb.input('section.md', SECTION_1);

  const preview = wcOk(sb, ['pr', 'preview', '--section', section, '--template', '.github/pull_request_template.md', '--out', sb.outPath('p.md')], { cwd: repo, env: gh.env });
  assert.equal(preview.action, 'create');
  assert.equal(preview.templateUsed, true);
  const previewBody = fs.readFileSync(preview.out, 'utf8');

  const created = wcOk(
    sb,
    ['pr', 'create', '--title-file', sb.input('title.txt', 'feat: 토큰 자동 갱신 "따옴표"'), '--section', section, '--base', 'main', '--template', '.github/pull_request_template.md'],
    { cwd: repo, env: gh.env },
  );
  assert.equal(created.number, 1);
  assert.equal(created.url, 'https://github.com/o/r/pull/1');
  const pr = gh.state().prs[0];
  assert.equal(pr.title, 'feat: 토큰 자동 갱신 "따옴표"');
  assert.equal(pr.head, 'feat/토큰');
  assert.equal(pr.body, previewBody, '미리보기와 실제 본문이 같다');
  assert.ok(pr.body.startsWith(TEMPLATE.trimEnd()), '템플릿이 그대로 위에 있다');
  assert.equal(findSection(pr.body).content, SECTION_1);
  assert.equal(
    gh.calls().some((c) => c.join(' ').includes('토큰 자동 갱신')),
    false,
    '한글 제목이 명령줄 인자로 넘어가지 않는다',
  );

  const again = wc(sb, ['pr', 'create', '--title-file', sb.input('t2.txt', 'x'), '--section', section, '--base', 'main'], { cwd: repo, env: gh.env });
  assert.equal(again.json.error.code, 'PR_EXISTS');
});

test('이미 있는 PR은 whycommit 부분만 바꾸고 나머지는 그대로 둔다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  const gh = fakeGh(sb);
  wcOk(sb, ['pr', 'create', '--title-file', sb.input('t.txt', '제목'), '--section', sb.input('s1.md', SECTION_1), '--base', 'main'], { cwd: repo, env: gh.env });
  // 사용자가 GitHub에서 whycommit 부분 밖에 내용을 더했다 (웹에서 고치면 CRLF가 된다)
  gh.setState((s) => {
    s.prs[0].body = `리뷰어에게: 로그인 흐름을 봐 주세요.\r\n\r\n${s.prs[0].body.replace(/\n/g, '\r\n')}`;
  });

  const s2 = sb.input('s2.md', SECTION_2);
  const preview = wcOk(sb, ['pr', 'preview', '--section', s2, '--out', sb.outPath('p.md')], { cwd: repo, env: gh.env });
  assert.equal(preview.action, 'update');
  assert.equal(preview.sectionState, 'unchanged', 'CRLF로 바뀐 것만으로는 직접 고친 것으로 보지 않는다');
  assert.equal(preview.needsConfirm, null);

  wcOk(sb, ['pr', 'update', '--section', s2, '--expect-body-hash', preview.bodyHash], { cwd: repo, env: gh.env });
  const body = gh.state().prs[0].body;
  assert.ok(body.startsWith('리뷰어에게: 로그인 흐름을 봐 주세요.'), '사용자가 쓴 부분은 그대로');
  assert.equal(findSection(body).content, SECTION_2);
  assert.equal(body, fs.readFileSync(preview.out, 'utf8'));
});

test('사용자가 GitHub에서 whycommit 부분을 고쳤으면 --confirm overwrite 없이는 바꾸지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  const gh = fakeGh(sb);
  wcOk(sb, ['pr', 'create', '--title-file', sb.input('t.txt', '제목'), '--section', sb.input('s1.md', SECTION_1), '--base', 'main'], { cwd: repo, env: gh.env });
  gh.setState((s) => {
    s.prs[0].body = s.prs[0].body.replace('- 토큰 갱신 추가', '- 토큰 갱신 추가 (리뷰 반영: 만료 5분 전 갱신)');
  });

  const current = sb.outPath('current.md');
  const status = wcOk(sb, ['pr', 'status', '--out-current', current], { cwd: repo, env: gh.env });
  assert.equal(status.sectionState, 'edited');
  assert.equal(status.needsConfirm, 'overwrite');
  assert.match(fs.readFileSync(current, 'utf8'), /리뷰 반영: 만료 5분 전 갱신/, '고친 내용을 파일로 받아 diff를 보여 줄 수 있다');

  const s2 = sb.input('s2.md', SECTION_2);
  const before = gh.state().prs[0].body;
  const refused = wc(sb, ['pr', 'update', '--section', s2, '--expect-body-hash', status.bodyHash], { cwd: repo, env: gh.env });
  assert.equal(refused.json.error.code, 'NEEDS_CONFIRMATION');
  assert.equal(gh.state().prs[0].body, before, '말없이 덮어쓰지 않는다');

  wcOk(sb, ['pr', 'update', '--section', s2, '--expect-body-hash', status.bodyHash, '--confirm', 'overwrite'], { cwd: repo, env: gh.env });
  assert.equal(findSection(gh.state().prs[0].body).content, SECTION_2);
  assert.equal(wcOk(sb, ['pr', 'status'], { cwd: repo, env: gh.env }).sectionState, 'unchanged');
});

test('미리보기 뒤에 본문이 바뀌면 BODY_CHANGED로 멈춘다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  const gh = fakeGh(sb);
  wcOk(sb, ['pr', 'create', '--title-file', sb.input('t.txt', '제목'), '--section', sb.input('s1.md', SECTION_1), '--base', 'main'], { cwd: repo, env: gh.env });
  const s2 = sb.input('s2.md', SECTION_2);
  const preview = wcOk(sb, ['pr', 'preview', '--section', s2, '--out', sb.outPath('p.md')], { cwd: repo, env: gh.env });
  gh.setState((s) => {
    s.prs[0].body += '\n동료가 방금 추가한 줄';
  });
  const r = wc(sb, ['pr', 'update', '--section', s2, '--expect-body-hash', preview.bodyHash], { cwd: repo, env: gh.env });
  assert.equal(r.json.error.code, 'BODY_CHANGED');
});

test('마커를 지웠으면 removed, 마커가 깨졌으면 SECTION_BROKEN', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  const gh = fakeGh(sb);
  wcOk(sb, ['pr', 'create', '--title-file', sb.input('t.txt', '제목'), '--section', sb.input('s1.md', SECTION_1), '--base', 'main'], { cwd: repo, env: gh.env });
  const s2 = sb.input('s2.md', SECTION_2);

  gh.setState((s) => {
    s.prs[0].body = '사용자가 본문을 통째로 다시 썼다';
  });
  const removed = wcOk(sb, ['pr', 'status'], { cwd: repo, env: gh.env });
  assert.equal(removed.sectionState, 'removed');
  assert.equal(wc(sb, ['pr', 'update', '--section', s2, '--expect-body-hash', removed.bodyHash], { cwd: repo, env: gh.env }).json.error.code, 'NEEDS_CONFIRMATION');
  wcOk(sb, ['pr', 'update', '--section', s2, '--expect-body-hash', removed.bodyHash, '--confirm', 'append'], { cwd: repo, env: gh.env });
  assert.ok(gh.state().prs[0].body.startsWith('사용자가 본문을 통째로 다시 썼다\n\n'));

  gh.setState((s) => {
    s.prs[0].body = `${START}\n반쯤 지워진 부분`;
  });
  const broken = wc(sb, ['pr', 'preview', '--section', s2, '--out', sb.outPath('p.md')], { cwd: repo, env: gh.env });
  assert.equal(broken.json.error.code, 'SECTION_BROKEN');
  gh.setState((s) => {
    s.prs[0].body = `${START}\na\n${END}\n${START}\nb\n${END}`;
  });
  assert.equal(wcOk(sb, ['pr', 'status'], { cwd: repo, env: gh.env }).sectionState, 'duplicated');
});

test('사용자가 직접 만든 PR에는 확인 없이 아래에 붙이고, 닫힌 PR만 있으면 알려 준다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  const gh = fakeGh(sb, {
    nextNumber: 3,
    prs: [
      { number: 1, title: '예전 PR', body: '', head: 'feat/토큰', base: 'main', state: 'MERGED', url: 'https://github.com/o/r/pull/1' },
    ],
  });
  const closedOnly = wcOk(sb, ['pr', 'status'], { cwd: repo, env: gh.env });
  assert.equal(closedOnly.exists, false);
  assert.deepEqual(closedOnly.otherPrs, [{ number: 1, state: 'MERGED', url: 'https://github.com/o/r/pull/1' }]);

  gh.setState((s) => {
    s.prs.push({ number: 2, title: '직접 만든 PR', body: '제가 직접 쓴 설명', head: 'feat/토큰', base: 'main', state: 'OPEN', url: 'https://github.com/o/r/pull/2' });
  });
  const status = wcOk(sb, ['pr', 'status'], { cwd: repo, env: gh.env });
  assert.equal(status.sectionState, 'absent');
  assert.equal(status.needsConfirm, null);
  wcOk(sb, ['pr', 'update', '--section', sb.input('s1.md', SECTION_1), '--expect-body-hash', status.bodyHash], { cwd: repo, env: gh.env });
  assert.equal(gh.state().prs[1].body, `제가 직접 쓴 설명\n\n${START}\n${SECTION_1}\n${END}\n`);
});

test('gh가 없을 때는 --offline으로 PR 본문만 만든다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  fs.writeFileSync(path.join(repo, 'pull_request_template.md'), TEMPLATE);
  const out = sb.outPath('body.md');
  const r = wcOk(sb, ['pr', 'preview', '--offline', '--section', sb.input('s.md', SECTION_1), '--template', 'pull_request_template.md', '--out', out], {
    cwd: repo,
    env: NO_GH,
  });
  assert.equal(r.action, 'create');
  assert.equal(fs.readFileSync(out, 'utf8'), `${TEMPLATE.trimEnd()}\n\n${START}\n${SECTION_1}\n${END}\n`);
});

test('gh issues는 열린 이슈를 파일로 쓴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  const gh = fakeGh(sb, { issues: [{ number: 7, title: '로그인 에러 메시지 개선', url: 'https://github.com/o/r/issues/7', labels: [] }] });
  const out = sb.outPath('issues.json');
  assert.equal(wcOk(sb, ['gh', 'issues', '--out', out], { cwd: repo, env: gh.env }).count, 1);
  assert.equal(readJsonFile(out).issues[0].title, '로그인 에러 메시지 개선');
});

test('repo push는 일반 푸시만 하고, 원격이 앞서 있으면 거절된 그대로 알린다 (강제 푸시 없음)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = githubRepo(sb);
  const pushed = wcOk(sb, ['repo', 'push'], { cwd: repo });
  assert.deepEqual(pushed, { ok: true, remote: 'origin', branch: 'feat/토큰' });
  assert.equal(wcOk(sb, ['git', 'pushed'], { cwd: repo }).pushed, true);
  assert.equal(git(sb, repo, ['rev-parse', '--abbrev-ref', '@{u}']).trim(), 'origin/feat/토큰');

  // 다른 곳에서 같은 브랜치에 커밋을 올린다
  const bare = path.join(sb.root, 'repo 원격.git');
  const other = sb.dir('다른 사람');
  git(sb, other, ['clone', '-q', '-b', 'feat/토큰', bare, '.']);
  const theirs = commitFile(sb, other, 'theirs.txt', 't\n', 'their commit');
  git(sb, other, ['push', '-q']);

  commitFile(sb, repo, 'mine.txt', 'm\n', 'my commit');
  const r = wc(sb, ['repo', 'push'], { cwd: repo });
  assert.equal(r.json.error.code, 'PUSH_REJECTED');
  assert.equal(git(sb, bare, ['rev-parse', 'refs/heads/feat/토큰']).trim(), theirs, '원격의 커밋이 덮어써지지 않았다');

  const local = makeRepo(sb, 'no-remote');
  assert.equal(wc(sb, ['repo', 'push'], { cwd: local }).json.error.code, 'NO_REMOTE');
});

test('마무리 모드: 푸시 전이면 마지막 커밋 본문에 기록하고, 스테이징된 변경은 섞지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  fs.writeFileSync(path.join(repo, 'a.js'), 'a\n');
  git(sb, repo, ['add', 'a.js']);
  git(sb, repo, ['commit', '-q', '-m', 'feat: 기능 추가', '-m', 'Co-Authored-By: Someone <s@example.com>']);
  fs.writeFileSync(path.join(repo, 'staged.js'), 's\n');
  git(sb, repo, ['add', 'staged.js']);
  const body = sb.input('body.txt', '오늘 한 작업\n- 기능 추가\n\n남은 작업\n- 테스트 (TODO 주석: a.js:3)\n');
  const before = git(sb, repo, ['rev-parse', 'HEAD']).trim();

  const dry = wcOk(sb, ['commit', 'amend-body', '--file', body, '--dry-run', '--out', sb.outPath('msg.txt')], { cwd: repo });
  assert.equal(dry.sha, before);
  assert.equal(git(sb, repo, ['rev-parse', 'HEAD']).trim(), before, 'dry-run은 커밋을 바꾸지 않는다');
  const expected = 'feat: 기능 추가\n\n오늘 한 작업\n- 기능 추가\n\n남은 작업\n- 테스트 (TODO 주석: a.js:3)\n\nCo-Authored-By: Someone <s@example.com>\n';
  assert.equal(fs.readFileSync(dry.out, 'utf8'), expected, '트레일러는 맨 끝에 남는다');

  const out = wcOk(sb, ['commit', 'amend-body', '--file', body], { cwd: repo });
  assert.equal(out.oldSha, before);
  assert.notEqual(out.newSha, before);
  assert.equal(git(sb, repo, ['log', '-1', '--format=%B']).trimEnd(), expected.trimEnd());
  assert.deepEqual(git(sb, repo, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n'), ['a.js'], '스테이징된 staged.js는 커밋에 안 들어갔다');
  assert.equal(git(sb, repo, ['diff', '--cached', '--name-only']).trim(), 'staged.js', '여전히 스테이징돼 있다');
  assert.equal(wcOk(sb, ['state', 'get'], { cwd: repo }).lastQuizzed, out.newSha, '마지막으로 퀴즈를 본 커밋도 새 커밋으로');
});

test('마무리 모드: 이미 푸시한 커밋은 건드리지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, 'repo', { pushTo: true });
  git(sb, repo, ['push', '-q', '-u', 'origin', 'main']);
  const before = git(sb, repo, ['rev-parse', 'HEAD']).trim();
  const r = wc(sb, ['commit', 'amend-body', '--file', sb.input('b.txt', '오늘 한 작업\n- x')], { cwd: repo });
  assert.equal(r.json.error.code, 'ALREADY_PUSHED');
  assert.equal(git(sb, repo, ['rev-parse', 'HEAD']).trim(), before);
});

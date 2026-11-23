import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseRemoteUrl } from '../src/lib/project.mjs';
import { KO, createSandbox, git, makeRepo, readJsonFile, wc, wcOk } from './helpers.mjs';

test('원격 URL 형식마다 owner/repo를 뽑고 소문자로 통일한다', () => {
  const cases = [
    ['https://github.com/Roof1004/WhyCommit.git', 'github.com', 'roof1004/whycommit', true],
    ['https://github.com/roof1004/whycommit', 'github.com', 'roof1004/whycommit', true],
    ['https://github.com/roof1004/whycommit/', 'github.com', 'roof1004/whycommit', true],
    ['https://user:secret@github.com/o/r.git', 'github.com', 'o/r', true],
    ['git@github.com:roof1004/whycommit.git', 'github.com', 'roof1004/whycommit', true],
    ['ssh://git@ssh.github.com:443/o/r.git', 'ssh.github.com', 'o/r', true],
    ['git://github.com/o/r', 'github.com', 'o/r', true],
    ['https://gitlab.com/group/sub/repo.git', 'gitlab.com', 'group/sub/repo', false],
  ];
  for (const [url, host, id, isGitHub] of cases) {
    assert.deepEqual(parseRemoteUrl(url), { host, id, isGitHub }, url);
  }
});

test('로컬 경로 원격은 원격으로 치지 않는다', () => {
  for (const url of ['/srv/git/repo.git', 'C:\\repos\\x.git', 'C:/repos/x.git', '../remote.git', 'file:///tmp/x.git', '']) {
    assert.equal(parseRemoteUrl(url), null, url);
  }
});

test('GitHub 원격이 있으면 owner/repo로 식별하고, URL(토큰 포함 가능)은 출력하지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, 'repo', { remoteUrl: 'https://user:tok123@github.com/Test-Owner/Repo-Name.git' });
  const r = wc(sb, ['project', 'info'], { cwd: repo });
  assert.equal(r.status, 0);
  assert.equal(r.json.project.id, 'test-owner/repo-name');
  assert.deepEqual(r.json.project.remote, { name: 'origin', host: 'github.com', isGitHub: true });
  assert.equal(r.json.project.dir, path.join(sb.home, 'projects', 'test-owner', 'repo-name'));
  assert.equal(r.stdout.includes('tok123'), false);
});

test('원격이 없으면 _local/<폴더 이름> (한글과 공백 그대로)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, `내 레포 ${KO}`);
  const sub = path.join(repo, 'src', '하위 폴더');
  fs.mkdirSync(sub, { recursive: true });
  const out = wcOk(sb, ['project', 'info'], { cwd: sub });
  assert.equal(out.project.id, `_local/내 레포 ${KO}`);
  // git은 진짜 경로를 돌려준다 (macOS의 /private/var, Windows의 8.3 짧은 이름 등이 풀린 모양)
  assert.equal(out.project.top, fs.realpathSync.native(repo));
});

test('origin이 없으면 이름순 첫 원격을 쓴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, 'repo');
  git(sb, repo, ['remote', 'add', 'zeta', 'https://github.com/z/z.git']);
  git(sb, repo, ['remote', 'add', 'alpha', 'git@github.com:a/a.git']);
  assert.equal(wcOk(sb, ['project', 'info'], { cwd: repo }).project.id, 'a/a');
});

function noteInput(topic) {
  return {
    entries: [
      {
        topic,
        questionType: 'why',
        attempt: { question: `${topic}을 왜 이렇게 했나요?`, answerSummary: '모름', result: 'dont_know', explanation: '해설' },
      },
    ],
  };
}

test('원격이 나중에 생기면 _local 노트를 알려 주고, 요청하면 옮긴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, '나중에 원격');
  wcOk(sb, ['notes', 'add', '--file', sb.input('a.json', noteInput('로컬에서 쓴 주제'))], { cwd: repo });
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });

  git(sb, repo, ['remote', 'add', 'origin', 'git@github.com:me/later.git']);
  const info = wcOk(sb, ['project', 'info'], { cwd: repo }).project;
  assert.equal(info.id, 'me/later');
  assert.equal(info.legacyLocal.id, '_local/나중에 원격');

  const moved = wcOk(sb, ['project', 'migrate-local'], { cwd: repo });
  assert.equal(moved.movedEntries, 1);
  const notes = readJsonFile(path.join(sb.home, 'projects', 'me', 'later', 'notes.json'));
  assert.equal(notes.project, 'me/later');
  assert.equal(notes.entries[0].topic, '로컬에서 쓴 주제');
  const md = fs.readFileSync(path.join(sb.home, 'projects', 'me', 'later', 'notes.md'), 'utf8');
  assert.match(md, /학습 노트: me\/later/);
  assert.ok(wcOk(sb, ['state', 'get'], { cwd: repo }).lastQuizzed, '상태도 함께 옮겨진다');
  assert.equal(fs.existsSync(path.join(sb.home, 'projects', '_local', '나중에 원격')), false);
  assert.equal(wcOk(sb, ['project', 'info'], { cwd: repo }).project.legacyLocal, null);
});

test('옮길 대상에 이미 노트가 있으면 합친다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, 'merge-me');
  wcOk(sb, ['notes', 'add', '--file', sb.input('a.json', noteInput('로컬 주제'))], { cwd: repo });
  git(sb, repo, ['remote', 'add', 'origin', 'https://github.com/me/merge-me.git']);
  wcOk(sb, ['notes', 'add', '--file', sb.input('b.json', noteInput('원격 주제'))], { cwd: repo });
  wcOk(sb, ['project', 'migrate-local'], { cwd: repo });
  const topics = readJsonFile(path.join(sb.home, 'projects', 'me', 'merge-me', 'notes.json')).entries.map((e) => e.topic);
  assert.deepEqual(topics.sort(), ['로컬 주제', '원격 주제'].sort());
});

test('옮길 것이 없으면 NOTHING_TO_MIGRATE', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, 'repo', { remoteUrl: 'https://github.com/a/b.git' });
  const r = wc(sb, ['project', 'migrate-local'], { cwd: repo });
  assert.equal(r.status, 1);
  assert.equal(r.json.error.code, 'NOTHING_TO_MIGRATE');
});

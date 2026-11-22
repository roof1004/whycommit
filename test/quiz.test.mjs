import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { splitItems } from '../src/lib/body.mjs';
import { classifyPath } from '../src/lib/classify.mjs';
import { KO, commitFile, createSandbox, git, makeRepo, readJsonFile, wc, wcOk } from './helpers.mjs';

function changes(sb, repo, ...args) {
  const out = sb.outPath(`changes-${Math.random().toString(16).slice(2)}.json`);
  const summary = wcOk(sb, ['quiz', 'changes', '--out', out, ...args], { cwd: repo });
  return { summary, data: readJsonFile(out) };
}

test('경로로 문서·이미지·잠금 파일·코드를 나눈다', () => {
  const cases = {
    'README.md': 'docs',
    'docs/guide/설치.md': 'docs',
    'docs/conf.py': 'docs',
    LICENSE: 'docs',
    'CHANGELOG.md': 'docs',
    'notes.txt': 'docs',
    'requirements.txt': 'code',
    'CMakeLists.txt': 'code',
    'assets/logo.png': 'asset',
    'package-lock.json': 'lockfile',
    'web/yarn.lock': 'lockfile',
    'src/app.js': 'code',
    'config/settings.yaml': 'code',
    'package.json': 'code',
  };
  for (const [p, expected] of Object.entries(cases)) assert.equal(classifyPath(p), expected, p);
});

test('문서만 바뀌면 건너뛰기 후보', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });
  commitFile(sb, repo, 'README.md', '# 설명을 고침\n', 'docs: README');
  commitFile(sb, repo, 'docs/사용법.md', '사용법\n', 'docs: 사용법');
  const { summary } = changes(sb, repo);
  assert.equal(summary.skipCandidate, true);
  assert.deepEqual(summary.classes, { docs: 2 });
});

test('공백만 바뀐 코드, 이름만 바뀐 파일, 잠금 파일은 건너뛰기 쪽, 코드 변경이 섞이면 후보가 아니다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  commitFile(sb, repo, 'src/a.js', 'function a() {\n  return 1;\n}\n', 'a');
  commitFile(sb, repo, 'src/old.js', 'export const x = 1;\n', 'old');
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });

  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'function a() {\n    return 1;\n\n}\n');
  git(sb, repo, ['mv', 'src/old.js', 'src/new.js']);
  fs.writeFileSync(path.join(repo, 'package-lock.json'), '{}\n');
  git(sb, repo, ['add', '-A']);
  git(sb, repo, ['commit', '-q', '-m', 'chore: 정리']);
  let { summary, data } = changes(sb, repo);
  assert.equal(summary.skipCandidate, true);
  const byPath = Object.fromEntries(data.files.map((f) => [f.path, f.class]));
  assert.deepEqual(byPath, { 'src/a.js': 'format_only', 'src/new.js': 'rename_only', 'package-lock.json': 'lockfile' });

  commitFile(sb, repo, 'src/b.js', 'export const b = () => fetch("/api");\n', 'feat: b');
  ({ summary } = changes(sb, repo));
  assert.equal(summary.skipCandidate, false);
  assert.equal(summary.classes.code, 1);
});

test('커밋 제목(한글), 첫 커밋부터의 diff, 바뀐 파일의 TODO 주석을 모은다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = sb.dir('처음부터');
  git(sb, repo, ['init', '-q', '-b', 'main']);
  commitFile(sb, repo, `src/세션 ${KO}.js`, 'export function s() {}\n// TODO: 토큰 만료 처리\n', 'feat: 세션 추가');
  commitFile(sb, repo, 'src/other.js', '// FIXME 나중에\n', 'feat: other');
  commitFile(sb, repo, 'src/untouched.js', '// TODO: 이건 범위 밖이 아님\n', 'feat: untouched');

  const { summary, data } = changes(sb, repo);
  assert.equal(summary.reason, 'unpushed');
  assert.equal(data.range.fromRoot, true);
  assert.deepEqual(
    data.commits.map((c) => c.subject),
    ['feat: 세션 추가', 'feat: other', 'feat: untouched'],
  );
  assert.match(data.diff, /\+\/\/ TODO: 토큰 만료 처리/);
  const found = data.todos.map((x) => `${x.path}:${x.line}:${x.text}`).sort();
  assert.deepEqual(
    found,
    ['src/other.js:1:// FIXME 나중에', `src/세션 ${KO}.js:2:// TODO: 토큰 만료 처리`, 'src/untouched.js:1:// TODO: 이건 범위 밖이 아님'].sort(),
  );
});

test('TODO는 이번 범위에서 바뀐 파일에서만 찾는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  commitFile(sb, repo, 'old.js', '// TODO: 예전 할 일\n', 'old');
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });
  commitFile(sb, repo, 'new.js', 'const a = 1; // TODO 새 할 일\n', 'new');
  const { data } = changes(sb, repo);
  assert.deepEqual(data.todos, [{ path: 'new.js', line: 1, text: 'const a = 1; // TODO 새 할 일' }]);
});

test('새 커밋이 없으면 empty, 기본 브랜치를 모르면 NEED_DEFAULT_BRANCH', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  wcOk(sb, ['state', 'set-last-quizzed'], { cwd: repo });
  assert.equal(changes(sb, repo).summary.empty, true);

  const dev = sb.dir('develop-only');
  git(sb, dev, ['init', '-q', '-b', 'develop']);
  commitFile(sb, dev, 'a.txt', 'a\n', 'a');
  git(sb, dev, ['switch', '-q', '-c', 'feature']);
  commitFile(sb, dev, 'b.js', 'b\n', 'b');
  const r = wc(sb, ['quiz', 'changes', '--out', sb.outPath('x.json'), '--mode', 'pr'], { cwd: dev });
  assert.equal(r.json.error.code, 'NEED_DEFAULT_BRANCH');
  assert.equal(changes(sb, dev, '--mode', 'pr', '--default-branch', 'develop').summary.count, 1);
});

test('기획 문서 후보를 찾고, 기억한 위치를 먼저 알려 준다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  for (const f of ['기획서.md', 'docs/plan.md', 'docs/notes.md', 'src/plan.js', 'sub/README.md']) {
    fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    fs.writeFileSync(path.join(repo, f), 'x\n');
  }
  let out = wcOk(sb, ['plan-doc', 'find'], { cwd: repo });
  assert.equal(out.remembered, null);
  assert.deepEqual(out.candidates, ['기획서.md', 'docs/plan.md', 'docs/notes.md', 'README.md']);

  wcOk(sb, ['state', 'set-plan-doc', '--path', 'docs/plan.md'], { cwd: repo });
  out = wcOk(sb, ['plan-doc', 'find'], { cwd: repo });
  assert.deepEqual(out.remembered, { path: 'docs/plan.md' });
  assert.equal(out.rememberedExists, true);
  assert.equal(out.candidates.includes('docs/plan.md'), false);
});

test('"직접 쓸게" 입력을 줄바꿈과 쉼표로 나누고, 문장은 고치지 않는다', () => {
  assert.deepEqual(splitItems('로그인 실패 메시지 다듬기, 테스트 추가\n문서 정리'), ['로그인 실패 메시지 다듬기', '테스트 추가', '문서 정리']);
  assert.deepEqual(splitItems('예산 1,000원 넘으면 알림, 캐시 정리'), ['예산 1,000원 넘으면 알림', '캐시 정리']);
  assert.deepEqual(splitItems('- 첫째\n2. 둘째\n\n  * 셋째  \n'), ['첫째', '둘째', '셋째']);
  assert.deepEqual(splitItems('가、나，다'), ['가', '나', '다']);
  assert.deepEqual(splitItems('맞춤법이 틀린 문장도 그대로 둠니다'), ['맞춤법이 틀린 문장도 그대로 둠니다']);
});

test('draft split은 파일로 받아 파일로 돌려준다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const out = sb.outPath('items.json');
  wcOk(sb, ['draft', 'split', '--file', sb.input('manual.txt', '테스트 추가, 리팩터링\r\n배포'), '--out', out]);
  assert.deepEqual(readJsonFile(out).items, ['테스트 추가', '리팩터링', '배포']);
});

function quizNotes(sb, repo) {
  return wcOk(
    sb,
    [
      'notes',
      'add',
      '--file',
      sb.input('n.json', {
        entries: [
          { topic: '401에서만 갱신한 이유', attempt: { question: 'q', answerSummary: 'a', result: 'correct' } },
          { topic: '동시 401과 중복 갱신', attempt: { question: 'q', answerSummary: '', result: 'dont_know', explanation: 'e' } },
        ],
      }),
    ],
    { cwd: repo },
  );
}

const DRAFT = {
  done: ['401 응답에서 토큰을 갱신하고 재요청', '갱신 중복 방지'],
  todo: [
    { text: '갱신 실패 시 로그아웃', source: 'plan' },
    { text: '재시도 횟수 제한', source: 'todo', ref: 'src/session.js:12' },
    { text: '에러 메시지 다듬기', source: 'issue', ref: '#7' },
    { text: '나중에 캐시 붙이기', source: 'conversation' },
    { text: 'token을 가져오는 코드 추가', source: 'quiz' },
    { text: '직접 쓴 항목', source: 'user' },
  ],
};

test('본문은 네 항목 이름을 그대로 쓰고, 기본으로는 학습 내용을 넣지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  quizNotes(sb, repo);
  const out = sb.outPath('body.md');
  const r = wcOk(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--out', out], { cwd: repo });
  assert.equal(r.includeLearning, false);
  assert.equal(
    fs.readFileSync(out, 'utf8'),
    [
      '### 오늘 한 작업',
      '- 401 응답에서 토큰을 갱신하고 재요청',
      '- 갱신 중복 방지',
      '',
      '### 남은 작업',
      '- 갱신 실패 시 로그아웃 (기획 문서)',
      '- 재시도 횟수 제한 (TODO 주석: src/session.js:12)',
      '- 에러 메시지 다듬기 (이슈 #7)',
      '- 나중에 캐시 붙이기 (대화)',
      '- token을 가져오는 코드 추가 (퀴즈에서 확인)',
      '- 직접 쓴 항목',
      '',
    ].join('\n'),
  );
});

test('학습 내용 포함을 켜면 주제만 한 줄씩, 노트에서만 가져온다 (원칙 1)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const added = quizNotes(sb, repo);
  const out = sb.outPath('body.md');

  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', { ...DRAFT, learning: { include: true, ids: added.ids.map((x) => x.id) } }), '--out', out], { cwd: repo });
  const body = fs.readFileSync(out, 'utf8');
  assert.match(body, /### 이해한 내용\n- 401에서만 갱신한 이유\n\n### 이해하지 못한 내용\n- 동시 401과 중복 갱신\n$/);

  const forged = wc(sb, ['body', 'render', '--file', sb.input('f.json', { ...DRAFT, understood: ['지어낸 주제'] }), '--out', out], { cwd: repo });
  assert.equal(forged.json.error.code, 'INVALID_INPUT', '초안에 이해한 내용을 직접 넣을 수 없다');

  wcOk(sb, ['config', 'set', '--key', 'body.includeLearning', '--value', 'true']);
  const r = wcOk(sb, ['body', 'render', '--file', sb.input('d2.json', DRAFT), '--out', out], { cwd: repo });
  assert.equal(r.includeLearning, true, '설정을 켜면 초안에 말하지 않아도 넣는다 (현재 브랜치의 노트)');
  assert.match(fs.readFileSync(out, 'utf8'), /### 이해하지 못한 내용/);
});

test('커밋 본문용은 "#" 없이 쓰고, 다 비우면 EMPTY_BODY', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const out = sb.outPath('body.txt');
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', { done: ['한 일'], todo: [] }), '--target', 'commit', '--out', out], { cwd: repo });
  assert.equal(fs.readFileSync(out, 'utf8'), '오늘 한 작업\n- 한 일\n');
  const empty = wc(sb, ['body', 'render', '--file', sb.input('e.json', { done: [], todo: [] }), '--out', out], { cwd: repo });
  assert.equal(empty.json.error.code, 'EMPTY_BODY');
});

// 셸 스모크 테스트 (CI 전용).
// 단위 테스트는 Node가 직접 자식 프로세스를 띄우므로 셸을 거치지 않는다.
// 이 스크립트는 "셸이 한글·공백 경로를 node 인자로 제대로 넘기는지"를 확인하려고,
// 준비(prepare)와 확인(verify)만 하고 실제 wc.mjs 호출은 CI의 각 셸이 직접 한다.
//
//   node test/smoke.mjs prepare <base>   <base>/repo 레포와 <base>/in.json 입력을 만든다
//   (셸에서) cd <base>/repo && WHYCOMMIT_HOME=<base>/data node <src>/wc.mjs notes add --file <base>/in.json
//   node test/smoke.mjs verify <base>    저장된 노트가 입력과 같은지, 레포가 깨끗한지 확인한다
//
// Shell smoke test (CI only).
// The unit tests start child processes directly from Node, so they never go through a shell.
// To check that "the shell passes paths with Korean characters and spaces to node correctly",
// this script only prepares and verifies; each shell in CI calls wc.mjs itself.
//
//   node test/smoke.mjs prepare <base>   creates the <base>/repo repo and the <base>/in.json input
//   (in the shell) cd <base>/repo && WHYCOMMIT_HOME=<base>/data node <src>/wc.mjs notes add --file <base>/in.json
//   node test/smoke.mjs verify <base>    checks that the saved note matches the input and the repo is clean

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EXPLANATION = '첫째 줄 해설\n\n둘째 단락: 공백과 한글, 그리고 "따옴표"와 $변수 같은 셸 특수문자.';
const TOPIC = '스모크 테스트 주제 홍길동';

function gitRun(cwd, args) {
  return execFileSync('git', ['-c', 'user.name=smoke', '-c', 'user.email=smoke@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function fail(message) {
  process.stderr.write(`SMOKE FAIL: ${message}\n`);
  process.exit(1);
}

const [command, base] = process.argv.slice(2);
if (!base) fail('usage: node test/smoke.mjs prepare|verify <base>');

if (command === 'prepare') {
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  gitRun(repo, ['init', '-q']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  gitRun(repo, ['add', 'a.txt']);
  gitRun(repo, ['commit', '-q', '-m', 'init']);
  const input = {
    entries: [
      {
        topic: TOPIC,
        attempt: { question: '왜 이렇게 했나요?', answerSummary: '', result: 'dont_know', explanation: EXPLANATION },
      },
    ],
  };
  fs.writeFileSync(path.join(base, 'in.json'), JSON.stringify(input, null, 2));
  process.stdout.write(`prepared ${base}\n`);
} else if (command === 'verify') {
  const notesFile = path.join(base, 'data', 'projects', '_local', 'repo', 'notes.json');
  if (!fs.existsSync(notesFile)) fail(`notes.json was not created at ${notesFile}`);
  const bytes = fs.readFileSync(notesFile);
  if (bytes[0] === 0xef) fail('notes.json has a BOM');
  if (bytes.includes(0x0d)) fail('notes.json has CR characters');
  const entry = JSON.parse(bytes.toString('utf8')).entries[0];
  if (entry.topic !== TOPIC) fail(`topic mismatch: ${JSON.stringify(entry.topic)}`);
  if (entry.attempts[0].explanation !== EXPLANATION) fail('explanation mismatch');
  const md = fs.readFileSync(path.join(path.dirname(notesFile), 'notes.md'), 'utf8');
  if (!md.includes(TOPIC)) fail('notes.md does not contain the topic');
  const status = gitRun(path.join(base, 'repo'), ['status', '--porcelain']).trim();
  if (status !== '') fail(`the repository is not clean:\n${status}`);
  process.stdout.write('smoke ok\n');
} else {
  fail(`unknown command ${command}`);
}

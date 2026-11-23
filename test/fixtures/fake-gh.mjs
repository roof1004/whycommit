// 테스트용 가짜 GitHub CLI.
// wc.mjs는 WHYCOMMIT_GH에 이 파일 경로가 있으면 진짜 gh 대신 "node fake-gh.mjs ..."를 실행한다.
// PR과 이슈는 FAKE_GH_STATE(JSON 파일)에 저장하고, 호출 기록은 FAKE_GH_LOG에 한 줄씩 남긴다.
// whycommit이 실제로 쓰는 명령만 흉내 낸다.
//
// A fake GitHub CLI for tests.
// If WHYCOMMIT_GH holds this file's path, wc.mjs runs "node fake-gh.mjs ..." instead of the real gh.
// PRs and issues are stored in FAKE_GH_STATE (a JSON file), and each call is logged as one line in FAKE_GH_LOG.
// It imitates only the commands whycommit actually uses.

import fs from 'node:fs';

const stateFile = process.env.FAKE_GH_STATE;
const logFile = process.env.FAKE_GH_LOG;
const args = process.argv.slice(2);
if (logFile) fs.appendFileSync(logFile, `${JSON.stringify(args)}\n`);

const load = () => {
  const base = { auth: true, defaultBranch: 'main', prs: [], issues: [], nextNumber: 1 };
  return stateFile && fs.existsSync(stateFile) ? { ...base, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) } : base;
};
const save = (state) => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
const print = (value) => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const state = load();
const [first, second] = args;

if (first === '--version') {
  print('gh version 2.99.0 (fake)\n');
} else if (first === 'auth' && second === 'status') {
  if (!state.auth) fail('You are not logged into any GitHub hosts.');
  print('Logged in to github.com\n');
} else if (first === 'repo' && second === 'view') {
  print({ defaultBranchRef: { name: state.defaultBranch } });
} else if (first === 'pr' && second === 'list') {
  const head = option('--head');
  print(state.prs.filter((p) => p.head === head).map((p) => ({ number: p.number, state: p.state, url: p.url, headRefName: p.head })));
} else if (first === 'issue' && second === 'list') {
  print(state.issues);
} else if (first === 'api') {
  const endpoint = second;
  const method = option('--method') ?? 'GET';
  const input = option('--input') ? JSON.parse(fs.readFileSync(option('--input'), 'utf8')) : null;
  const one = /^repos\/\{owner\}\/\{repo\}\/pulls\/(\d+)$/.exec(endpoint);
  if (method === 'GET' && one) {
    const pr = state.prs.find((p) => p.number === Number(one[1]));
    if (!pr) fail('HTTP 404: Not Found');
    print({ number: pr.number, title: pr.title, body: pr.body, state: pr.state.toLowerCase(), html_url: pr.url });
  } else if (method === 'POST' && endpoint === 'repos/{owner}/{repo}/pulls') {
    if (state.prs.some((p) => p.head === input.head && p.state === 'OPEN')) fail('HTTP 422: A pull request already exists');
    const number = state.nextNumber;
    const pr = { number, title: input.title, body: input.body, head: input.head, base: input.base, state: 'OPEN', url: `https://github.com/o/r/pull/${number}` };
    state.prs.push(pr);
    state.nextNumber += 1;
    save(state);
    print({ number, html_url: pr.url });
  } else if (method === 'PATCH' && one) {
    const pr = state.prs.find((p) => p.number === Number(one[1]));
    if (!pr) fail('HTTP 404: Not Found');
    pr.body = input.body;
    save(state);
    print({ number: pr.number, html_url: pr.url });
  } else {
    fail(`fake gh: unsupported api call ${method} ${endpoint}`);
  }
} else {
  fail(`fake gh: unsupported command ${args.join(' ')}`);
}

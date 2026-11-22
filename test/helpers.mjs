// 테스트 도우미.
// 모든 테스트는 공백과 한글이 들어간 임시 폴더에서 돈다 (기획 9.2, 시나리오 16).
// 사용자의 git 설정과 홈 폴더를 건드리지 않도록 git 전역 설정과 데이터 폴더를 임시 경로로 바꾼다.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const WC = path.join(ROOT, 'src', 'wc.mjs');

export const KO = '홍길동';

export function createSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wc test ${KO} `));
  const home = path.join(root, '데이터 폴더', 'whycommit');
  const gitConfig = path.join(root, 'gitconfig');
  fs.writeFileSync(
    gitConfig,
    [
      '[user]',
      '\tname = whycommit test',
      '\temail = test@example.com',
      '[init]',
      '\tdefaultBranch = main',
      '[commit]',
      '\tgpgsign = false',
      '[core]',
      '\tautocrlf = false',
      '',
    ].join('\n'),
  );
  const env = { ...process.env, WHYCOMMIT_HOME: home, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of ['WHYCOMMIT_TODAY', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[key];

  const sandbox = {
    root,
    home,
    env,
    /** 샌드박스 안에 폴더를 만들고 경로를 돌려준다. */
    dir(...parts) {
      const p = path.join(root, ...parts);
      fs.mkdirSync(p, { recursive: true });
      return p;
    },
    /** 입력 파일을 만든다. 객체면 JSON으로, 문자열이면 그대로 쓴다. */
    input(name, value) {
      const file = path.join(root, '입력 파일', name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2));
      return file;
    },
    outPath(name) {
      return path.join(root, '출력', name);
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  return sandbox;
}

/** wc.mjs를 실행한다. 결과 JSON과 종료 코드를 돌려준다. */
export function wc(sb, args, { cwd = sb.root, env = {} } = {}) {
  const r = spawnSync(process.execPath, [WC, ...args], { cwd, env: { ...sb.env, ...env }, encoding: 'buffer' });
  const stdout = r.stdout.toString('utf8');
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    // help 같은 일반 텍스트 출력
  }
  return { status: r.status, stdout, stderr: r.stderr.toString('utf8'), json };
}

/** 성공해야 하는 실행. 실패하면 출력과 함께 예외를 던진다. */
export function wcOk(sb, args, opts) {
  const r = wc(sb, args, opts);
  if (r.status !== 0 || !r.json || r.json.ok !== true) {
    throw new Error(`wc ${args.join(' ')} failed with ${r.status}\n${r.stdout}\n${r.stderr}`);
  }
  return r.json;
}

export function git(sb, cwd, args) {
  return execFileSync('git', args, { cwd, env: sb.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function commitFile(sb, repo, rel, content, message) {
  const file = path.join(repo, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  git(sb, repo, ['add', '--', rel]);
  git(sb, repo, ['commit', '-q', '-m', message]);
  return git(sb, repo, ['rev-parse', 'HEAD']).trim();
}

/**
 * 커밋 하나가 있는 레포를 만든다.
 * remoteUrl을 주면 origin을 그 URL로 등록한다 (프로젝트 ID 확인용).
 * pushTo: true면 로컬 bare 레포를 push 주소로 붙여서 실제로 푸시할 수 있게 한다.
 */
export function makeRepo(sb, name = 'repo', { remoteUrl, pushTo = false } = {}) {
  const dir = sb.dir(name);
  git(sb, dir, ['init', '-q', '-b', 'main']);
  commitFile(sb, dir, 'README.md', '# test\n', 'init');
  if (remoteUrl) git(sb, dir, ['remote', 'add', 'origin', remoteUrl]);
  if (pushTo) {
    const bare = sb.dir(`${name} 원격.git`);
    git(sb, bare, ['init', '-q', '--bare']);
    if (!remoteUrl) git(sb, dir, ['remote', 'add', 'origin', bare]);
    else git(sb, dir, ['config', 'remote.origin.pushurl', bare]);
  }
  return dir;
}

/** 파일이 BOM 없는 UTF-8, LF인지 확인할 때 쓴다. */
export function rawBytes(file) {
  return fs.readFileSync(file);
}

export function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

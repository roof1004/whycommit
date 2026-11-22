// git 실행.
// 셸을 거치지 않고 인자 배열로 실행한다 (기획 9.1.7). 셸마다 따옴표 규칙이 달라서다.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WcError } from './cli.mjs';

/**
 * @param {string[]} args git 인자
 * @param {{cwd?: string, allowFail?: boolean, input?: string, unsetEnv?: string[]}} [opts]
 * @returns {{ok: boolean, status: number, stdout: string, stderr: string}}
 */
export function git(args, { cwd, allowFail = false, input, unsetEnv = [] } = {}) {
  if (cwd && !fs.existsSync(cwd)) throw new WcError('BAD_CWD', `Folder does not exist: ${cwd}`);
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const key of unsetEnv) delete env[key];
  try {
    const stdout = execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd,
      env,
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
      maxBuffer: 256 * 1024 * 1024,
    });
    return { ok: true, status: 0, stdout: stdout.toString('utf8'), stderr: '' };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new WcError('GIT_NOT_FOUND', 'git was not found on PATH. Install git and try again.');
    }
    const result = {
      ok: false,
      status: typeof error.status === 'number' ? error.status : 1,
      stdout: error.stdout ? error.stdout.toString('utf8') : '',
      stderr: error.stderr ? error.stderr.toString('utf8') : String(error.message),
    };
    if (allowFail) return result;
    throw new WcError('GIT_FAILED', `git ${args[0]} failed: ${result.stderr.trim()}`);
  }
}

const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

/** 레포 최상위 폴더. 레포가 아니면 null. */
export function repoTop(cwd) {
  const r = git(['rev-parse', '--show-toplevel'], { cwd, allowFail: true });
  return r.ok ? path.resolve(r.stdout.trim()) : null;
}

/** 현재 브랜치 이름. HEAD가 브랜치가 아니면(detached) null. */
export function currentBranch(cwd) {
  const r = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, allowFail: true });
  return r.ok ? r.stdout.trim() : null;
}

/** 리비전을 커밋 SHA로 바꾼다. 커밋이 아니거나 없으면 null. */
export function resolveCommit(cwd, rev) {
  if (rev.startsWith('-')) return null; // 옵션으로 해석되는 것을 막는다
  const r = git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], { cwd, allowFail: true });
  return r.ok ? r.stdout.trim() : null;
}

export function listRemotes(cwd) {
  return lines(git(['remote'], { cwd }).stdout);
}

export function remoteUrl(cwd, name) {
  const r = git(['remote', 'get-url', name], { cwd, allowFail: true });
  return r.ok ? r.stdout.trim() : null;
}

/**
 * 커밋이 이미 푸시됐는지 확인한다 (커밋을 수정하기 전 안전장치).
 * 원격 추적 브랜치(refs/remotes/...) 중 하나라도 이 커밋을 포함하면 푸시된 것으로 본다.
 * 네트워크에 묻지 않으므로 마지막 fetch 이후의 정보 기준이다.
 * pushed가 null이면 확인에 실패한 것이고, 호출하는 쪽은 "수정하면 안 됨"으로 다뤄야 한다.
 */
export function pushStatus(cwd, rev = 'HEAD') {
  const sha = resolveCommit(cwd, rev);
  if (!sha) throw new WcError('NO_SUCH_COMMIT', `Not a commit: ${rev}`);
  if (listRemotes(cwd).length === 0) {
    return { sha, pushed: false, reason: 'no_remote', remoteRefs: [] };
  }
  const r = git(['for-each-ref', '--contains', sha, '--format=%(refname)', 'refs/remotes/'], {
    cwd,
    allowFail: true,
  });
  if (!r.ok) return { sha, pushed: null, reason: 'check_failed', remoteRefs: [] };
  const refs = lines(r.stdout).filter((ref) => !ref.endsWith('/HEAD'));
  if (refs.length > 0) return { sha, pushed: true, reason: 'on_remote_tracking_ref', remoteRefs: refs };
  return { sha, pushed: false, reason: 'not_on_any_remote_tracking_ref', remoteRefs: [] };
}

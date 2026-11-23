// git 실행.
// 셸을 거치지 않고 인자 배열로 실행한다 (기획 9.1.7). 셸마다 따옴표 규칙이 달라서다.
//
// Runs git.
// It runs with an argument array, not through a shell (spec 9.1.7), because each shell has its own quoting rules.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { WcError } from './cli.mjs';
import { canonicalPath } from './io.mjs';

/**
 * @param {string[]} args git 인자 / git arguments
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

/** 레포 최상위 폴더 (진짜 경로). 레포가 아니면 null. / The repo's top-level folder (real path). null if not in a repo. */
export function repoTop(cwd) {
  const r = git(['rev-parse', '--show-toplevel'], { cwd, allowFail: true });
  return r.ok ? canonicalPath(r.stdout.trim()) : null;
}

/** 현재 브랜치 이름. HEAD가 브랜치가 아니면(detached) null. / The current branch name. null if HEAD is not on a branch (detached). */
export function currentBranch(cwd) {
  const r = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, allowFail: true });
  return r.ok ? r.stdout.trim() : null;
}

/** 리비전을 커밋 SHA로 바꾼다. 커밋이 아니거나 없으면 null. / Resolves a revision to a commit SHA. null if it is not a commit or does not exist. */
export function resolveCommit(cwd, rev) {
  if (rev.startsWith('-')) return null; // 옵션으로 해석되는 것을 막는다 / Keeps it from being read as an option
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

const tail = (text, n = 4000) => (text.length > n ? `...${text.slice(-n)}` : text).trim();

/**
 * 브랜치를 푸시한다 (원칙 4: 강제 푸시는 절대 하지 않는다).
 * --force, --force-with-lease, "+" refspec을 쓰지 않는다. 원격이 앞서 있으면 거절된 그대로 알린다.
 *
 * Pushes the branch (principle 4: never force push).
 * It never uses --force, --force-with-lease or a "+" refspec. If the remote is ahead, the rejection is reported as is.
 */
export function pushBranch(top, remote, branch) {
  const r = git(['push', '-u', remote, `refs/heads/${branch}:refs/heads/${branch}`], { cwd: top, allowFail: true });
  if (r.ok) return { remote, branch };
  const output = `${r.stderr}\n${r.stdout}`;
  if (/\[rejected\]|non-fast-forward|fetch first|\[remote rejected\]/i.test(output)) {
    throw new WcError(
      'PUSH_REJECTED',
      'The remote rejected the push (it has commits this branch does not have). Never force push. Ask the user to pull or rebase first.',
      { output: tail(output) },
    );
  }
  throw new WcError('PUSH_FAILED', 'git push failed.', { output: tail(output) });
}

/**
 * 커밋이 이미 푸시됐는지 확인한다 (커밋을 수정하기 전 안전장치).
 * 원격 추적 브랜치(refs/remotes/...) 중 하나라도 이 커밋을 포함하면 푸시된 것으로 본다.
 * 네트워크에 묻지 않으므로 마지막 fetch 이후의 정보 기준이다.
 * pushed가 null이면 확인에 실패한 것이고, 호출하는 쪽은 "수정하면 안 됨"으로 다뤄야 한다.
 *
 * Checks whether a commit is already pushed (a safety check before changing a commit).
 * It counts as pushed if any remote-tracking branch (refs/remotes/...) contains the commit.
 * It does not ask the network, so the answer reflects the state as of the last fetch.
 * pushed === null means the check failed, and the caller must treat it as "must not be changed".
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

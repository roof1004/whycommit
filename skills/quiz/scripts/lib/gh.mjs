// GitHub CLI(gh) 실행.
// git과 마찬가지로 셸을 거치지 않고 인자 배열로 실행한다.
// 한글이 들어가는 제목과 본문은 인자로 넘기지 않고 gh api --input <JSON 파일>로 넘긴다.
//
// 테스트용: WHYCOMMIT_GH에 JS 파일 경로를 주면 진짜 gh 대신 "node <그 파일>"을 실행한다.
// 그 경로에 파일이 없으면 gh가 설치되지 않은 것으로 본다.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WcError } from './cli.mjs';
import { writeJsonAtomic } from './io.mjs';
import { tmpRoot } from './paths.mjs';

function command() {
  const fake = process.env.WHYCOMMIT_GH;
  if (fake) return fs.existsSync(fake) ? { file: process.execPath, prefix: [fake] } : null;
  return { file: 'gh', prefix: [] };
}

/** gh를 실행한다. 설치돼 있지 않으면 GH_NOT_INSTALLED. */
export function gh(args, { cwd, allowFail = false } = {}) {
  const cmd = command();
  if (!cmd) throw new WcError('GH_NOT_INSTALLED', 'GitHub CLI (gh) is not installed.');
  try {
    const stdout = execFileSync(cmd.file, [...cmd.prefix, ...args], {
      cwd,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout.toString('utf8'), stderr: '' };
  } catch (error) {
    if (error.code === 'ENOENT') throw new WcError('GH_NOT_INSTALLED', 'GitHub CLI (gh) is not installed.');
    const result = {
      ok: false,
      stdout: error.stdout ? error.stdout.toString('utf8') : '',
      stderr: error.stderr ? error.stderr.toString('utf8') : String(error.message),
    };
    if (allowFail) return result;
    throw new WcError('GH_FAILED', `gh ${args[0]} failed: ${result.stderr.trim().slice(-2000)}`);
  }
}

function ghJson(args, opts) {
  const r = gh(args, opts);
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new WcError('GH_FAILED', `gh ${args[0]} returned something that is not JSON.`);
  }
}

/** 설치 여부, 로그인 여부, (가능하면) 기본 브랜치 */
export function ghStatus(top, { isGitHub, withDefaultBranch = true }) {
  let installed = true;
  try {
    gh(['--version'], { cwd: top, allowFail: true });
  } catch (error) {
    if (error.code !== 'GH_NOT_INSTALLED') throw error;
    installed = false;
  }
  if (!installed) return { installed: false, authenticated: false, applicable: isGitHub, ready: false, defaultBranch: null };
  const authenticated = gh(['auth', 'status', '--hostname', 'github.com'], { cwd: top, allowFail: true }).ok;
  let defaultBranch = null;
  if (authenticated && isGitHub && withDefaultBranch) {
    const r = gh(['repo', 'view', '--json', 'defaultBranchRef'], { cwd: top, allowFail: true });
    if (r.ok) {
      try {
        defaultBranch = JSON.parse(r.stdout).defaultBranchRef?.name ?? null;
      } catch {
        defaultBranch = null;
      }
    }
  }
  return { installed, authenticated, applicable: isGitHub, ready: authenticated && isGitHub, defaultBranch };
}

/** 이 브랜치의 PR들 (열림/닫힘/머지 모두) */
export function listPrsForBranch(top, branch) {
  return ghJson(['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state,url,headRefName', '--limit', '20'], {
    cwd: top,
  });
}

export function getPr(top, number) {
  return ghJson(['api', `repos/{owner}/{repo}/pulls/${number}`], { cwd: top });
}

/** 한글 제목·본문은 JSON 파일로 넘긴다. */
function apiWithInput(top, method, endpoint, payload) {
  const file = path.join(tmpRoot(), `gh-input-${process.pid}-${Date.now()}.json`);
  writeJsonAtomic(file, payload);
  try {
    return ghJson(['api', endpoint, '--method', method, '--input', file], { cwd: top });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

export function createPr(top, { title, body, head, base }) {
  return apiWithInput(top, 'POST', 'repos/{owner}/{repo}/pulls', { title, body, head, base });
}

export function updatePrBody(top, number, body) {
  return apiWithInput(top, 'PATCH', `repos/{owner}/{repo}/pulls/${number}`, { body });
}

export function listOpenIssues(top, limit = 50) {
  return ghJson(['issue', 'list', '--state', 'open', '--json', 'number,title,url,labels', '--limit', String(limit)], { cwd: top });
}

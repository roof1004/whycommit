// 데이터 폴더 경로와 "레포 안에 쓰지 않는다" 안전장치.
//
// 기본 위치는 홈 폴더의 whycommit 폴더다.
//   macOS/Linux: ~/whycommit   Windows: C:\Users\<이름>\whycommit
// WHYCOMMIT_HOME 환경변수로 바꿀 수 있다 (테스트용, 또는 홈이 git 레포인 사람용).
// 경로는 항상 path.join으로 만든다. 공백과 한글이 들어간 홈 폴더에서도 그대로 동작한다.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WcError } from './cli.mjs';
import { git } from './git.mjs';
import { canonicalPath } from './io.mjs';

export function dataHome() {
  const override = process.env.WHYCOMMIT_HOME;
  if (override && override.trim() !== '') return path.resolve(override.trim());
  return path.join(os.homedir(), 'whycommit');
}

/** 임시 파일의 최상위 폴더. 실제 교환 파일은 실행마다 이 안에 만든 run-* 폴더에 둔다. */
export const tmpRoot = () => path.join(dataHome(), 'tmp');
export const configPath = () => path.join(dataHome(), 'config.json');
export const projectsRoot = () => path.join(dataHome(), 'projects');

/** 프로젝트 ID("owner/repo" 또는 "_local/폴더")를 폴더 경로로 바꾼다. */
export function projectDir(projectId) {
  return path.join(projectsRoot(), ...projectId.split('/'));
}

// 이 값들이 설정돼 있으면 git이 cwd 대신 엉뚱한 레포를 볼 수 있어서 검사할 때는 뺀다.
const GIT_LOCATION_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];

function nearestExistingDir(p) {
  let dir = path.resolve(p);
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return dir;
    dir = parent;
  }
  return fs.statSync(dir).isDirectory() ? dir : path.dirname(dir);
}

/** 경로가 git 작업 트리 안에 있으면 그 레포의 최상위 폴더를, 아니면 null을 돌려준다. */
export function findEnclosingWorkTree(p) {
  const dir = nearestExistingDir(p);
  const opts = { cwd: dir, allowFail: true, unsetEnv: GIT_LOCATION_VARS };
  const inside = git(['rev-parse', '--is-inside-work-tree'], opts);
  if (!inside.ok || inside.stdout.trim() !== 'true') return null;
  const top = git(['rev-parse', '--show-toplevel'], opts);
  return top.ok ? canonicalPath(top.stdout.trim()) : dir;
}

let dataHomeVerified = false;

/**
 * 원칙 5: 학습 노트는 어떤 경우에도 레포 안에 만들지 않는다.
 * 홈 폴더 자체를 git으로 관리하는 사람(dotfiles)도 있어서, 쓰기 전에 매번 확인한다.
 */
export function assertDataHomeSafe() {
  if (dataHomeVerified) return;
  const repo = findEnclosingWorkTree(dataHome());
  if (repo) {
    throw new WcError(
      'DATA_DIR_IN_GIT_REPO',
      `The whycommit data folder (${dataHome()}) is inside a git work tree (${repo}). ` +
        'Notes must never live in a repository. Set WHYCOMMIT_HOME to a folder outside any repository.',
      { dataHome: dataHome(), repository: repo },
    );
  }
  dataHomeVerified = true;
}

/** --out 경로를 확인한다. 노트 내용이 레포 안 파일로 새어 나가지 않게 한다. */
export function resolveOutPath(p) {
  const abs = path.resolve(p);
  const repo = findEnclosingWorkTree(path.dirname(abs));
  if (repo) {
    throw new WcError(
      'OUT_PATH_IN_GIT_REPO',
      `Refusing to write ${abs} because it is inside a git work tree (${repo}). Write it to the tmpDir from "env" instead.`,
      { path: abs, repository: repo },
    );
  }
  return abs;
}

// ---- 실행별 임시 폴더 ----
// 에이전트와 스크립트가 주고받는 파일(diff, 제목, 퀴즈 결과 등)은 실행마다 새 폴더에 두고,
// 스킬이 끝나면 폴더째 지운다. 이전 실행의 파일을 잘못 읽는 일을 막고, 내용이 노트 밖에 남지 않게 한다.

const RUN_PREFIX = 'run-';
const STALE_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

/** 하루가 지난 run-* 폴더와 남은 파일을 지운다 (세션이 끊겨 정리하지 못한 것). */
export function pruneStaleTmp(now = Date.now()) {
  const root = tmpRoot();
  let removed = 0;
  let items;
  try {
    items = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return removed;
  }
  for (const item of items) {
    const p = path.join(root, item.name);
    try {
      if (now - fs.statSync(p).mtimeMs < STALE_MS) continue;
      fs.rmSync(p, { recursive: true, force: true });
      removed += 1;
    } catch {
      // 다른 프로그램이 잡고 있으면 다음에 지운다
    }
  }
  return removed;
}

/** 이번 실행에 쓸 임시 폴더를 만든다. 이름은 ASCII만 쓴다. */
export function createRunDir() {
  assertDataHomeSafe();
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  for (;;) {
    const dir = path.join(tmpRoot(), `${RUN_PREFIX}${stamp}-${Math.random().toString(16).slice(2, 8)}`);
    if (fs.existsSync(dir)) continue;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

/** tmp/run-* 폴더 하나를 지운다. 그 밖의 경로는 절대 지우지 않는다. */
export function removeRunDir(dir) {
  const abs = canonicalPath(dir);
  const rel = path.relative(canonicalPath(tmpRoot()), abs);
  const isRunDir = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep) && rel.startsWith(RUN_PREFIX);
  if (!isRunDir) {
    throw new WcError('INVALID_INPUT', `Only run folders inside ${tmpRoot()} can be removed: ${abs}`);
  }
  if (!fs.existsSync(abs)) return false;
  fs.rmSync(abs, { recursive: true, force: true });
  return true;
}

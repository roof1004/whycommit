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

export function dataHome() {
  const override = process.env.WHYCOMMIT_HOME;
  if (override && override.trim() !== '') return path.resolve(override.trim());
  return path.join(os.homedir(), 'whycommit');
}

export const tmpDir = () => path.join(dataHome(), 'tmp');
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
  return top.ok ? path.resolve(top.stdout.trim()) : dir;
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
      `Refusing to write ${abs} because it is inside a git work tree (${repo}). Write it to the whycommit tmp folder instead.`,
      { path: abs, repository: repo, tmpDir: tmpDir() },
    );
  }
  return abs;
}

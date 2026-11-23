// 프로젝트 식별 (기획 8장).
// 원격 저장소가 있으면 그 경로(owner/repo)로, 없으면 "_local/<폴더 이름>"으로 구분한다.
// 원격 URL에는 토큰이 들어 있을 수 있어서 출력하지 않는다.
//
// Project identification (spec section 8).
// A project is identified by its remote path (owner/repo) if it has a remote, otherwise by "_local/<folder name>".
// Remote URLs can contain tokens, so they are never printed.

import fs from 'node:fs';
import path from 'node:path';
import { WcError } from './cli.mjs';
import { currentBranch, listRemotes, remoteUrl } from './git.mjs';
import { hasNotes, loadNotes, notesFiles, saveNotes } from './notes.mjs';
import { assertDataHomeSafe, projectDir, projectsRoot } from './paths.mjs';
import { loadState, saveState, stateFile } from './state.mjs';

/**
 * 원격 URL에서 호스트와 경로를 뽑는다. 로컬 경로면 null.
 * 지원 형식: https://host/owner/repo(.git), ssh://git@host[:port]/owner/repo.git,
 *            git@host:owner/repo.git, git://host/owner/repo
 *
 * Extracts the host and path from a remote URL. null for a local path.
 * Supported forms: the ones listed above.
 */
export function parseRemoteUrl(raw) {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  let host;
  let pathname;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol === 'file:' || !parsed.hostname) return null;
    host = parsed.hostname;
    pathname = parsed.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // 잘못된 % 인코딩은 그대로 둔다
      // Invalid % encoding is left as is
    }
  } else {
    // scp 형식: [user@]host:path. "C:\..." 같은 Windows 드라이브 문자는 로컬 경로로 본다.
    // scp form: [user@]host:path. A Windows drive letter, as in "C:\...", is treated as a local path.
    const m = /^(?:[^@/\\\s]+@)?([^:/\\\s]+):(.+)$/.exec(url);
    if (!m || m[1].length === 1) return null;
    host = m[1];
    pathname = m[2];
  }
  const segments = pathname.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.length === 0) return null;
  segments[segments.length - 1] = segments[segments.length - 1].replace(/\.git$/i, '');
  // GitHub 이름은 대소문자를 구분하지 않으므로 소문자로 통일한다. 폴더 이름으로 쓸 수 없는 문자는 바꾼다.
  // GitHub names are case-insensitive, so they are lowercased. Characters not allowed in folder names are replaced.
  const clean = segments
    .map((s) => s.toLowerCase().replace(/[^a-z0-9._-]/g, '-'))
    .filter((s) => s !== '' && s !== '.' && s !== '..');
  if (clean.length === 0) return null;
  host = host.toLowerCase();
  const isGitHub = ['github.com', 'www.github.com', 'ssh.github.com'].includes(host);
  return { host, id: clean.join('/'), isGitHub };
}

/** 원격이 없을 때 쓰는 폴더 이름. 대소문자와 한글은 그대로 두고, 폴더 이름으로 쓸 수 없는 문자만 바꾼다. / The folder name used when there is no remote. Case and Korean characters are kept; only characters not allowed in folder names are replaced. */
export function localProjectName(top) {
  const name = path
    .basename(top)
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '-')
    .replace(/[. ]+$/, '');
  return name || 'repo';
}

export function chooseRemote(remotes) {
  if (remotes.includes('origin')) return 'origin';
  return [...remotes].sort()[0] ?? null;
}

function hasProjectData(projectId) {
  return hasNotes(projectId) || fs.existsSync(stateFile(projectId));
}

/** 레포 최상위 폴더에서 프로젝트 정보를 만든다. / Builds the project info from the repo's top-level folder. */
export function projectInfo(top) {
  const remoteName = chooseRemote(listRemotes(top));
  let remote = null;
  let parsed = null;
  if (remoteName) {
    const url = remoteUrl(top, remoteName);
    parsed = url ? parseRemoteUrl(url) : null;
    remote = { name: remoteName, host: parsed?.host ?? null, isGitHub: parsed?.isGitHub ?? false };
  }
  const localId = `_local/${localProjectName(top)}`;
  const id = parsed ? parsed.id : localId;
  // 원격 없이 쓰다가 나중에 원격이 생긴 경우: 예전 노트가 _local 아래에 남아 있다.
  // When a remote was added after using the repo without one, the old notes are still under _local.
  const legacyLocal = parsed && hasProjectData(localId) ? { id: localId, dir: projectDir(localId) } : null;
  return { top, id, dir: projectDir(id), remote, legacyLocal, branch: currentBranch(top) };
}

/** 입력 파일에 적힌 프로젝트 ID를 확인한다 (레포 밖에서 복습할 때 쓴다). / Validates the project ID given in an input file (used when reviewing outside a repo). */
export function validateProjectId(id) {
  if (typeof id !== 'string' || id.trim() === '') throw new WcError('INVALID_INPUT', 'project must be a non-empty string.');
  const segments = id.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..' || /[\\:*?"<>|\x00-\x1f]/.test(s))) {
    throw new WcError('INVALID_INPUT', `Invalid project id: ${id}`);
  }
  if (!hasNotes(id)) throw new WcError('UNKNOWN_PROJECT', `No notes found for project ${id} under ${projectsRoot()}.`);
  return id;
}

/**
 * _local/<폴더>의 노트와 상태를 원격 기준 프로젝트로 옮긴다.
 * 사용자에게 한 번 물어본 뒤에만 부른다 (다른 레포가 같은 폴더 이름을 썼을 수도 있어서).
 * 대상에 이미 노트가 있으면 합치고, 같은 id는 대상 쪽을 남긴다.
 *
 * Moves the notes and state of _local/<folder> to the remote-based project.
 * Call it only after asking the user once (another repo may have used the same folder name).
 * If the target already has notes, they are merged; for the same id, the target's entry is kept.
 */
export function migrateLocal(info) {
  if (!info.legacyLocal) {
    throw new WcError('NOTHING_TO_MIGRATE', 'There are no local-only notes to move for this repository.');
  }
  assertDataHomeSafe();
  const from = info.legacyLocal.id;
  const to = info.id;

  const source = loadNotes(from);
  const target = loadNotes(to);
  const known = new Set(target.entries.map((e) => e.id));
  const moved = source.entries.filter((e) => !known.has(e.id));
  target.entries.push(...moved);
  saveNotes(to, target);

  const sourceState = loadState(from);
  const targetState = loadState(to);
  saveState(to, {
    ...targetState,
    branches: { ...sourceState.branches, ...targetState.branches },
    prs: { ...sourceState.prs, ...targetState.prs },
    planDoc: targetState.planDoc ?? sourceState.planDoc,
  });

  // 우리가 만든 파일만 지우고, 폴더가 비었을 때만 폴더를 지운다.
  // Remove only the files we created, and remove the folder only if it is empty.
  const sourceFiles = notesFiles(from);
  for (const f of [sourceFiles.json, sourceFiles.md, stateFile(from)]) fs.rmSync(f, { force: true });
  try {
    fs.rmdirSync(projectDir(from));
  } catch {
    // 다른 파일이 있으면 남겨 둔다
    // Leave it if it holds other files
  }
  return { from, to, movedEntries: moved.length, dir: projectDir(to) };
}

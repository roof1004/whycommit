// 퀴즈 범위: "마지막으로 퀴즈를 본 커밋" 이후의 커밋들 (기획 6.1.3).
//
// 1. 이 브랜치에 기록이 있고, 그 커밋이 아직 HEAD의 조상이면 → 기록 이후
// 2. 기록이 없거나 쓸 수 없으면 모드별 기본 범위
//    - PR 모드: 기본 브랜치에서 갈라진 지점(merge-base) 이후
//    - 마무리 모드: 아직 푸시하지 않은 커밋
// 기록된 커밋이 rebase나 amend로 사라졌으면 stale로 알려 주고, 2의 범위를 대신 계산해 둔다.
// 어떻게 할지는 사용자가 고른다 (계획에서 정한 방식).
//
// Quiz range: the commits after the "last quizzed commit" (spec 6.1.3).
//
// 1. If this branch has a record and that commit is still an ancestor of HEAD → the commits after the record
// 2. If there is no record, or it cannot be used, the default range for the mode
//    - PR mode: after the point where the branch split off the default branch (merge-base)
//    - Finish mode: the commits not pushed yet
// If the recorded commit disappeared through a rebase or amend, it is reported as stale, and the range from 2
// is computed as well.
// The user chooses what to do (the approach decided in the plan).

import { WcError } from './cli.mjs';
import { git, listRemotes, resolveCommit } from './git.mjs';
import { chooseRemote } from './project.mjs';
import { getLastQuizzed, loadState } from './state.mjs';

const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const MAX_LISTED_COMMITS = 200;

function refExists(top, ref) {
  return git(['show-ref', '--verify', '--quiet', ref], { cwd: top, allowFail: true }).ok;
}

export function isValidBranchName(top, name) {
  return git(['check-ref-format', '--branch', name], { cwd: top, allowFail: true }).ok;
}

/**
 * 기본 브랜치를 추측한다. 모르면 null (그때는 에이전트가 사용자에게 묻는다).
 * 순서: 원격의 HEAD → 흔한 이름(main, master) → init.defaultBranch 설정
 * (GitHub CLI로 묻는 방법은 4단계에서 더한다.)
 *
 * Guesses the default branch. null if unknown (the agent then asks the user).
 * Order: the remote's HEAD → common names (main, master) → the init.defaultBranch setting
 * (Asking the GitHub CLI is added in stage 4.)
 */
export function detectDefaultBranch(top) {
  const remote = chooseRemote(listRemotes(top));
  if (remote) {
    const r = git(['symbolic-ref', '--quiet', `refs/remotes/${remote}/HEAD`], { cwd: top, allowFail: true });
    const prefix = `refs/remotes/${remote}/`;
    if (r.ok && r.stdout.trim().startsWith(prefix)) {
      return { name: r.stdout.trim().slice(prefix.length), source: 'remote_head', remote };
    }
  }
  for (const name of ['main', 'master']) {
    if (refExists(top, `refs/heads/${name}`) || (remote && refExists(top, `refs/remotes/${remote}/${name}`))) {
      return { name, source: 'common_name', remote };
    }
  }
  const init = git(['config', '--get', 'init.defaultBranch'], { cwd: top, allowFail: true });
  const initName = init.ok ? init.stdout.trim() : '';
  if (initName && refExists(top, `refs/heads/${initName}`)) {
    return { name: initName, source: 'init_default_branch', remote };
  }
  return null;
}

/** PR이 비교할 기준. 원격 추적 브랜치가 있으면 그것을 쓴다 (GitHub의 PR도 원격 기준이라서). / The base a PR is compared against. Uses the remote-tracking branch if it exists (a GitHub PR is based on the remote too). */
function baseRefFor(top, def) {
  if (def.remote && refExists(top, `refs/remotes/${def.remote}/${def.name}`)) return `refs/remotes/${def.remote}/${def.name}`;
  if (refExists(top, `refs/heads/${def.name}`)) return `refs/heads/${def.name}`;
  return null;
}

function isAncestor(top, ancestor, descendant) {
  return git(['merge-base', '--is-ancestor', ancestor, descendant], { cwd: top, allowFail: true }).ok;
}

function withCommits(info, top, base, reason) {
  const spec = base ? [`${base}..${info.head}`] : [info.head];
  const commits = lines(git(['rev-list', '--reverse', ...spec], { cwd: top }).stdout);
  return {
    ...info,
    base,
    fromRoot: base === null,
    reason,
    count: commits.length,
    commits: commits.slice(-MAX_LISTED_COMMITS),
    commitsTruncated: commits.length > MAX_LISTED_COMMITS,
    empty: commits.length === 0,
  };
}

/**
 * @param {string} top 레포 최상위 폴더 / the repo's top-level folder
 * @param {string} projectId
 * @param {{mode?: 'auto'|'pr'|'finish', ignoreRecorded?: boolean, defaultBranch?: string, branch: string}} opts
 */
export function computeRange(top, projectId, { mode = 'auto', ignoreRecorded = false, defaultBranch, branch }) {
  if (!branch) throw new WcError('DETACHED_HEAD', 'HEAD is not on a branch. Check out a branch first.');
  const head = resolveCommit(top, 'HEAD');
  let def = null;
  if (defaultBranch) {
    if (!isValidBranchName(top, defaultBranch)) throw new WcError('INVALID_INPUT', `Not a valid branch name: ${defaultBranch}`);
    def = { name: defaultBranch, source: 'option', remote: chooseRemote(listRemotes(top)) };
  } else {
    def = detectDefaultBranch(top);
  }
  let resolvedMode = mode;
  if (mode === 'auto') resolvedMode = def ? (branch === def.name ? 'finish' : 'pr') : null;

  const info = {
    branch,
    head,
    mode: resolvedMode,
    defaultBranch: def?.name ?? null,
    defaultBranchSource: def?.source ?? null,
    stale: null,
  };
  if (!head) {
    return { ...info, base: null, fromRoot: false, reason: 'no_commits', count: 0, commits: [], commitsTruncated: false, empty: true };
  }

  if (!ignoreRecorded) {
    const recorded = getLastQuizzed(loadState(projectId), branch);
    if (recorded) {
      if (!resolveCommit(top, recorded)) info.stale = { recorded, reason: 'last_quizzed_missing' };
      else if (!isAncestor(top, recorded, head)) info.stale = { recorded, reason: 'last_quizzed_not_ancestor' };
      else return withCommits(info, top, recorded, 'last_quizzed');
    }
  }

  if (resolvedMode === 'pr') {
    if (!def) {
      throw new WcError('NEED_DEFAULT_BRANCH', 'The default branch is unknown. Ask the user and pass --default-branch.');
    }
    const ref = baseRefFor(top, def);
    if (!ref) throw new WcError('NO_SUCH_BRANCH', `The default branch "${def.name}" does not exist here.`);
    const mb = git(['merge-base', head, ref], { cwd: top, allowFail: true });
    if (!mb.ok) throw new WcError('NO_MERGE_BASE', `This branch shares no history with ${def.name}.`);
    return withCommits(info, top, mb.stdout.trim(), 'merge_base');
  }

  if (resolvedMode === 'finish') {
    // 첫 번째 부모만 따라가며 아직 어떤 원격 추적 브랜치에도 없는 커밋을 찾는다.
    // Follows first parents only, looking for commits that are not on any remote-tracking branch yet.
    const unpushed = lines(git(['rev-list', '--first-parent', head, '--not', '--remotes'], { cwd: top }).stdout);
    if (unpushed.length === 0) return withCommits(info, top, head, 'all_pushed');
    const oldest = unpushed[unpushed.length - 1];
    const parent = resolveCommit(top, `${oldest}^`);
    return withCommits(info, top, parent, 'unpushed');
  }

  // 기본 브랜치를 몰라서 모드를 정할 수 없다. 에이전트가 사용자에게 묻고 --default-branch로 다시 부른다.
  // The default branch is unknown, so the mode cannot be decided. The agent asks the user and calls again
  // with --default-branch.
  return { ...info, base: null, fromRoot: false, reason: 'unknown_default_branch', count: null, commits: null, commitsTruncated: false, empty: null };
}

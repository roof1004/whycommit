// whycommit 스크립트 진입점.
//   node <이 파일의 경로> <명령> [옵션]      명령 목록: node wc.mjs help
//
// 원본은 레포의 src/ 폴더입니다. skills/*/scripts/ 는 tools/sync-scripts.mjs가 만든
// 사본이니 직접 고치지 마세요.

import fs from 'node:fs';
import path from 'node:path';
import {
  UsageError,
  WcError,
  getChoice,
  getFlag,
  getInt,
  getPathOption,
  getString,
  parseArgs,
  printError,
  printOk,
} from './lib/cli.mjs';
import { commitContext, createCommit } from './lib/commit.mjs';
import { loadConfig, publicConfig, setConfigValue, setWritingStyle, SETTABLE_KEYS } from './lib/config.mjs';
import { currentBranch, git, pushStatus, repoTop, resolveCommit } from './lib/git.mjs';
import { readJson, readText, writeJsonAtomic } from './lib/io.mjs';
import {
  addEntries,
  countStatuses,
  listProjects,
  loadNotes,
  notesFiles,
  pickForReview,
  recordReview,
} from './lib/notes.mjs';
import {
  configPath,
  createRunDir,
  dataHome,
  findEnclosingWorkTree,
  pruneStaleTmp,
  removeRunDir,
  resolveOutPath,
  tmpRoot,
} from './lib/paths.mjs';
import { migrateLocal, projectInfo, validateProjectId } from './lib/project.mjs';
import { computeRange } from './lib/range.mjs';
import { getLastQuizzed, loadState, saveState, setLastQuizzed } from './lib/state.mjs';
import { workingTreeStatus } from './lib/worktree.mjs';

const MIN_NODE_MAJOR = 18;

const HELP = `whycommit helper script

Usage: node wc.mjs <command> [options]

Options take plain ASCII values or file paths. Put any other text (questions,
answers, explanations, drafts) in a UTF-8 file and pass the file's path.
Every command prints one JSON object. Exit code 0 means success; 1 means the
command failed (see error.code); 2 means the command was used incorrectly.

Setup
  env                                    Paths, repository, project and settings.
                                         Creates the data folder and default config on first run.
                                         Also creates a fresh tmpDir for this run.
  tmp clean --dir TMPDIR                 Delete this run's tmpDir. Call it when the skill ends.
  project info                           Which project the current repository maps to.
  project migrate-local                  Move notes saved under _local/<folder> to the
                                         remote-based project (ask the user first).

Settings
  config get [--out FILE]                Show settings. FILE receives the full config,
                                         including the writing style text.
  config set --key KEY --value VALUE     KEY: ${SETTABLE_KEYS.join(', ')}
  config set-style --file FILE           Save the writing style (an empty file clears it).

Repository and commits
  repo status                            Staged, unstaged, untracked and conflicted files.
  repo stage-all                         Stage everything (git add -A). Ask the user first.
  commit context --out FILE              Staged diff, recent commit subjects and format hints.
  commit create --file FILE              Commit with the one-line title in FILE (empty body).
                                         Also reports how many commits have not been quizzed.
  range [--mode auto|pr|finish] [--ignore-recorded] [--default-branch NAME]
                                         Commits since the last quiz on this branch.

State (per branch)
  state get
  state set-last-quizzed [--sha SHA]     Default: HEAD of the current branch.
  state set-plan-doc --path FILE | --none

Notes
  notes add --file FILE                  Record quiz results. FILE: {"entries": [...]}
  notes review-result --file FILE        Record one review answer. FILE: {"id": ..., "attempt": {...}}
  notes list --out FILE [--status understood|not_understood|all]
  notes stats [--scope project|all]
  review pick --out FILE [--scope project|all] [--limit N]

Git
  git pushed [--rev REV]                 Is the commit on a remote-tracking branch?
                                         (safety check before rewriting a commit)
`;

// ---- 공통 ----

function requireRepoTop() {
  const top = repoTop(process.cwd());
  if (!top) throw new WcError('NOT_A_GIT_REPO', 'Run this inside a git repository.');
  return top;
}

function requireProject() {
  return projectInfo(requireRepoTop());
}

function requireBranch(info) {
  if (!info.branch) {
    throw new WcError('DETACHED_HEAD', 'HEAD is not on a branch. Check out a branch first.');
  }
  return info.branch;
}

function describeProject(info) {
  return { id: info.id, dir: info.dir, top: info.top, branch: info.branch, remote: info.remote, legacyLocal: info.legacyLocal };
}

/** 입력 파일에 project가 있으면 그것을, 없으면 지금 레포의 프로젝트를 쓴다. */
function projectFromInput(input) {
  if (input && typeof input === 'object' && input.project !== undefined) {
    return { id: validateProjectId(input.project), branch: null };
  }
  const info = requireProject();
  return { id: info.id, branch: info.branch };
}

// ---- 명령 ----

const commands = {
  env: {
    options: [],
    run() {
      const home = dataHome();
      const enclosingRepo = findEnclosingWorkTree(home);
      let settings = null;
      let runDir = null;
      if (!enclosingRepo) {
        pruneStaleTmp();
        runDir = createRunDir();
        const { config, created, warnings } = loadConfig();
        settings = { ...publicConfig(config), created, warnings };
      }
      const top = repoTop(process.cwd());
      let repo = { inRepo: false };
      let project = null;
      if (top) {
        const head = resolveCommit(top, 'HEAD');
        repo = { inRepo: true, top, branch: currentBranch(top), head, hasCommits: head !== null };
        project = describeProject(projectInfo(top));
      }
      return {
        node: { version: process.versions.node, ok: true },
        dataHome: home,
        dataHomeSafe: !enclosingRepo,
        ...(enclosingRepo ? { dataHomeRepository: enclosingRepo } : {}),
        tmpDir: runDir,
        configPath: configPath(),
        config: settings,
        repo,
        project,
      };
    },
  },

  'project info': {
    options: [],
    run: () => ({ project: describeProject(requireProject()) }),
  },

  'project migrate-local': {
    options: [],
    run: () => migrateLocal(requireProject()),
  },

  'config get': {
    options: ['out'],
    run(o) {
      const outOption = getPathOption(o, 'out');
      const { config, created, warnings } = loadConfig();
      const result = { path: configPath(), created, config: publicConfig(config), warnings };
      if (outOption) {
        result.out = resolveOutPath(outOption);
        writeJsonAtomic(result.out, config);
      }
      return result;
    },
  },

  'config set': {
    options: ['key', 'value'],
    run(o) {
      const key = getString(o, 'key', { required: true });
      const value = getString(o, 'value', { required: true });
      return { path: configPath(), config: publicConfig(setConfigValue(key, value)) };
    },
  },

  'config set-style': {
    options: ['file'],
    run(o) {
      const file = path.resolve(getPathOption(o, 'file', { required: true }));
      const config = setWritingStyle(readText(file, 'style file'));
      return { path: configPath(), hasWritingStyle: config.writingStyle.length > 0, length: config.writingStyle.length };
    },
  },

  'state get': {
    options: [],
    run() {
      const info = requireProject();
      const state = loadState(info.id);
      const branches = Object.fromEntries(Object.entries(state.branches).map(([b, v]) => [b, v.lastQuizzed ?? null]));
      const prs = Object.fromEntries(Object.entries(state.prs).map(([b, v]) => [b, v?.number ?? null]));
      return {
        project: info.id,
        branch: info.branch,
        lastQuizzed: info.branch ? getLastQuizzed(state, info.branch) : null,
        branches,
        planDoc: state.planDoc,
        prs,
      };
    },
  },

  'state set-last-quizzed': {
    options: ['sha'],
    run(o) {
      const info = requireProject();
      const branch = requireBranch(info);
      const rev = getString(o, 'sha') ?? 'HEAD';
      const sha = resolveCommit(info.top, rev);
      if (!sha) throw new WcError('NO_SUCH_COMMIT', `Not a commit: ${rev}`);
      const state = loadState(info.id);
      const previous = getLastQuizzed(state, branch);
      setLastQuizzed(state, branch, sha);
      saveState(info.id, state);
      return { project: info.id, branch, lastQuizzed: sha, previous };
    },
  },

  'state set-plan-doc': {
    options: ['path', 'none'],
    run(o) {
      const info = requireProject();
      const none = getFlag(o, 'none');
      const given = getPathOption(o, 'path');
      if (none === Boolean(given)) throw new UsageError('Give either --path FILE or --none.');
      let planDoc = { path: null };
      if (given) {
        const abs = path.resolve(given);
        const rel = path.relative(info.top, abs);
        if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new WcError('INVALID_INPUT', `The plan document must be inside the repository: ${abs}`);
        }
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          throw new WcError('FILE_NOT_FOUND', `File not found: ${abs}`);
        }
        planDoc = { path: rel.split(path.sep).join('/') };
      }
      const state = loadState(info.id);
      state.planDoc = planDoc;
      saveState(info.id, state);
      return { project: info.id, planDoc };
    },
  },

  'notes add': {
    options: ['file'],
    run(o) {
      const input = readJson(path.resolve(getPathOption(o, 'file', { required: true })), 'input file');
      const project = projectFromInput(input);
      return { project: project.id, ...addEntries(project.id, input, { defaultBranch: project.branch }) };
    },
  },

  'notes review-result': {
    options: ['file'],
    run(o) {
      const input = readJson(path.resolve(getPathOption(o, 'file', { required: true })), 'input file');
      const project = projectFromInput(input);
      return { project: project.id, ...recordReview(project.id, input) };
    },
  },

  'notes list': {
    options: ['out', 'status'],
    run(o) {
      const out = resolveOutPath(getPathOption(o, 'out', { required: true }));
      const status = getChoice(o, 'status', ['understood', 'not_understood', 'all'], { fallback: 'all' });
      const info = requireProject();
      const entries = loadNotes(info.id).entries.filter((e) => status === 'all' || e.status === status);
      writeJsonAtomic(out, { project: info.id, status, entries });
      return { project: info.id, status, count: entries.length, out };
    },
  },

  'notes stats': {
    options: ['scope'],
    run(o) {
      const scope = getChoice(o, 'scope', ['project', 'all'], { fallback: 'project' });
      const ids = scope === 'all' ? listProjects() : [requireProject().id];
      const projects = ids.map((id) => ({ project: id, ...countStatuses(loadNotes(id).entries) }));
      const totals = countStatuses(ids.flatMap((id) => loadNotes(id).entries));
      return { scope, ...totals, projects };
    },
  },

  'review pick': {
    options: ['out', 'scope', 'limit'],
    run(o) {
      const out = resolveOutPath(getPathOption(o, 'out', { required: true }));
      const scope = getChoice(o, 'scope', ['project', 'all'], { fallback: 'project' });
      const limit = getInt(o, 'limit', { min: 1, max: 100 }) ?? loadConfig().config.review.count;
      const top = repoTop(process.cwd());
      const current = top ? projectInfo(top).id : null;
      if (scope === 'project' && !current) {
        throw new WcError('NOT_A_GIT_REPO', 'Run this inside a git repository, or use --scope all.');
      }
      const ids = scope === 'all' ? listProjects() : [current];
      const { total, picked } = pickForReview(ids, limit);
      writeJsonAtomic(out, {
        scope,
        currentProject: current,
        total,
        picked: picked.map(({ project, entry }) => ({ project, notesMd: notesFiles(project).md, entry })),
      });
      return { scope, currentProject: current, picked: picked.length, total, out };
    },
  },

  'repo status': {
    options: [],
    run() {
      const top = requireRepoTop();
      const status = workingTreeStatus(top);
      const clean = Object.values(status).every((list) => list.length === 0);
      return { top, branch: currentBranch(top), ...status, clean };
    },
  },

  'repo stage-all': {
    options: [],
    run() {
      const top = requireRepoTop();
      const before = workingTreeStatus(top);
      if (before.conflicts.length > 0) {
        // git add -A는 충돌을 "해결됨"으로 표시해 버리므로 막는다.
        throw new WcError('MERGE_CONFLICTS', 'Resolve the merge conflicts before staging.', { conflicts: before.conflicts });
      }
      git(['add', '-A'], { cwd: top });
      return { staged: workingTreeStatus(top).staged };
    },
  },

  'commit context': {
    options: ['out', 'max-diff-chars'],
    run(o) {
      const out = resolveOutPath(getPathOption(o, 'out', { required: true }));
      const top = requireRepoTop();
      const maxDiffChars = getInt(o, 'max-diff-chars', { min: 1000, max: 10_000_000 });
      const context = commitContext(top, maxDiffChars ? { maxDiffChars } : {});
      writeJsonAtomic(out, context);
      return {
        out,
        stagedCount: context.staged.length,
        hasHistory: context.hasHistory,
        diffTruncated: context.diffTruncated,
      };
    },
  },

  'commit create': {
    options: ['file'],
    run(o) {
      const file = path.resolve(getPathOption(o, 'file', { required: true }));
      const info = requireProject();
      const result = createCommit(info.top, readText(file, 'title file'));
      const range = computeRange(info.top, info.id, { branch: info.branch });
      return {
        ...result,
        unquizzed: { count: range.count, mode: range.mode, reason: range.reason, stale: range.stale },
      };
    },
  },

  range: {
    options: ['mode', 'ignore-recorded', 'default-branch'],
    run(o) {
      const info = requireProject();
      return {
        project: info.id,
        ...computeRange(info.top, info.id, {
          branch: requireBranch(info),
          mode: getChoice(o, 'mode', ['auto', 'pr', 'finish'], { fallback: 'auto' }),
          ignoreRecorded: getFlag(o, 'ignore-recorded'),
          defaultBranch: getString(o, 'default-branch'),
        }),
      };
    },
  },

  'tmp clean': {
    options: ['dir'],
    run(o) {
      const dir = path.resolve(getPathOption(o, 'dir', { required: true }));
      return { removed: removeRunDir(dir), dir, tmpRoot: tmpRoot() };
    },
  },

  'git pushed': {
    options: ['rev'],
    run(o) {
      const top = requireRepoTop();
      const status = pushStatus(top, getString(o, 'rev') ?? 'HEAD');
      return { ...status, safeToRewrite: status.pushed === false };
    },
  },
};

const BOOLEAN_FLAGS = new Set(['none', 'help', 'ignore-recorded']);

function main(argv) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    return printError(
      new WcError('NODE_TOO_OLD', `Node.js ${MIN_NODE_MAJOR} or newer is required (found ${process.versions.node}).`),
    );
  }
  const { positionals, options } = parseArgs(argv, BOOLEAN_FLAGS);
  if (positionals.length === 0 || positionals[0] === 'help' || options.help === true) {
    process.stdout.write(HELP);
    return 0;
  }
  const twoWords = positionals.slice(0, 2).join(' ');
  const name = commands[twoWords] ? twoWords : positionals[0];
  const command = commands[name];
  const used = name.split(' ').length;
  try {
    if (!command) throw new UsageError(`Unknown command "${positionals.join(' ')}". Run "node wc.mjs help".`);
    if (positionals.length > used) throw new UsageError(`Unexpected argument "${positionals[used]}".`);
    const unknown = Object.keys(options).filter((k) => !command.options.includes(k));
    if (unknown.length > 0) {
      throw new UsageError(`Unknown option(s) for "${name}": ${unknown.map((k) => `--${k}`).join(', ')}.`);
    }
    printOk(command.run(options));
    return 0;
  } catch (error) {
    return printError(error);
  }
}

process.exitCode = main(process.argv.slice(2));

// quiz 스킬용: 퀴즈 범위의 변경을 한 번에 모은다 (기획 6.1.3~6.1.4, 6.3.3).
// 결과에는 커밋 제목과 diff 같은 한글 내용이 들어가므로 --out 파일로만 쓴다.
//
// For the quiz skill: gathers all changes in the quiz range at once (spec 6.1.3-6.1.4, 6.3.3).
// The result contains Korean (non-ASCII) text, such as commit subjects and diffs, so it is written only to an --out file.

import { WcError } from './cli.mjs';
import { git } from './git.mjs';
import { classifyChange, isSkipCandidate } from './classify.mjs';

const MAX_TODOS = 100;
const MAX_WHITESPACE_CHECKS = 200;
const TODO_WORDS = ['TODO', 'FIXME', 'XXX', 'HACK'];

/** 빈 트리의 id. 첫 커밋부터 diff를 볼 때 쓴다 (SHA-1/SHA-256 레포 모두에서 맞는 값을 git에게 받는다). / The empty tree id, used to diff from the first commit (asked from git so it is right in both SHA-1 and SHA-256 repos). */
function emptyTree(top) {
  return git(['hash-object', '-t', 'tree', '--stdin'], { cwd: top, input: '' }).stdout.trim();
}

/** git diff --name-status -z -M 결과를 읽는다. / Parses the output of git diff --name-status -z -M. */
export function parseNameStatusZ(output) {
  const fields = output.split('\0');
  const files = [];
  for (let i = 0; i < fields.length; i += 1) {
    const code = fields[i];
    if (!code) continue;
    const status = code[0];
    const similarity = code.length > 1 ? Number(code.slice(1)) : null;
    if (status === 'R' || status === 'C') {
      files.push({ status, similarity, from: fields[i + 1], path: fields[i + 2] });
      i += 2;
    } else {
      files.push({ status, similarity: null, path: fields[i + 1] });
      i += 1;
    }
  }
  return files;
}

function changedFiles(top, base, head) {
  const out = git(['diff', '--name-status', '-z', '-M', base, head], { cwd: top }).stdout;
  const files = parseNameStatusZ(out);
  let checks = 0;
  return files.map((f) => {
    let whitespaceOnly = false;
    if (f.status === 'M' && checks < MAX_WHITESPACE_CHECKS) {
      checks += 1;
      // 종료 코드 0이면 공백·빈 줄·줄 끝 CR을 무시했을 때 차이가 없다.
      // Exit code 0 means there is no difference once whitespace, blank lines and CR at line ends are ignored.
      whitespaceOnly = git(
        ['diff', '--quiet', '-w', '--ignore-blank-lines', '--ignore-cr-at-eol', base, head, '--', f.path],
        { cwd: top, allowFail: true },
      ).ok;
    }
    return { ...f, class: classifyChange(f, whitespaceOnly) };
  });
}

/** 변경된 파일(현재 커밋 기준)에 있는 TODO 주석. git grep은 파일 이름 뒤에 NUL을 넣도록 -z로 부른다. / TODO comments in the changed files (as of the current commit). git grep is called with -z so it puts a NUL after each file name. */
function todosIn(top, head, paths) {
  const todos = [];
  for (let i = 0; i < paths.length && todos.length < MAX_TODOS; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const args = ['grep', '-z', '-n', '-I', '-w', '-E', TODO_WORDS.join('|'), head, '--', ...chunk];
    const r = git(args, { cwd: top, allowFail: true });
    if (!r.ok) continue; // 1 = 찾지 못함 / 1 = no match
    for (const line of r.stdout.split('\n')) {
      if (!line) continue;
      const [location, lineNo, ...rest] = line.split('\0');
      const file = location.startsWith(`${head}:`) ? location.slice(head.length + 1) : location;
      todos.push({ path: file, line: Number(lineNo), text: rest.join('\0').trim() });
      if (todos.length >= MAX_TODOS) break;
    }
  }
  return todos;
}

/**
 * @param {string} top
 * @param {ReturnType<import('./range.mjs').computeRange>} range
 */
export function collectChanges(top, range, { maxDiffChars = 200000 } = {}) {
  if (range.count === null) {
    throw new WcError('NEED_DEFAULT_BRANCH', 'The default branch is unknown. Ask the user and pass --default-branch.');
  }
  if (range.empty) {
    return { range, commits: [], files: [], skipCandidate: false, diffStat: '', diff: '', diffTruncated: false, todos: [] };
  }
  const head = range.head;
  const base = range.base ?? emptyTree(top);
  const spec = range.base ? [`${range.base}..${head}`] : [head];
  const commits = git(['log', '--reverse', '--format=%H%x1f%s', ...spec], { cwd: top })
    .stdout.split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, subject] = l.split('\x1f');
      return { sha, subject };
    });
  const files = changedFiles(top, base, head);
  const diffArgs = ['diff', '--no-color', '--no-ext-diff', '-M', base, head];
  const diffStat = git([...diffArgs, '--stat=200'], { cwd: top }).stdout;
  let diff = git(diffArgs, { cwd: top }).stdout;
  const diffTruncated = diff.length > maxDiffChars;
  if (diffTruncated) diff = diff.slice(0, maxDiffChars);
  const existing = files.filter((f) => f.status !== 'D').map((f) => f.path);
  return {
    range,
    commits,
    files,
    skipCandidate: isSkipCandidate(files),
    diffStat,
    diff,
    diffTruncated,
    todos: todosIn(top, head, existing),
  };
}

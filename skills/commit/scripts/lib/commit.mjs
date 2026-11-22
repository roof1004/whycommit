// commit 스킬용: 커밋 맥락 읽기와 커밋 만들기 (기획 5장).

import fs from 'node:fs';
import path from 'node:path';
import { WcError } from './cli.mjs';
import { currentBranch, git, resolveCommit } from './git.mjs';
import { normalizeNewlines, writeTextAtomic } from './io.mjs';
import { assertDataHomeSafe, tmpRoot } from './paths.mjs';
import { workingTreeStatus } from './worktree.mjs';

const CONVENTIONAL = /^[a-z]+(\([^)]*\))?!?: \S/;
const HANGUL = /[가-힣]/;
const MAX_TITLE_LENGTH = 200;

function share(items, pattern) {
  if (items.length === 0) return null;
  return Math.round((items.filter((s) => pattern.test(s)).length / items.length) * 100) / 100;
}

/**
 * 제목 후보를 만들 때 필요한 것을 한 번에 모은다. 결과는 --out 파일로만 쓴다 (한글 내용).
 * diff가 너무 길면 자르고 diffTruncated로 알린다.
 */
export function commitContext(top, { maxDiffChars = 120000 } = {}) {
  const status = workingTreeStatus(top);
  const head = resolveCommit(top, 'HEAD');
  const diffArgs = ['diff', '--cached', '--no-color', '--no-ext-diff', '-M'];
  const diffStat = git([...diffArgs, '--stat=200'], { cwd: top }).stdout;
  let diff = git(diffArgs, { cwd: top }).stdout;
  const diffTruncated = diff.length > maxDiffChars;
  if (diffTruncated) diff = diff.slice(0, maxDiffChars);
  const recentSubjects = head
    ? git(['log', '-n', '20', '--no-merges', '--format=%s'], { cwd: top })
        .stdout.split('\n')
        .filter((s) => s.trim() !== '')
    : [];
  return {
    branch: currentBranch(top),
    hasHistory: recentSubjects.length > 0,
    staged: status.staged,
    unstagedCount: status.unstaged.length,
    untrackedCount: status.untracked.length,
    recentSubjects,
    hints: { conventionalShare: share(recentSubjects, CONVENTIONAL), koreanShare: share(recentSubjects, HANGUL) },
    diffStat,
    diff,
    diffTruncated,
  };
}

/**
 * 제목 한 줄로 커밋한다. 본문은 비운다.
 * 한글 제목이 셸 인자로 깨지지 않게, 정리한 제목을 데이터 폴더의 임시 파일에 써서 git commit -F로 넘긴다.
 * --cleanup=whitespace: "#"으로 시작하는 제목이 주석으로 지워지지 않게 한다.
 */
export function createCommit(top, titleText) {
  const title = normalizeNewlines(titleText).trim();
  if (!title) throw new WcError('INVALID_INPUT', 'The title file is empty.');
  if (title.includes('\n')) throw new WcError('INVALID_INPUT', 'The title must be a single line (the commit body stays empty).');
  if (title.length > MAX_TITLE_LENGTH) {
    throw new WcError('INVALID_INPUT', `The title is too long (max ${MAX_TITLE_LENGTH} characters).`);
  }
  const status = workingTreeStatus(top);
  if (status.conflicts.length > 0) {
    throw new WcError('MERGE_CONFLICTS', 'Resolve the merge conflicts before committing.', { conflicts: status.conflicts });
  }
  if (status.staged.length === 0) throw new WcError('NOTHING_STAGED', 'Nothing is staged.');

  assertDataHomeSafe();
  const messageFile = path.join(tmpRoot(), `commit-message-${process.pid}.txt`);
  writeTextAtomic(messageFile, `${title}\n`);
  try {
    const r = git(['commit', '--cleanup=whitespace', '-F', messageFile], { cwd: top, allowFail: true });
    if (!r.ok) {
      const output = `${r.stderr}\n${r.stdout}`.trim();
      throw new WcError('COMMIT_FAILED', 'git commit failed. If a hook rejected the commit, show its output to the user.', {
        output: output.length > 4000 ? `...${output.slice(-4000)}` : output,
      });
    }
  } finally {
    fs.rmSync(messageFile, { force: true });
  }
  const sha = resolveCommit(top, 'HEAD');
  return {
    sha,
    short: sha.slice(0, 7),
    committedFiles: status.staged.length,
    leftUncommitted: status.unstaged.length + status.untracked.length,
  };
}

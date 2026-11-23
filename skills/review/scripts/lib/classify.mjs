// "건너뛰기" 1차 판단 (계획 2.6).
// 스크립트는 파일 종류처럼 기계적으로 정할 수 있는 것만 분류한다.
// 주석만 바뀌었는지, 설정 값만 바뀌었는지는 언어마다 달라서 에이전트가 2차로 판단한다.
//
// 분류
//   docs         문서 (*.md, docs/ 아래, LICENSE 등)
//   asset        이미지 등
//   lockfile     잠금 파일 (package-lock.json 등)
//   rename_only  내용 변화 없이 이름만 바뀜
//   format_only  공백·빈 줄만 바뀜
//   code         그 밖의 모든 것 (설정 파일 포함 → 에이전트가 다시 본다)
//
// First-pass "skip" decision (plan 2.6).
// The script classifies only what can be decided mechanically, such as the file type.
// Whether only comments or only config values changed depends on the language, so the agent decides that in a second pass.
//
// Classes
//   docs         documentation (*.md, files under docs/, LICENSE, etc.)
//   asset        images and similar
//   lockfile     lock files (package-lock.json, etc.)
//   rename_only  renamed with no change in content
//   format_only  only whitespace or blank lines changed
//   code         everything else (config files included, so the agent looks at them again)

import path from 'node:path';

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc', '.org']);
const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.pdf']);
const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'pipfile.lock',
  'uv.lock',
  'gemfile.lock',
  'composer.lock',
  'go.sum',
  'podfile.lock',
  'packages.lock.json',
  'gradle.lockfile',
  'flake.lock',
]);
const DOC_NAMES = /^(license|licence|copying|changelog|changes|history|authors|contributors|contributing|code_of_conduct|security|notice|readme)(\..*)?$/i;
// .txt지만 문서가 아닌 것: 의존성 목록이나 빌드 설정은 설계 결정일 수 있다.
// .txt files that are not docs: dependency lists and build settings can be design decisions.
const TXT_NOT_DOC = /^(requirements.*|constraints.*|cmakelists|robots)\.txt$/i;

/** 경로만 보고 분류한다. / Classifies by the path alone. */
export function classifyPath(filePath) {
  const posix = filePath.replace(/\\/g, '/');
  const base = path.posix.basename(posix).toLowerCase();
  const ext = path.posix.extname(base);
  if (LOCKFILES.has(base)) return 'lockfile';
  if (TXT_NOT_DOC.test(base)) return 'code';
  if (DOC_NAMES.test(base) || DOC_EXTENSIONS.has(ext)) return 'docs';
  if (ASSET_EXTENSIONS.has(ext)) return 'asset';
  if (/^docs?\//i.test(posix)) return 'docs';
  return 'code';
}

/**
 * @param {{path: string, status: string, similarity?: number|null}} file  status는 git의 A/M/D/R/C/T / status is git's A/M/D/R/C/T
 * @param {boolean} whitespaceOnly 공백을 무시하면 차이가 없는지 / whether there is no difference when whitespace is ignored
 */
export function classifyChange(file, whitespaceOnly) {
  if (file.status === 'R' && file.similarity === 100) return 'rename_only';
  const byPath = classifyPath(file.path);
  if (byPath !== 'code') return byPath;
  if (file.status === 'M' && whitespaceOnly) return 'format_only';
  return 'code';
}

/** 모든 파일이 code가 아니면 건너뛰기 후보다. / A skip candidate when none of the files is code. */
export function isSkipCandidate(files) {
  return files.length > 0 && files.every((f) => f.class !== 'code');
}

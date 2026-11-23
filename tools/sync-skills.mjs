// 원본을 각 스킬 폴더로 복사한다.
//
//   node tools/sync-skills.mjs           복사 (사본에만 있는 스크립트 파일은 지운다)
//   node tools/sync-skills.mjs --check   어긋난 곳이 있으면 종료 코드 1 (CI용)
//
// 왜 사본을 두나: Agent Skills 표준에서 스킬은 자기 폴더 밖을 참조하면 안 된다.
// 그래서 스킬마다 필요한 파일을 갖고 있어야 하고, 원본은 한 곳만 고친다.
//
//   src/                            → skills/<SKILL.md가 있는 모든 스킬>/scripts/
//   shared/references/grading.md    → skills/quiz/references/, skills/review/references/
//
// Copies the sources into each skill folder.
//
//   node tools/sync-skills.mjs           copy (script files that exist only in a copy are removed)
//   node tools/sync-skills.mjs --check   exit code 1 if anything is out of sync (for CI)
//
// Why keep copies: in the Agent Skills standard, a skill must not refer to anything outside its own folder.
// So every skill has to carry the files it needs, and the sources are edited in one place only.
//
//   src/                            → skills/<every skill that has a SKILL.md>/scripts/
//   shared/references/grading.md    → skills/quiz/references/, skills/review/references/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 여러 스킬이 함께 쓰는 문서: 원본 경로 → 복사할 스킬들 (스킬 폴더 안의 같은 상대 경로로)
// Documents shared by several skills: source path → skills to copy it to (at the same relative path in each skill folder)
const SHARED = {
  'references/grading.md': ['quiz', 'review'],
};

function parse(argv) {
  const check = argv.includes('--check');
  const rootIndex = argv.indexOf('--root'); // 테스트용 / For tests
  const root =
    rootIndex !== -1
      ? path.resolve(argv[rootIndex + 1])
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return { check, root };
}

/** 폴더 안의 모든 파일을 "a/b.mjs" 같은 상대 경로로 돌려준다. / Returns every file in the folder as a relative path such as "a/b.mjs". */
function listFiles(dir) {
  const out = [];
  const walk = (current, prefix) => {
    for (const d of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      if (d.isDirectory()) walk(path.join(current, d.name), rel);
      else if (d.isFile()) out.push(rel);
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out.sort();
}

function skillNames(root) {
  const skills = path.join(root, 'skills');
  if (!fs.existsSync(skills)) return [];
  return fs
    .readdirSync(skills, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skills, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

const toNative = (rel) => rel.split('/');

function main() {
  const { check, root } = parse(process.argv.slice(2));
  const src = path.join(root, 'src');
  const sourceFiles = listFiles(src);
  if (sourceFiles.length === 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code: 'NO_SOURCE', message: `No files in ${src}` } })}\n`);
    return 1;
  }
  const skills = skillNames(root);
  const problems = [];
  let copied = 0;
  let removed = 0;

  /** 원본 하나를 대상 하나로 맞춘다. / Brings one target in line with one source. */
  const syncFile = (from, to, label) => {
    const same = fs.existsSync(to) && fs.readFileSync(from).equals(fs.readFileSync(to));
    if (same) return;
    if (check) {
      problems.push(`${label} differs from its source`);
      return;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied += 1;
  };

  // 1. 스크립트: 모든 스킬
  // 1. Scripts: every skill
  for (const skill of skills) {
    const target = path.join(root, 'skills', skill, 'scripts');
    for (const rel of sourceFiles) {
      syncFile(path.join(src, ...toNative(rel)), path.join(target, ...toNative(rel)), `skills/${skill}/scripts/${rel}`);
    }
    for (const rel of listFiles(target)) {
      if (sourceFiles.includes(rel)) continue;
      if (check) {
        problems.push(`skills/${skill}/scripts/${rel} is not in src/`);
        continue;
      }
      fs.rmSync(path.join(target, ...toNative(rel)));
      removed += 1;
    }
  }

  // 2. 함께 쓰는 문서: 정해진 스킬만 (그 스킬이 있을 때)
  // 2. Shared documents: only the listed skills (when that skill exists)
  for (const [rel, targets] of Object.entries(SHARED)) {
    const from = path.join(root, 'shared', ...toNative(rel));
    if (!fs.existsSync(from)) {
      problems.push(`shared/${rel} is missing`);
      continue;
    }
    for (const skill of targets.filter((s) => skills.includes(s))) {
      syncFile(from, path.join(root, 'skills', skill, ...toNative(rel)), `skills/${skill}/${rel}`);
    }
  }

  const ok = problems.length === 0;
  const result = check
    ? { ok, skills, problems, hint: ok ? undefined : 'Run: node tools/sync-skills.mjs' }
    : { ok, skills, copied, removed, problems };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return ok ? 0 : 1;
}

process.exitCode = main();

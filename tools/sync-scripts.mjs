// src/ 의 스크립트를 각 스킬의 scripts/ 폴더로 복사한다.
//
//   node tools/sync-scripts.mjs           복사 (사본에만 있는 파일은 지운다)
//   node tools/sync-scripts.mjs --check   다른 곳이 있으면 종료 코드 1 (CI용)
//
// 왜 사본을 두나: Agent Skills 표준에서 스킬은 자기 폴더 밖을 참조하면 안 된다.
// 그래서 스킬마다 스크립트를 갖고 있어야 하고, 원본은 src/ 한 곳만 고친다.
// 대상은 skills/<이름>/SKILL.md 가 있는 폴더뿐이다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parse(argv) {
  const check = argv.includes('--check');
  const rootIndex = argv.indexOf('--root'); // 테스트용
  const root =
    rootIndex !== -1
      ? path.resolve(argv[rootIndex + 1])
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return { check, root };
}

/** 폴더 안의 모든 파일을 "a/b.mjs" 같은 상대 경로로 돌려준다. */
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

function skillScriptDirs(root) {
  const skills = path.join(root, 'skills');
  if (!fs.existsSync(skills)) return [];
  return fs
    .readdirSync(skills, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skills, d.name, 'SKILL.md')))
    .map((d) => path.join(skills, d.name, 'scripts'))
    .sort();
}

function main() {
  const { check, root } = parse(process.argv.slice(2));
  const src = path.join(root, 'src');
  const sourceFiles = listFiles(src);
  if (sourceFiles.length === 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code: 'NO_SOURCE', message: `No files in ${src}` } })}\n`);
    return 1;
  }
  const targets = skillScriptDirs(root);
  const problems = [];
  let copied = 0;
  let removed = 0;

  for (const target of targets) {
    const label = path.relative(root, target).split(path.sep).join('/');
    for (const rel of sourceFiles) {
      const from = path.join(src, ...rel.split('/'));
      const to = path.join(target, ...rel.split('/'));
      const same = fs.existsSync(to) && fs.readFileSync(from).equals(fs.readFileSync(to));
      if (same) continue;
      if (check) {
        problems.push(`${label}/${rel} differs from src/${rel}`);
        continue;
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      copied += 1;
    }
    for (const rel of listFiles(target)) {
      if (sourceFiles.includes(rel)) continue;
      if (check) {
        problems.push(`${label}/${rel} is not in src/`);
        continue;
      }
      fs.rmSync(path.join(target, ...rel.split('/')));
      removed += 1;
    }
  }

  const ok = problems.length === 0;
  const result = check
    ? { ok, targets: targets.length, problems, hint: ok ? undefined : 'Run: node tools/sync-scripts.mjs' }
    : { ok, targets: targets.length, copied, removed };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return ok ? 0 : 1;
}

process.exitCode = main();

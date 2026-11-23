// 플러그인 없이 Agent Skills 표준 스킬로 설치한다.
//
//   node tools/install-skills.mjs --dest <스킬 폴더> [--prefix whycommit-] [--force] [--dry-run]
//
// 예: node tools/install-skills.mjs --dest ~/.claude/skills
//     node tools/install-skills.mjs --dest ~/.agents/skills
//
// 왜 이름을 바꾸나: commit, review 같은 짧은 이름은 다른 스킬이나 에이전트 내장 명령과 겹치기 쉽다
// (예: Claude Code의 /review). 그래서 whycommit-commit처럼 접두사를 붙인다.
// 표준은 SKILL.md의 name이 폴더 이름과 같아야 하므로 name도 함께 바꾼다.
// 플러그인으로 설치하면 /whycommit:commit처럼 이름이 저절로 구분되므로 이 도구가 필요 없다.
//
// Installs the skills as standard Agent Skills, without the plugin.
//
//   node tools/install-skills.mjs --dest <skills folder> [--prefix whycommit-] [--force] [--dry-run]
//
// Examples: node tools/install-skills.mjs --dest ~/.claude/skills
//           node tools/install-skills.mjs --dest ~/.agents/skills
//
// Why rename: short names such as commit and review easily clash with other skills or with an agent's
// built-in commands (for example /review in Claude Code). So a prefix is added, as in whycommit-commit.
// The standard requires the name in SKILL.md to match the folder name, so name is changed as well.
// When installed as a plugin, names are kept apart automatically, as in /whycommit:commit, so this tool is not needed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME_RULE = /^[a-z0-9]+(-[a-z0-9]+)*$/; // Agent Skills 표준의 name 규칙 / The name rule of the Agent Skills standard

function fail(code, message) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`);
  return 1;
}

function parse(argv) {
  const options = { prefix: 'whycommit-', force: false, dryRun: false, dest: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--dest' || arg === '--prefix') {
      options[arg.slice(2)] = argv[i + 1] ?? '';
      i += 1;
    } else return { error: `Unknown argument: ${arg}` };
  }
  return { options };
}

/** "~/..."를 홈 폴더로 바꾼다. PowerShell은 node에 넘기는 인자의 ~를 펼치지 않는다. / Expands "~/..." to the home folder. PowerShell does not expand ~ in arguments passed to node. */
function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** 이미 있는 폴더가 whycommit이 설치한 것인지 (그러면 덮어써도 된다) / Whether an existing folder was installed by whycommit (if so, it may be overwritten) */
function isOurs(dir) {
  const skillFile = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return false;
  return /^\s+project:\s*whycommit\s*$/m.test(fs.readFileSync(skillFile, 'utf8'));
}

function main() {
  const parsed = parse(process.argv.slice(2));
  if (parsed.error) return fail('USAGE', parsed.error);
  const { options } = parsed;
  if (!options.dest) return fail('USAGE', 'Give --dest <folder>, for example: --dest ~/.claude/skills');
  if (options.prefix !== '' && !/^[a-z0-9]+(-[a-z0-9]+)*-$/.test(options.prefix)) {
    return fail('USAGE', '--prefix must be lowercase letters, digits and hyphens, ending with "-" (or empty).');
  }
  const dest = path.resolve(expandHome(options.dest));
  const skillsDir = path.join(ROOT, 'skills');
  const names = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();

  const plan = names.map((name) => {
    const installedName = `${options.prefix}${name}`;
    const target = path.join(dest, installedName);
    return { name, installedName, target, exists: fs.existsSync(target), ours: isOurs(target) };
  });

  for (const p of plan) {
    if (!NAME_RULE.test(p.installedName) || p.installedName.length > 64) {
      return fail('USAGE', `"${p.installedName}" is not a valid skill name.`);
    }
    if (p.exists && !p.ours && !options.force) {
      return fail(
        'NOT_OURS',
        `${p.target} already exists and was not installed by whycommit. Choose another --prefix, or pass --force to replace it.`,
      );
    }
  }

  if (!options.dryRun) {
    for (const p of plan) {
      fs.rmSync(p.target, { recursive: true, force: true }); // 예전 버전의 남은 파일을 없앤다 / Removes files left over from an older version
      fs.cpSync(path.join(skillsDir, p.name), p.target, { recursive: true });
      const skillFile = path.join(p.target, 'SKILL.md');
      const text = fs.readFileSync(skillFile, 'utf8');
      const renamed = text.replace(/^name:\s*.+$/m, `name: ${p.installedName}`);
      if (renamed === text && p.installedName !== p.name) return fail('INTERNAL', `No name field in ${skillFile}`);
      fs.writeFileSync(skillFile, renamed, 'utf8');
    }
  }

  const result = {
    ok: true,
    dryRun: options.dryRun,
    dest,
    installed: plan.map((p) => ({ skill: p.installedName, path: p.target, replaced: p.exists })),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

process.exitCode = main();

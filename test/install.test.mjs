import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { KO, ROOT, createSandbox } from './helpers.mjs';

const INSTALL = path.join(ROOT, 'tools', 'install-skills.mjs');

function install(sb, args, env = {}) {
  const r = spawnSync(process.execPath, [INSTALL, ...args], { env: { ...sb.env, ...env }, encoding: 'utf8' });
  return { status: r.status, json: JSON.parse(r.stdout) };
}

const nameOf = (dir) => /^name:\s*(.+)$/m.exec(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'))[1].trim();

test('접두사를 붙여 설치하고, SKILL.md의 name도 폴더 이름과 같게 바꾼다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const dest = path.join(sb.root, `스킬 폴더 ${KO}`);
  const r = install(sb, ['--dest', dest]);
  assert.equal(r.status, 0);
  assert.deepEqual(r.json.installed.map((x) => x.skill), ['whycommit-commit', 'whycommit-quiz', 'whycommit-review']);
  for (const skill of ['whycommit-commit', 'whycommit-quiz', 'whycommit-review']) {
    const dir = path.join(dest, skill);
    assert.equal(nameOf(dir), skill);
    assert.ok(fs.existsSync(path.join(dir, 'scripts', 'wc.mjs')), `${skill}: 스크립트가 함께 들어간다`);
  }
  assert.ok(fs.existsSync(path.join(dest, 'whycommit-quiz', 'references', 'grading.md')));
  assert.ok(fs.existsSync(path.join(dest, 'whycommit-review', 'references', 'grading.md')));

  // 설치된 사본의 스크립트가 그 자리에서 동작한다
  const help = spawnSync(process.execPath, [path.join(dest, 'whycommit-quiz', 'scripts', 'wc.mjs'), 'help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  // 원본 레포의 SKILL.md는 바뀌지 않는다
  assert.equal(nameOf(path.join(ROOT, 'skills', 'quiz')), 'quiz');
});

test('다시 설치하면 예전 whycommit 설치를 바꾸고, 남은 파일도 지운다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const dest = sb.dir('skills');
  install(sb, ['--dest', dest]);
  fs.writeFileSync(path.join(dest, 'whycommit-commit', 'old-file.txt'), 'x');
  const again = install(sb, ['--dest', dest]);
  assert.equal(again.status, 0);
  assert.equal(again.json.installed[0].replaced, true);
  assert.equal(fs.existsSync(path.join(dest, 'whycommit-commit', 'old-file.txt')), false);
});

test('같은 이름의 다른 스킬이 있으면 --force 없이는 건드리지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const dest = sb.dir('skills');
  const other = path.join(dest, 'whycommit-review');
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, 'SKILL.md'), '---\nname: whycommit-review\ndescription: 남의 스킬\n---\n');
  const r = install(sb, ['--dest', dest]);
  assert.equal(r.status, 1);
  assert.equal(r.json.error.code, 'NOT_OURS');
  assert.equal(fs.existsSync(path.join(dest, 'whycommit-commit')), false, '하나라도 막히면 아무것도 설치하지 않는다');
  assert.equal(install(sb, ['--dest', dest, '--force']).status, 0);
});

test('~는 홈 폴더로 펼치고(PowerShell은 펼쳐 주지 않는다), --prefix와 --dry-run을 받는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const home = sb.dir(`홈 ${KO}`);
  const dry = install(sb, ['--dest', '~/.agents/skills', '--dry-run'], { HOME: home, USERPROFILE: home });
  assert.equal(dry.json.dest, path.join(home, '.agents', 'skills'));
  assert.equal(fs.existsSync(dry.json.dest), false, 'dry-run은 아무것도 만들지 않는다');

  const plain = install(sb, ['--dest', '~/skills', '--prefix', 'my-'], { HOME: home, USERPROFILE: home });
  assert.equal(plain.status, 0);
  assert.equal(nameOf(path.join(home, 'skills', 'my-quiz')), 'my-quiz');
  assert.equal(install(sb, ['--dest', '~/x', '--prefix', 'Bad_'], { HOME: home, USERPROFILE: home }).json.error.code, 'USAGE');
});

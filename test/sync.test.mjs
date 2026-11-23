import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT, createSandbox } from './helpers.mjs';

const SYNC = path.join(ROOT, 'tools', 'sync-skills.mjs');

function sync(root, ...args) {
  const r = spawnSync(process.execPath, [SYNC, '--root', root, ...args], { encoding: 'utf8' });
  return { status: r.status, json: JSON.parse(r.stdout) };
}

function fakeRepo(sb) {
  const root = sb.dir('가짜 레포');
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'wc.mjs'), '// 원본\n');
  fs.writeFileSync(path.join(root, 'src', 'lib', 'a.mjs'), 'export const a = 1;\n');
  fs.mkdirSync(path.join(root, 'shared', 'references'), { recursive: true });
  fs.writeFileSync(path.join(root, 'shared', 'references', 'grading.md'), '# 채점 기준\n');
  for (const name of ['commit', 'quiz']) {
    fs.mkdirSync(path.join(root, 'skills', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
  }
  fs.mkdirSync(path.join(root, 'skills', 'not-a-skill'), { recursive: true }); // SKILL.md 없음
  return root;
}

test('스크립트는 SKILL.md가 있는 모든 스킬에, 공통 문서는 정해진 스킬에만 복사하고 --check로 어긋남을 찾는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const root = fakeRepo(sb);

  assert.equal(sync(root, '--check').status, 1, '복사 전에는 어긋난다');
  const first = sync(root);
  assert.equal(first.status, 0);
  assert.deepEqual(first.json.skills, ['commit', 'quiz']);
  assert.equal(first.json.copied, 5, '스크립트 2개 x 2 + grading.md 1 (quiz만)');
  assert.equal(fs.existsSync(path.join(root, 'skills', 'not-a-skill', 'scripts')), false);
  assert.equal(fs.existsSync(path.join(root, 'skills', 'commit', 'references')), false, 'commit은 채점 문서가 필요 없다');
  assert.equal(fs.readFileSync(path.join(root, 'skills', 'quiz', 'references', 'grading.md'), 'utf8'), '# 채점 기준\n');
  assert.equal(sync(root, '--check').status, 0);

  fs.writeFileSync(path.join(root, 'skills', 'quiz', 'scripts', 'lib', 'a.mjs'), 'export const a = 2;\n');
  fs.writeFileSync(path.join(root, 'skills', 'commit', 'scripts', 'stale.mjs'), '');
  fs.writeFileSync(path.join(root, 'skills', 'quiz', 'references', 'grading.md'), '# 사본을 직접 고침\n');
  fs.writeFileSync(path.join(root, 'skills', 'quiz', 'references', 'formats.md'), '스킬 전용 문서\n');
  const check = sync(root, '--check');
  assert.equal(check.status, 1);
  assert.deepEqual(check.json.problems, [
    'skills/commit/scripts/stale.mjs is not in src/',
    'skills/quiz/scripts/lib/a.mjs differs from its source',
    'skills/quiz/references/grading.md differs from its source',
  ]);

  const again = sync(root);
  assert.equal(again.json.copied, 2);
  assert.equal(again.json.removed, 1);
  assert.equal(sync(root, '--check').status, 0);
  assert.ok(fs.existsSync(path.join(root, 'skills', 'quiz', 'references', 'formats.md')), '스킬 전용 문서는 건드리지 않는다');
});

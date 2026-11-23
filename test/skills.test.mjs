// 스킬과 매니페스트가 Agent Skills 표준과 Claude Code 플러그인 형식을 지키는지 검사한다.
// CI에는 Claude Code가 없어서 "claude plugin validate"를 못 돌리므로, 표준의 규칙을 직접 확인한다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT } from './helpers.mjs';

const SKILLS = path.join(ROOT, 'skills');
const skillNames = fs.readdirSync(SKILLS).filter((d) => fs.existsSync(path.join(SKILLS, d, 'SKILL.md')));
const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

/** 우리가 쓰는 만큼만 읽는 작은 YAML 해석기: "key: value", 큰따옴표 문자열, 한 단계 들여쓴 map */
function frontmatter(text) {
  assert.ok(text.startsWith('---\n'), 'SKILL.md는 첫 줄에 ---로 시작해야 한다');
  const end = text.indexOf('\n---\n', 4);
  assert.ok(end > 0, 'frontmatter를 닫는 ---가 있어야 한다');
  const data = {};
  let current = null;
  for (const line of text.slice(4, end).split('\n')) {
    if (!line.trim()) continue;
    const nested = /^ {2}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (nested && current) {
      data[current][nested[1]] = nested[2];
      continue;
    }
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    assert.ok(top, `읽을 수 없는 줄: ${line}`);
    let value = top[2];
    if (value === '') {
      data[top[1]] = {};
      current = top[1];
      continue;
    }
    current = null;
    if (value.startsWith('"')) value = JSON.parse(value);
    data[top[1]] = value;
  }
  return { data, body: text.slice(end + 5) };
}

for (const name of skillNames) {
  test(`${name}: Agent Skills 표준의 frontmatter 규칙`, () => {
    const text = fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');
    const { data } = frontmatter(text);
    for (const key of Object.keys(data)) assert.ok(ALLOWED_KEYS.has(key), `표준에 없는 키: ${key}`);
    assert.equal(data.name, name, 'name은 폴더 이름과 같아야 한다');
    assert.match(data.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(data.name.length <= 64);
    assert.ok(data.description.length >= 1 && data.description.length <= 1024, `description 길이 ${data.description.length}`);
    assert.doesNotMatch(data.description, /[<>]/, 'description에 꺾쇠를 쓰지 않는다');
    if (data.compatibility) assert.ok(data.compatibility.length <= 500);
    for (const v of Object.values(data.metadata ?? {})) assert.equal(typeof v, 'string');
  });

  test(`${name}: 특정 에이전트에 묶이지 않고, 참고 문서가 실제로 있다 (원칙 8)`, () => {
    const dir = path.join(SKILLS, name);
    const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    assert.ok(text.split('\n').length < 500, 'SKILL.md는 500줄보다 짧게');
    const refDir = path.join(dir, 'references');
    const refs = fs.existsSync(refDir) ? fs.readdirSync(refDir).map((f) => fs.readFileSync(path.join(refDir, f), 'utf8')) : [];
    const docs = [text, ...refs];
    for (const doc of docs) {
      assert.doesNotMatch(doc, /\$\{CLAUDE_/, 'Claude Code 전용 변수');
      assert.doesNotMatch(doc, /\b(AskUserQuestion|TodoWrite|Bash\(|PowerShell\()/, '특정 에이전트의 도구 이름');
    }
    for (const ref of text.match(/references\/[a-z-]+\.md/g) ?? []) {
      assert.ok(fs.existsSync(path.join(dir, ref)), `${ref}가 없다`);
    }
  });
}

test('세 스킬이 모두 있다', () => {
  assert.deepEqual(skillNames.sort(), ['commit', 'quiz', 'review']);
});

test('플러그인과 마켓플레이스 매니페스트가 서로 맞다', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(plugin.name, 'whycommit');
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(plugin.license, 'MIT');
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, plugin.name, '마켓플레이스 항목 이름이 plugin.json과 같아야 설치된다');
  assert.equal(market.plugins[0].source, './');
  assert.equal(market.plugins[0].version, undefined, '버전은 plugin.json 한 곳에만 둔다');
  assert.ok(market.owner?.name);
});

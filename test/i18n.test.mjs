// 본문 제목과 노트 문구의 언어 (한국어 / 영어)
// Language of the record headings and the notes text (Korean / English)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createSandbox, makeRepo, readJsonFile, wc, wcOk } from './helpers.mjs';

const DRAFT = {
  done: ['Added coupon discounts'],
  todo: [
    { text: 'Remove items', source: 'plan' },
    { text: 'Limit retries', source: 'todo', ref: 'src/a.js:3' },
    { text: 'Better error text', source: 'issue', ref: '#7' },
    { text: 'Negative totals for percent coupons', source: 'quiz' },
  ],
};

const entry = (topic, result = 'wrong') => ({
  topic,
  questionType: 'why',
  attempt: { question: 'Why?', answerSummary: result === 'dont_know' ? '' : 'Because', result, explanation: 'Explained' },
});

test('--lang en이면 영어 제목과 출처 이름을 쓴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const out = sb.outPath('body.md');
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--lang', 'en', '--out', out], { cwd: repo });
  assert.equal(
    fs.readFileSync(out, 'utf8'),
    [
      "### Today's work",
      '- Added coupon discounts',
      '',
      '### Remaining work',
      '- Remove items (plan)',
      '- Limit retries (TODO comment: src/a.js:3)',
      '- Better error text (issue #7)',
      '- Negative totals for percent coupons (found in quiz)',
      '',
    ].join('\n'),
  );

  const commitOut = sb.outPath('body.txt');
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--lang', 'en-US', '--target', 'commit', '--out', commitOut], { cwd: repo });
  assert.match(fs.readFileSync(commitOut, 'utf8'), /^Today's work\n- Added coupon discounts\n\nRemaining work\n/);
});

test('한국어가 아닌 언어는 영어 문구를 쓰고, 정하지 않으면 한국어다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const out = sb.outPath('body.md');
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--lang', 'ja', '--out', out], { cwd: repo });
  assert.match(fs.readFileSync(out, 'utf8'), /^### Today's work/);
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--out', out], { cwd: repo });
  assert.match(fs.readFileSync(out, 'utf8'), /^### 오늘 한 작업/);
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--lang', 'ko-KR', '--out', out], { cwd: repo });
  assert.match(fs.readFileSync(out, 'utf8'), /^### 오늘 한 작업/);
  assert.equal(wc(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--lang', 'english!', '--out', out], { cwd: repo }).json.error.code, 'INVALID_INPUT');
});

test('설정의 language가 en이면 --lang 없이도 영어다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  wcOk(sb, ['config', 'set', '--key', 'language', '--value', 'en']);
  const out = sb.outPath('body.md');
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--out', out], { cwd: repo });
  assert.match(fs.readFileSync(out, 'utf8'), /^### Today's work/);
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', DRAFT), '--lang', 'ko', '--out', out], { cwd: repo });
  assert.match(fs.readFileSync(out, 'utf8'), /^### 오늘 한 작업/, '--lang이 설정보다 앞선다');
});

test('학습 내용 제목도 언어를 따른다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const added = wcOk(sb, ['notes', 'add', '--file', sb.input('n.json', { entries: [entry('Shared refresh promise', 'correct'), entry('Duplicate refreshes')] })], { cwd: repo });
  const out = sb.outPath('body.md');
  const draft = { ...DRAFT, learning: { include: true, ids: added.ids.map((x) => x.id) } };
  wcOk(sb, ['body', 'render', '--file', sb.input('d.json', draft), '--lang', 'en', '--out', out], { cwd: repo });
  assert.match(fs.readFileSync(out, 'utf8'), /### What I understood\n- Shared refresh promise\n\n### What I don't understand yet\n- Duplicate refreshes\n$/);
});

test('노트는 입력 파일의 lang으로 다시 만들고, 그 언어를 프로젝트마다 기억한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  const md = path.join(sb.home, 'projects', '_local', 'repo', 'notes.md');

  const first = wcOk(sb, ['notes', 'add', '--file', sb.input('a.json', { lang: 'en', entries: [entry('Why a lookup table')] })], { cwd: repo });
  let text = fs.readFileSync(md, 'utf8');
  assert.match(text, /^# whycommit learning notes: _local\/repo/);
  assert.match(text, /## What I don't understand yet \(1\)/);
  assert.match(text, /- Times to revisit: 1/);
  assert.match(text, /- Question type: Why this way\?/);
  assert.match(text, /\*\*My answer \(summary\)\*\*/);
  assert.doesNotMatch(text, /[가-힣]/, '영어 노트에 한글 문구가 섞이지 않는다');
  assert.equal(readJsonFile(md.replace(/notes\.md$/, 'notes.json')).lang, 'en');

  // lang 없이 기록해도 기억한 언어로 다시 만든다
  wcOk(sb, ['notes', 'review-result', '--file', sb.input('r.json', { id: first.ids[0].id, attempt: { question: 'Again?', answerSummary: 'Yes', result: 'correct' } })], { cwd: repo });
  text = fs.readFileSync(md, 'utf8');
  assert.match(text, /## What I understood \(1\)/);
  assert.match(text, /Review: Understood/);

  // 한국어로 바꾸면 파일 전체가 한국어로 바뀐다
  wcOk(sb, ['notes', 'add', '--file', sb.input('b.json', { lang: 'ko', entries: [entry('두 번째 주제')] })], { cwd: repo });
  text = fs.readFileSync(md, 'utf8');
  assert.match(text, /^# whycommit 학습 노트: _local\/repo/);
  assert.doesNotMatch(text, /What I understood/);
});

test('설정의 language를 노트에도 쓰고, 잘못된 lang은 거부한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb);
  wcOk(sb, ['config', 'set', '--key', 'language', '--value', 'en']);
  const out = wcOk(sb, ['notes', 'add', '--file', sb.input('a.json', { entries: [entry('Topic')] })], { cwd: repo });
  assert.match(fs.readFileSync(out.notesMd, 'utf8'), /^# whycommit learning notes/);
  const bad = wc(sb, ['notes', 'add', '--file', sb.input('b.json', { lang: 'not a code', entries: [entry('Topic 2')] })], { cwd: repo });
  assert.equal(bad.json.error.code, 'INVALID_INPUT');
});

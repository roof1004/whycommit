import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from '../src/lib/config.mjs';
import { createSandbox, readJsonFile, wc, wcOk } from './helpers.mjs';

test('첫 실행은 묻지 않고 기본값으로 설정 파일을 만든다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const first = wcOk(sb, ['config', 'get']);
  assert.equal(first.created, true);
  assert.deepEqual(first.config, {
    quiz: { minQuestions: 2, maxQuestions: 5, followUpsPerQuestion: 1 },
    body: { includeLearning: false },
    review: { count: 5 },
    language: 'auto',
    hasWritingStyle: false,
  });
  assert.deepEqual(readJsonFile(first.path), DEFAULT_CONFIG);
  assert.equal(wcOk(sb, ['config', 'get']).created, false);
});

test('config set으로 값을 바꾸고 저장한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  wcOk(sb, ['config', 'set', '--key', 'quiz.maxQuestions', '--value', '4']);
  wcOk(sb, ['config', 'set', '--key', 'body.includeLearning', '--value', 'on']);
  wcOk(sb, ['config', 'set', '--key', 'language', '--value', 'ko']);
  const { config } = wcOk(sb, ['config', 'get']);
  assert.equal(config.quiz.maxQuestions, 4);
  assert.equal(config.body.includeLearning, true);
  assert.equal(config.language, 'ko');
});

test('잘못된 값과 모르는 키는 거부한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const cases = [
    ['quiz.maxQuestions', '0'],
    ['quiz.maxQuestions', 'many'],
    ['quiz.minQuestions', '6'], // 최대(5)보다 크다
    ['body.includeLearning', 'maybe'],
    ['nope', '1'],
  ];
  for (const [key, value] of cases) {
    const r = wc(sb, ['config', 'set', '--key', key, '--value', value]);
    assert.equal(r.status, 2, `${key}=${value}`);
  }
  assert.equal(wcOk(sb, ['config', 'get']).config.quiz.minQuestions, 2);
});

test('작성 스타일은 파일로 받아 한글과 줄바꿈 그대로 저장한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const style = '항목은 짧게, 명사로 끝내기\n관련 있는 것끼리 묶기\n말투: 해요체';
  const set = wcOk(sb, ['config', 'set-style', '--file', sb.input('style.txt', `${style}\r\n`)]);
  assert.equal(set.hasWritingStyle, true);
  assert.equal(wcOk(sb, ['config', 'get']).config.hasWritingStyle, true);

  const out = sb.outPath('config.json');
  wcOk(sb, ['config', 'get', '--out', out]);
  assert.equal(readJsonFile(out).writingStyle, style);
  assert.equal(readJsonFile(set.path).writingStyle, style);

  wcOk(sb, ['config', 'set-style', '--file', sb.input('empty.txt', '')]);
  assert.equal(wcOk(sb, ['config', 'get']).config.hasWritingStyle, false);
});

test('사람이 망가뜨린 설정 파일은 덮어쓰지 않고 오류로 알린다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const { path: file } = wcOk(sb, ['config', 'get']);
  fs.writeFileSync(file, '{ "quiz": ');
  const r = wc(sb, ['config', 'get']);
  assert.equal(r.status, 1);
  assert.equal(r.json.error.code, 'CONFIG_INVALID');
  assert.equal(fs.readFileSync(file, 'utf8'), '{ "quiz": ');
});

test('파일 안의 잘못된 값은 기본값으로 쓰고 경고한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const { path: file } = wcOk(sb, ['config', 'get']);
  fs.writeFileSync(file, JSON.stringify({ quiz: { maxQuestions: 99 }, review: { count: 3 } }));
  const out = wcOk(sb, ['config', 'get']);
  assert.equal(out.config.quiz.maxQuestions, 5);
  assert.equal(out.config.review.count, 3);
  assert.equal(out.warnings.length, 1);
});

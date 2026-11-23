// 설정 파일 (~/whycommit/config.json).
// 첫 실행 때는 아무것도 묻지 않고 기본값으로 파일을 만든다 (기획 8장).
// 사람이 직접 고친 값이 잘못됐으면 파일은 건드리지 않고 그 값만 기본값으로 바꿔 쓰고 경고한다.
//
// The config file (~/whycommit/config.json).
// On the first run it asks nothing and creates the file with the defaults (spec section 8).
// If a value someone edited by hand is invalid, the file is left alone; only that value falls back to the default,
// with a warning.

import fs from 'node:fs';
import { UsageError, WcError } from './cli.mjs';
import { readJson, writeJsonAtomic } from './io.mjs';
import { assertDataHomeSafe, configPath } from './paths.mjs';

export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  quiz: { minQuestions: 2, maxQuestions: 5, followUpsPerQuestion: 1 },
  body: { includeLearning: false },
  review: { count: 5 },
  language: 'auto',
  writingStyle: '',
});

// config set으로 바꿀 수 있는 값. writingStyle은 내용이라 set-style로 파일을 통해 받는다.
// Values that config set can change. writingStyle is content, so set-style takes it through a file.
const SETTABLE = {
  'quiz.minQuestions': { type: 'int', min: 1, max: 10 },
  'quiz.maxQuestions': { type: 'int', min: 1, max: 10 },
  'quiz.followUpsPerQuestion': { type: 'int', min: 0, max: 3 },
  'body.includeLearning': { type: 'bool' },
  'review.count': { type: 'int', min: 1, max: 20 },
  language: { type: 'language' },
};

export const SETTABLE_KEYS = Object.keys(SETTABLE);
const MAX_STYLE_LENGTH = 2000;

const clone = (v) => JSON.parse(JSON.stringify(v));

function getAt(obj, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function setAt(obj, key, value) {
  const parts = key.split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof o[p] !== 'object' || o[p] === null) o[p] = {};
    o = o[p];
  }
  o[parts[parts.length - 1]] = value;
}

function isValid(spec, value) {
  switch (spec.type) {
    case 'int':
      return Number.isInteger(value) && value >= spec.min && value <= spec.max;
    case 'bool':
      return typeof value === 'boolean';
    case 'language':
      return value === 'auto' || (typeof value === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value));
    default:
      return false;
  }
}

function parseValue(spec, raw) {
  switch (spec.type) {
    case 'int':
      return /^\d+$/.test(raw) ? Number(raw) : NaN;
    case 'bool': {
      const v = raw.toLowerCase();
      if (['true', 'on', 'yes', '1'].includes(v)) return true;
      if (['false', 'off', 'no', '0'].includes(v)) return false;
      return null;
    }
    default:
      return raw;
  }
}

function describe(spec) {
  if (spec.type === 'int') return `a whole number from ${spec.min} to ${spec.max}`;
  if (spec.type === 'bool') return 'true or false';
  return '"auto" or a language code such as ko or en';
}

/** 설정을 읽는다. 파일이 없으면 기본값으로 만든다. / Reads the config. Creates it with the defaults if the file does not exist. */
export function loadConfig() {
  const file = configPath();
  if (!fs.existsSync(file)) {
    assertDataHomeSafe();
    writeJsonAtomic(file, DEFAULT_CONFIG);
    return { config: clone(DEFAULT_CONFIG), created: true, warnings: [] };
  }
  let raw;
  try {
    raw = readJson(file, 'config.json');
  } catch (error) {
    throw new WcError('CONFIG_INVALID', `${error.message} Fix or delete ${file} (it will be recreated with defaults).`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new WcError('CONFIG_INVALID', `config.json must contain a JSON object: ${file}`);
  }
  const config = clone(DEFAULT_CONFIG);
  const warnings = [];
  for (const [key, spec] of Object.entries(SETTABLE)) {
    const value = getAt(raw, key);
    if (value === undefined) continue;
    if (isValid(spec, value)) setAt(config, key, value);
    else warnings.push(`${key} has an invalid value; using the default (${JSON.stringify(getAt(DEFAULT_CONFIG, key))}).`);
  }
  if (config.quiz.minQuestions > config.quiz.maxQuestions) {
    warnings.push('quiz.minQuestions is larger than quiz.maxQuestions; using the defaults for both.');
    config.quiz.minQuestions = DEFAULT_CONFIG.quiz.minQuestions;
    config.quiz.maxQuestions = DEFAULT_CONFIG.quiz.maxQuestions;
  }
  if (typeof raw.writingStyle === 'string') config.writingStyle = raw.writingStyle;
  else if (raw.writingStyle !== undefined) warnings.push('writingStyle must be text; ignoring it.');
  return { config, created: false, warnings };
}

/** config set: 값 하나를 바꾸고 저장한다. / config set: changes one value and saves it. */
export function setConfigValue(key, rawValue) {
  const spec = SETTABLE[key];
  if (!spec) throw new UsageError(`Unknown setting "${key}". Settable keys: ${SETTABLE_KEYS.join(', ')}.`);
  const value = parseValue(spec, rawValue);
  if (!isValid(spec, value)) throw new UsageError(`${key} must be ${describe(spec)}.`);
  const { config } = loadConfig();
  setAt(config, key, value);
  if (config.quiz.minQuestions > config.quiz.maxQuestions) {
    throw new UsageError(
      `quiz.minQuestions (${config.quiz.minQuestions}) cannot be larger than quiz.maxQuestions (${config.quiz.maxQuestions}).`,
    );
  }
  assertDataHomeSafe();
  writeJsonAtomic(configPath(), config);
  return config;
}

/** "앞으로도 이렇게 써줘"라고 했을 때만 부른다. 빈 내용이면 스타일을 지운다. / Called only when the user says "write it like this from now on". Empty content clears the style. */
export function setWritingStyle(text) {
  const style = text.trim();
  if (style.length > MAX_STYLE_LENGTH) {
    throw new WcError('INVALID_INPUT', `The writing style is too long (max ${MAX_STYLE_LENGTH} characters).`);
  }
  const { config } = loadConfig();
  config.writingStyle = style;
  assertDataHomeSafe();
  writeJsonAtomic(configPath(), config);
  return config;
}

/** stdout에 실어도 되는 부분만 (writingStyle은 내용이라 빼고 있는지 여부만 알린다). / Only the parts safe to put on stdout (writingStyle is content, so it is left out and only its presence is reported). */
export function publicConfig(config) {
  return {
    quiz: config.quiz,
    body: config.body,
    review: config.review,
    language: config.language,
    hasWritingStyle: config.writingStyle.length > 0,
  };
}

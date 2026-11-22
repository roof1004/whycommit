// 명령줄 인자 해석, JSON 출력, 오류 형식.
//
// 규칙 (기획 9.1):
// - 인자는 ASCII 옵션과 경로만 받는다. 질문·답·해설 같은 내용은 UTF-8 파일로 받는다.
// - 결과는 stdout에 JSON 하나로 낸다. 성공은 종료 코드 0, 실패는 0이 아닌 값이다.
// - 사람이 읽을 내용(한글 등)은 stdout에 싣지 않고 --out 파일로 쓴다.

export class WcError extends Error {
  /**
   * @param {string} code 에이전트가 분기할 때 쓰는 오류 코드 (예: NOT_A_GIT_REPO)
   * @param {string} message 사람이 읽는 설명 (ASCII 영어)
   * @param {unknown} [details] 추가 정보
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'WcError';
    this.code = code;
    this.details = details;
  }
}

/** 명령이나 옵션을 잘못 쓴 경우. 종료 코드 2로 구분한다. */
export class UsageError extends WcError {
  constructor(message) {
    super('USAGE', message);
  }
}

/**
 * "--key value", "--key=value", "--flag" 형태를 해석한다.
 * booleanFlags에 있는 이름은 값을 받지 않는다.
 */
export function parseArgs(argv, booleanFlags = new Set()) {
  const positionals = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      options[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    if (booleanFlags.has(body)) {
      options[body] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[body] = true;
      continue;
    }
    options[body] = next;
    i += 1;
  }
  return { positionals, options };
}

const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

/** ASCII 값만 받는 옵션. 한글 같은 내용이 인자로 들어오는 것을 막는다. */
export function getString(options, name, { required = false } = {}) {
  const value = options[name];
  if (value === undefined) {
    if (required) throw new UsageError(`Missing required option --${name}.`);
    return undefined;
  }
  if (value === true) throw new UsageError(`Option --${name} needs a value.`);
  if (!ASCII_PRINTABLE.test(value)) {
    throw new UsageError(
      `Option --${name} must be plain ASCII. Write non-ASCII text to a UTF-8 file and pass the file path instead.`,
    );
  }
  return value;
}

/** 경로 옵션. 경로에는 공백과 한글이 들어갈 수 있으므로 ASCII 검사를 하지 않는다. */
export function getPathOption(options, name, { required = false } = {}) {
  const value = options[name];
  if (value === undefined) {
    if (required) throw new UsageError(`Missing required option --${name}.`);
    return undefined;
  }
  if (value === true || value === '') throw new UsageError(`Option --${name} needs a path.`);
  return value;
}

export function getInt(options, name, { min, max } = {}) {
  const raw = getString(options, name);
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) throw new UsageError(`Option --${name} must be a whole number.`);
  const n = Number(raw);
  if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new UsageError(`Option --${name} must be between ${min} and ${max}.`);
  }
  return n;
}

export function getFlag(options, name) {
  const value = options[name];
  if (value === undefined) return false;
  if (value === true) return true;
  throw new UsageError(`Option --${name} does not take a value.`);
}

export function getChoice(options, name, choices, { fallback } = {}) {
  const value = getString(options, name);
  if (value === undefined) return fallback;
  if (!choices.includes(value)) {
    throw new UsageError(`Option --${name} must be one of: ${choices.join(', ')}.`);
  }
  return value;
}

export function printOk(result) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

/** 오류를 JSON으로 출력하고 종료 코드를 돌려준다. */
export function printError(error) {
  const known = error instanceof WcError;
  const body = {
    ok: false,
    error: { code: known ? error.code : 'INTERNAL', message: error.message },
  };
  if (known && error.details !== undefined) body.error.details = error.details;
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  if (!known && error.stack) process.stderr.write(`${error.stack}\n`);
  return error instanceof UsageError ? 2 : 1;
}

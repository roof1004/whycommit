// 파일 입출력.
// 쓸 때는 항상 UTF-8(BOM 없음), LF로 쓴다.
// 읽을 때는 BOM을 떼고 CRLF를 LF로 바꾼다. 에이전트가 PowerShell 등으로 만든 파일도 받아들이기 위해서다.

import fs from 'node:fs';
import path from 'node:path';
import { WcError } from './cli.mjs';

/**
 * 경로를 "진짜 경로" 하나의 모양으로 맞춘다. 두 경로가 같은 폴더인지 비교하기 전에 쓴다.
 * 같은 폴더도 Windows의 8.3 짧은 이름(C:\Users\RUNNER~1), macOS의 /var 와 /private/var,
 * 심볼릭 링크나 junction 때문에 다르게 보일 수 있고, git은 진짜 경로를 돌려준다.
 * 아직 없는 경로는 있는 부분까지만 맞추고 나머지를 이어 붙인다.
 */
export function canonicalPath(p) {
  const abs = path.resolve(p);
  let existing = abs;
  const rest = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return abs;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  try {
    return path.join(fs.realpathSync.native(existing), ...rest);
  } catch {
    return abs;
  }
}

export function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

/** 바이트를 텍스트로 바꾼다. UTF-8과 UTF-16 LE(BOM 있음)만 받는다. */
export function decodeText(buffer, label = 'input') {
  // Windows PowerShell 5.1의 Out-File 기본 인코딩이 UTF-16 LE라서 따로 받아 준다.
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return normalizeNewlines(buffer.subarray(2).toString('utf16le'));
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new WcError('INVALID_UTF8', `${label} is not valid UTF-8. Save it as UTF-8 and try again.`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return normalizeNewlines(text);
}

export function readText(file, label = file) {
  let buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') throw new WcError('FILE_NOT_FOUND', `File not found: ${file}`);
    throw error;
  }
  return decodeText(buffer, label);
}

export function readJson(file, label = file) {
  const text = readText(file, label);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WcError('INVALID_JSON', `${label} is not valid JSON: ${error.message}`);
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 임시 파일에 쓴 뒤 이름을 바꾼다. 쓰는 도중에 멈춰도 기존 파일이 반쯤 덮이지 않는다.
 * Windows에서는 백신이나 편집기가 파일을 잠깐 잡고 있으면 이름 바꾸기가 실패할 수 있어서 몇 번 다시 시도한다.
 */
export function writeTextAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, normalizeNewlines(text), 'utf8');
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      const retryable = ['EPERM', 'EBUSY', 'EACCES'].includes(error.code);
      if (!retryable || attempt >= 5) {
        fs.rmSync(tmp, { force: true });
        throw error;
      }
      sleepSync(50 * (attempt + 1));
    }
  }
}

export function writeJsonAtomic(file, value) {
  writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

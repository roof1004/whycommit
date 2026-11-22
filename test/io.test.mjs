import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { decodeText, writeTextAtomic } from '../src/lib/io.mjs';
import { createSandbox } from './helpers.mjs';

test('BOM과 CRLF를 떼고 LF로 읽는다 (PowerShell 파이프나 메모장이 만든 파일)', () => {
  const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('한글 첫 줄\r\n둘째 줄\r\n', 'utf8')]);
  assert.equal(decodeText(buffer), '한글 첫 줄\n둘째 줄\n');
});

test('UTF-16 LE(Windows PowerShell 5.1 Out-File 기본값)도 읽는다', () => {
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('해설\r\n두 줄', 'utf16le')]);
  assert.equal(decodeText(buffer), '해설\n두 줄');
});

test('UTF-8이 아닌 파일(예: CP949)은 알아보기 쉬운 오류를 낸다', () => {
  const cp949Han = Buffer.from([0xc7, 0xd1]); // CP949의 "한"
  assert.throws(() => decodeText(cp949Han, 'input'), { code: 'INVALID_UTF8' });
});

test('BOM 없는 UTF-8, LF로 쓴다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const file = path.join(sb.root, '쓰기 테스트', '노트.md');
  writeTextAtomic(file, '첫 줄\r\n둘째 줄\n한글 끝');
  const bytes = fs.readFileSync(file);
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM이 없어야 한다');
  assert.equal(bytes.includes(0x0d), false, 'CR이 없어야 한다');
  assert.equal(bytes.toString('utf8'), '첫 줄\n둘째 줄\n한글 끝');
  assert.deepEqual(
    fs.readdirSync(path.dirname(file)),
    ['노트.md'],
    '임시 파일이 남지 않아야 한다',
  );
});

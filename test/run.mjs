// 테스트 실행기: node test/run.mjs
// "node --test test/" 대신 파일 목록을 직접 넘긴다. 폴더나 glob 인자를 해석하는 방식이
// Node 버전과 셸(PowerShell은 glob을 펼치지 않음)마다 달라서다.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = fs
  .readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => path.join(here, f));

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);

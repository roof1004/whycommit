// 작업 트리 상태 (스테이징된 것 / 안 된 것 / 추적 안 하는 것 / 충돌).
// git status --porcelain=v1 -z 를 읽는다. -z를 쓰면 공백이나 한글이 든 파일 이름도 따옴표 없이 그대로 나온다.

import { git } from './git.mjs';

// 병합 충돌 상태를 나타내는 XY 코드
const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

export function parsePorcelainZ(output) {
  const fields = output.split('\0');
  const result = { staged: [], unstaged: [], untracked: [], conflicts: [] };
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (!field) continue;
    const x = field[0];
    const y = field[1];
    const file = field.slice(3);
    let from = null;
    // 이름 바꾸기·복사는 "새 이름" 다음 칸에 "원래 이름"이 온다.
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      from = fields[i + 1] ?? null;
      i += 1;
    }
    const xy = `${x}${y}`;
    if (xy === '??') {
      result.untracked.push(file);
      continue;
    }
    if (xy === '!!') continue;
    if (CONFLICT_CODES.has(xy)) {
      result.conflicts.push(file);
      continue;
    }
    if (x !== ' ') result.staged.push(from && (x === 'R' || x === 'C') ? { status: x, path: file, from } : { status: x, path: file });
    if (y !== ' ') result.unstaged.push({ status: y, path: file });
  }
  return result;
}

export function workingTreeStatus(top) {
  return parsePorcelainZ(git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: top }).stdout);
}

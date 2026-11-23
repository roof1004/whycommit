// 날짜. 노트에는 사용자 기준 날짜(로컬 시간대)를 YYYY-MM-DD로 적는다.

import { WcError } from './cli.mjs';

const pad = (n) => String(n).padStart(2, '0');

export function today() {
  // 테스트 전용: 날짜를 고정해서 "오래된 것 먼저" 같은 순서를 검증한다.
  const fixed = process.env.WHYCOMMIT_TODAY;
  if (fixed) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fixed)) {
      throw new WcError('BAD_ENV', 'WHYCOMMIT_TODAY must look like YYYY-MM-DD.');
    }
    return fixed;
  }
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowIso() {
  return new Date().toISOString();
}

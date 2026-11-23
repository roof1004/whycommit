// PR 본문에서 whycommit 부분을 찾고 바꾼다 (기획 6.5.3~6.5.5, 계획 2.5).
//
//   (PR 템플릿이나 사용자가 쓴 내용은 그대로)
//   <!-- whycommit:start -->
//   ### 오늘 한 작업
//   ...
//   <!-- whycommit:end -->
//
// HTML 주석이라 GitHub 화면에는 보이지 않는다. 마커 사이만 바꾸고 나머지는 건드리지 않는다.
// GitHub 웹에서 고치면 줄바꿈이 CRLF가 되므로 비교 전에 정리한다.
//
// Finds and replaces the whycommit section in a PR body (spec 6.5.3-6.5.5, plan 2.5).
// In the layout above, the PR template and anything the user wrote stay as they are,
// and the whycommit section sits between the two markers.
//
// The markers are HTML comments, so GitHub does not show them. Only the part between the markers is changed;
// nothing else is touched.
// Editing on the GitHub website turns line breaks into CRLF, so they are normalized before comparing.

import crypto from 'node:crypto';

export const START = '<!-- whycommit:start -->';
export const END = '<!-- whycommit:end -->';

export function normalizeBody(body) {
  return (body ?? '').replace(/\r\n?/g, '\n');
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

/**
 * @returns {{state: 'absent'|'present'|'broken'|'duplicated', content?: string, start?: number, end?: number}}
 */
export function findSection(body) {
  const b = normalizeBody(body);
  const starts = count(b, START);
  const ends = count(b, END);
  if (starts === 0 && ends === 0) return { state: 'absent' };
  if (starts > 1 || ends > 1) return { state: 'duplicated' };
  if (starts !== 1 || ends !== 1) return { state: 'broken' };
  const s = b.indexOf(START);
  const e = b.indexOf(END);
  if (e < s) return { state: 'broken' };
  return { state: 'present', content: b.slice(s + START.length, e).replace(/^\n+|\n+$/g, ''), start: s, end: e + END.length };
}

export function wrapSection(content) {
  return `${START}\n${normalizeBody(content).trim()}\n${END}`;
}

/** 마커 사이만 바꾼다. / Replaces only what is between the markers. */
export function replaceSection(body, content) {
  const found = findSection(body);
  if (found.state !== 'present') throw new Error(`cannot replace: section is ${found.state}`);
  const b = normalizeBody(body);
  return `${b.slice(0, found.start)}${wrapSection(content)}${b.slice(found.end)}`;
}

/** 기존 본문(PR 템플릿 등) 아래에 붙인다. / Appends the section below the existing body (such as a PR template). */
export function appendSection(body, content) {
  const b = normalizeBody(body).replace(/\s+$/, '');
  return b ? `${b}\n\n${wrapSection(content)}\n` : `${wrapSection(content)}\n`;
}

/** 줄 끝 공백, 줄바꿈 종류, 앞뒤 빈 줄 차이는 같은 내용으로 본다. / Differences in trailing spaces, line break style and leading or trailing blank lines count as the same content. */
export function canonical(text) {
  return normalizeBody(text)
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sameContent(a, b) {
  return canonical(a) === canonical(b);
}

export function bodyHash(body) {
  return crypto.createHash('sha256').update(normalizeBody(body)).digest('hex').slice(0, 16);
}

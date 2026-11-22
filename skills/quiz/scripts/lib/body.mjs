// 기록 초안과 본문 (기획 6.3, 6.4).
//
// 본문의 네 항목 이름은 그대로 쓴다: 오늘 한 작업, 남은 작업, 이해한 내용, 이해하지 못한 내용.
// "이해한 내용 / 이해하지 못한 내용"은 초안 파일에서 받지 않고 학습 노트에서만 가져온다 (원칙 1).

import { WcError } from './cli.mjs';
import { normalizeNewlines } from './io.mjs';

export const HEADINGS = {
  done: '오늘 한 작업',
  todo: '남은 작업',
  understood: '이해한 내용',
  notUnderstood: '이해하지 못한 내용',
};

const SOURCES = {
  plan: '기획 문서',
  conversation: '대화',
  todo: 'TODO 주석',
  issue: '이슈',
  quiz: '퀴즈에서 확인', // 확인 질문으로 사용자와 함께 확인한 문제
  user: null, // 사용자가 직접 쓴 항목에는 출처를 붙이지 않는다
};

const invalid = (message) => new WcError('INVALID_INPUT', message);
const oneLine = (s) => normalizeNewlines(s).replace(/\s+/g, ' ').trim();

/**
 * "직접 쓸게"로 받은 글을 항목으로 나눈다 (기획 6.3.5).
 * 줄바꿈과 쉼표로 나누되 "1,000"처럼 숫자 사이 쉼표는 나누지 않는다.
 * 문장은 고치지 않고, 앞에 붙은 목록 기호("- ", "1. ")만 뗀다.
 */
export function splitItems(text) {
  return normalizeNewlines(text)
    .split('\n')
    .flatMap((line) => line.split(/,(?!\d)|(?<!\d),|，|、/))
    .map((item) => item.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').trim())
    .filter((item) => item !== '');
}

function parseDone(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid('done must be an array of strings.');
  return value.map((v, i) => {
    if (typeof v !== 'string' || !oneLine(v)) throw invalid(`done[${i}] must be a non-empty string.`);
    return oneLine(v);
  });
}

function parseTodo(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid('todo must be an array.');
  return value.map((v, i) => {
    const item = typeof v === 'string' ? { text: v, source: 'user' } : v;
    if (!item || typeof item.text !== 'string' || !oneLine(item.text)) throw invalid(`todo[${i}].text must be a non-empty string.`);
    if (!Object.hasOwn(SOURCES, item.source)) {
      throw invalid(`todo[${i}].source must be one of: ${Object.keys(SOURCES).join(', ')}.`);
    }
    return { text: oneLine(item.text), source: item.source, ref: item.ref ? oneLine(String(item.ref)) : null };
  });
}

function todoLine(item) {
  const label = SOURCES[item.source];
  if (!label) return item.text;
  if (!item.ref) return `${item.text} (${label})`;
  return item.source === 'issue' ? `${item.text} (${label} ${item.ref})` : `${item.text} (${label}: ${item.ref})`;
}

/**
 * 초안 파일을 검증한다.
 * { "done": [...], "todo": [{text, source, ref}], "learning": {"include": bool, "ids": [...] | "branch": "..."} }
 */
export function parseDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw invalid('The draft must be a JSON object.');
  for (const key of ['understood', 'notUnderstood', 'understoodTopics']) {
    if (key in draft) {
      throw invalid(`"${key}" is not accepted in a draft. Learning topics come only from the notes (use learning.ids or learning.branch).`);
    }
  }
  const learning = draft.learning ?? {};
  if (typeof learning !== 'object' || Array.isArray(learning)) throw invalid('learning must be an object.');
  if (learning.ids !== undefined && (!Array.isArray(learning.ids) || learning.ids.some((x) => typeof x !== 'string'))) {
    throw invalid('learning.ids must be an array of note ids.');
  }
  return {
    done: parseDone(draft.done),
    todo: parseTodo(draft.todo),
    learning: {
      include: typeof learning.include === 'boolean' ? learning.include : null,
      ids: learning.ids ?? null,
      branch: typeof learning.branch === 'string' ? learning.branch : null,
    },
  };
}

/** 노트에서 이 작업과 관련된 주제를 고른다. ids가 있으면 그것만, 없으면 branch가 같은 항목. */
export function learningTopics(entries, { ids, branch }) {
  let picked = [];
  if (ids) {
    const wanted = new Set(ids);
    picked = entries.filter((e) => wanted.has(e.id));
    const missing = ids.filter((id) => !entries.some((e) => e.id === id));
    if (missing.length > 0) throw invalid(`Unknown note id(s): ${missing.join(', ')}`);
  } else if (branch) {
    picked = entries.filter((e) => e.branch === branch);
  }
  const unique = (list) => [...new Set(list)];
  return {
    understood: unique(picked.filter((e) => e.status === 'understood').map((e) => e.topic)),
    notUnderstood: unique(picked.filter((e) => e.status === 'not_understood').map((e) => e.topic)),
  };
}

/**
 * 본문을 만든다.
 * target "pr": 마크다운 제목(###) / target "commit": 제목 줄만 (커밋 메시지에서 "#" 줄은 주석으로 지워질 수 있어서)
 */
export function renderBody({ done, todo }, topics, target) {
  const sections = [];
  if (done.length > 0) sections.push([HEADINGS.done, done]);
  if (todo.length > 0) sections.push([HEADINGS.todo, todo.map(todoLine)]);
  if (topics) {
    if (topics.understood.length > 0) sections.push([HEADINGS.understood, topics.understood]);
    if (topics.notUnderstood.length > 0) sections.push([HEADINGS.notUnderstood, topics.notUnderstood]);
  }
  const text = sections
    .map(([heading, items]) => `${target === 'pr' ? `### ${heading}` : heading}\n${items.map((i) => `- ${i}`).join('\n')}`)
    .join('\n\n');
  return { text, sections: sections.map(([heading, items]) => ({ heading, count: items.length })) };
}

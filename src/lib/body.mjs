// 기록 초안과 본문 (기획 6.3, 6.4).
//
// 본문의 네 항목 이름은 언어마다 고정이다 (i18n.mjs): 한국어는 오늘 한 작업, 남은 작업, 이해한 내용,
// 이해하지 못한 내용이고, 영어는 Today's work, Remaining work, What I understood, What I don't understand yet.
// "이해한 내용 / 이해하지 못한 내용"은 초안 파일에서 받지 않고 학습 노트에서만 가져온다 (원칙 1).
//
// The record draft and the body text (spec 6.3, 6.4).
//
// The four section names are fixed per language (i18n.mjs): in Korean 오늘 한 작업, 남은 작업, 이해한 내용,
// 이해하지 못한 내용; in English Today's work, Remaining work, What I understood, What I don't understand yet.
// "Understood / not understood" never come from the draft file, only from the learning notes (principle 1).

import { WcError } from './cli.mjs';
import { BODY_TEXT } from './i18n.mjs';
import { normalizeNewlines } from './io.mjs';

// 남은 작업의 출처 종류. user(사용자가 직접 쓴 항목)에는 출처를 붙이지 않는다.
// Kinds of sources for remaining work. Items the user wrote themselves (user) get no source label.
const SOURCE_KINDS = Object.keys(BODY_TEXT.ko.sources);

const invalid = (message) => new WcError('INVALID_INPUT', message);
const oneLine = (s) => normalizeNewlines(s).replace(/\s+/g, ' ').trim();

/**
 * "직접 쓸게"로 받은 글을 항목으로 나눈다 (기획 6.3.5).
 * 줄바꿈과 쉼표로 나누되 "1,000"처럼 숫자 사이 쉼표는 나누지 않는다.
 * 문장은 고치지 않고, 앞에 붙은 목록 기호("- ", "1. ")만 뗀다.
 *
 * Splits text the user gave with "직접 쓸게" ("I'll write it myself") into items (spec 6.3.5).
 * Splits on line breaks and commas, but not on a comma between digits, as in "1,000".
 * The wording is left as is; only a leading list marker ("- ", "1. ") is removed.
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
    if (!SOURCE_KINDS.includes(item.source)) {
      throw invalid(`todo[${i}].source must be one of: ${SOURCE_KINDS.join(', ')}.`);
    }
    return { text: oneLine(item.text), source: item.source, ref: item.ref ? oneLine(String(item.ref)) : null };
  });
}

function todoLine(item, lang) {
  const label = BODY_TEXT[lang].sources[item.source];
  if (!label) return item.text;
  if (!item.ref) return `${item.text} (${label})`;
  return item.source === 'issue' ? `${item.text} (${label} ${item.ref})` : `${item.text} (${label}: ${item.ref})`;
}

/**
 * 초안 파일을 검증한다.
 * { "done": [...], "todo": [{text, source, ref}], "learning": {"include": bool, "ids": [...] | "branch": "..."} }
 *
 * Validates the draft file.
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

/** 노트에서 이 작업과 관련된 주제를 고른다. ids가 있으면 그것만, 없으면 branch가 같은 항목. / Picks the note topics for this work: only the given ids if any, otherwise the entries on the same branch. */
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
 *
 * Builds the body text.
 * target "pr": Markdown headings (###) / target "commit": plain heading lines only (in a commit message,
 * lines starting with "#" can be stripped as comments)
 */
export function renderBody({ done, todo }, topics, target, lang = 'ko') {
  const headings = BODY_TEXT[lang].headings;
  const sections = [];
  if (done.length > 0) sections.push([headings.done, done]);
  if (todo.length > 0) sections.push([headings.todo, todo.map((item) => todoLine(item, lang))]);
  if (topics) {
    if (topics.understood.length > 0) sections.push([headings.understood, topics.understood]);
    if (topics.notUnderstood.length > 0) sections.push([headings.notUnderstood, topics.notUnderstood]);
  }
  const text = sections
    .map(([heading, items]) => `${target === 'pr' ? `### ${heading}` : heading}\n${items.map((i) => `- ${i}`).join('\n')}`)
    .join('\n\n');
  return { text, sections: sections.map(([heading, items]) => ({ heading, count: items.length })) };
}

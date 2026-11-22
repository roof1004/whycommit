// 학습 노트 (projects/<id>/notes.json + notes.md).
//
// notes.json이 원본이고 이 모듈만 쓴다. notes.md는 저장할 때마다 다시 만드는 읽기용 파일이다.
//
// 원칙 1: "이해한 내용 / 이해하지 못한 내용"은 사용자의 답에서만 나온다.
// 그래서 상태(status)는 채점 결과(result)에서 정해지고, 둘이 어긋나면 저장을 거부한다.
//   correct, shallow     → understood
//   wrong, dont_know     → not_understood
//   partial              → 에이전트가 맞은 부분과 빠진 부분을 두 항목으로 나누고 각각 status를 적는다

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WcError } from './cli.mjs';
import { today } from './dates.mjs';
import { normalizeNewlines, readJson, writeJsonAtomic, writeTextAtomic } from './io.mjs';
import { assertDataHomeSafe, projectDir, projectsRoot } from './paths.mjs';
import { renderNotesMarkdown } from './render-notes.mjs';

export const RESULTS = ['correct', 'shallow', 'partial', 'wrong', 'dont_know'];
export const STATUSES = ['understood', 'not_understood'];
export const QUESTION_TYPES = ['why', 'alternative', 'what_if'];

const RESULT_TO_STATUS = {
  correct: 'understood',
  shallow: 'understood',
  wrong: 'not_understood',
  dont_know: 'not_understood',
  partial: null,
};

const invalid = (message) => new WcError('INVALID_INPUT', message);

export function notesFiles(projectId) {
  const dir = projectDir(projectId);
  return { json: path.join(dir, 'notes.json'), md: path.join(dir, 'notes.md') };
}

export function hasNotes(projectId) {
  return fs.existsSync(notesFiles(projectId).json);
}

export function loadNotes(projectId) {
  const { json } = notesFiles(projectId);
  if (!fs.existsSync(json)) return { version: 1, project: projectId, entries: [] };
  const raw = readJson(json, 'notes.json');
  if (!raw || !Array.isArray(raw.entries)) {
    throw new WcError('NOTES_INVALID', `notes.json is damaged: ${json}`);
  }
  return { ...raw, version: 1, project: projectId };
}

export function saveNotes(projectId, notes) {
  assertDataHomeSafe();
  const files = notesFiles(projectId);
  writeJsonAtomic(files.json, notes);
  writeTextAtomic(files.md, renderNotesMarkdown(notes));
  return files;
}

/** notes.json이 있는 모든 프로젝트 ID (review "전체"용). */
export function listProjects() {
  const found = [];
  const walk = (dir, segments) => {
    if (segments.length > 8) return;
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (segments.length > 0 && items.some((d) => d.isFile() && d.name === 'notes.json')) {
      found.push(segments.join('/'));
    }
    for (const d of items) if (d.isDirectory()) walk(path.join(dir, d.name), [...segments, d.name]);
  };
  walk(projectsRoot(), []);
  return found.sort();
}

export function countStatuses(entries) {
  let understood = 0;
  let notUnderstood = 0;
  for (const e of entries) {
    if (e.status === 'understood') understood += 1;
    else notUnderstood += 1;
  }
  return { understood, notUnderstood, total: entries.length };
}

// ---- 입력 검증 ----

function text(value, field, { required = true, max = 20000, singleLine = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalid(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw invalid(`${field} must be a string.`);
  let s = normalizeNewlines(value);
  s = singleLine ? s.replace(/\s+/g, ' ').trim() : s.trim();
  if (required && s === '') throw invalid(`${field} must not be empty.`);
  if (s.length > max) throw invalid(`${field} is too long (max ${max} characters).`);
  return s;
}

function parseDispute(value, where) {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'object' ||
    !RESULTS.includes(value.originalResult) ||
    !['changed', 'kept'].includes(value.outcome)
  ) {
    throw invalid(`${where}.dispute must be {"originalResult": <result>, "outcome": "changed" | "kept"}.`);
  }
  return { originalResult: value.originalResult, outcome: value.outcome };
}

function parseAttempt(value, where, source) {
  if (!value || typeof value !== 'object') throw invalid(`${where} is required.`);
  if (!RESULTS.includes(value.result)) {
    throw invalid(`${where}.result must be one of: ${RESULTS.join(', ')}.`);
  }
  return {
    date: today(),
    source,
    question: text(value.question, `${where}.question`),
    // "모르겠다"는 답 요약이 비어 있어도 된다.
    answerSummary: text(value.answerSummary, `${where}.answerSummary`, { required: value.result !== 'dont_know' }),
    result: value.result,
    explanation: text(value.explanation, `${where}.explanation`, { required: false }) || null,
    dispute: parseDispute(value.dispute, where),
  };
}

function resolveStatus(given, result, where) {
  if (given !== undefined && given !== null && !STATUSES.includes(given)) {
    throw invalid(`${where}.status must be one of: ${STATUSES.join(', ')}.`);
  }
  const derived = RESULT_TO_STATUS[result];
  if (derived === null) {
    if (!given) {
      throw invalid(
        `${where}.status is required when the result is "partial". Split the answer into an understood entry and a not_understood entry.`,
      );
    }
    return given;
  }
  if (given && given !== derived) {
    throw invalid(`${where}.status "${given}" contradicts result "${result}" (expected "${derived}").`);
  }
  return derived;
}

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function parseFiles(value, where) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`${where}.files must be an array.`);
  return value.map((f, i) => {
    if (typeof f === 'string' && f.trim()) return { path: toPosix(f.trim()), lines: null };
    if (f && typeof f === 'object' && typeof f.path === 'string' && f.path.trim()) {
      return { path: toPosix(f.path.trim()), lines: f.lines == null ? null : String(f.lines) };
    }
    throw invalid(`${where}.files[${i}] must be a path or {"path": ..., "lines": ...}.`);
  });
}

function parseCommits(value, where) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`${where}.commits must be an array.`);
  return value.map((c, i) => {
    if (typeof c !== 'string' || !/^[0-9a-f]{4,64}$/i.test(c)) {
      throw invalid(`${where}.commits[${i}] must be a commit SHA.`);
    }
    return c.toLowerCase();
  });
}

function newId(taken) {
  const date = today().replace(/-/g, '');
  for (;;) {
    const id = `${date}-${crypto.randomBytes(3).toString('hex')}`;
    if (!taken.has(id)) return id;
  }
}

// ---- 기록 ----

/**
 * 퀴즈 결과를 추가한다. 입력 형식은 notes add --help 와 스킬 문서 참고.
 * 모든 항목을 먼저 검증하고, 하나라도 잘못되면 아무것도 저장하지 않는다.
 */
export function addEntries(projectId, input, { defaultBranch = null } = {}) {
  if (!input || !Array.isArray(input.entries) || input.entries.length === 0) {
    throw invalid('The input must be {"entries": [...]} with at least one entry.');
  }
  const notes = loadNotes(projectId);
  const taken = new Set(notes.entries.map((e) => e.id));
  const refToId = new Map();

  const drafts = input.entries.map((raw, i) => {
    const where = `entries[${i}]`;
    if (!raw || typeof raw !== 'object') throw invalid(`${where} must be an object.`);
    if (raw.ref !== undefined && raw.ref !== null) {
      if (typeof raw.ref !== 'string' || raw.ref === '') throw invalid(`${where}.ref must be a non-empty string.`);
      if (refToId.has(raw.ref)) throw invalid(`${where}.ref "${raw.ref}" is used twice.`);
    }
    const id = newId(taken);
    taken.add(id);
    if (raw.ref) refToId.set(raw.ref, id);
    return { raw, id, where };
  });

  const entries = drafts.map(({ raw, id, where }) => {
    let parentId = null;
    if (raw.parentRef !== undefined && raw.parentRef !== null) {
      parentId = refToId.get(raw.parentRef) ?? null;
      if (!parentId || parentId === id) {
        throw invalid(`${where}.parentRef "${raw.parentRef}" does not match another entry's ref in this file.`);
      }
    } else if (raw.parentId !== undefined && raw.parentId !== null) {
      if (!notes.entries.some((e) => e.id === raw.parentId)) {
        throw invalid(`${where}.parentId "${raw.parentId}" is not in this project's notes.`);
      }
      parentId = raw.parentId;
    }
    if (raw.questionType !== undefined && raw.questionType !== null && !QUESTION_TYPES.includes(raw.questionType)) {
      throw invalid(`${where}.questionType must be one of: ${QUESTION_TYPES.join(', ')}.`);
    }
    const source = raw.source === 'review' ? 'review' : 'quiz';
    const attempt = parseAttempt(raw.attempt, `${where}.attempt`, source);
    const status = resolveStatus(raw.status, attempt.result, where);
    if (status === 'not_understood' && !attempt.explanation) {
      throw invalid(`${where}.attempt.explanation is required for a not_understood entry (explain it right away).`);
    }
    return {
      id,
      createdAt: today(),
      topic: text(raw.topic, `${where}.topic`, { singleLine: true, max: 200 }),
      status,
      wrongCount: status === 'not_understood' ? 1 : 0,
      resolvedAt: null,
      kind: parentId ? 'followup' : 'question',
      parentId,
      questionType: raw.questionType ?? null,
      branch: typeof raw.branch === 'string' && raw.branch.trim() ? raw.branch.trim() : defaultBranch,
      files: parseFiles(raw.files, where),
      commits: parseCommits(raw.commits, where),
      attempts: [attempt],
    };
  });

  notes.entries.push(...entries);
  const files = saveNotes(projectId, notes);
  return {
    added: entries.length,
    ids: drafts.map((d) => ({ ref: d.raw.ref ?? null, id: d.id })),
    stats: countStatuses(notes.entries),
    notesMd: files.md,
  };
}

/**
 * 복습 결과를 기록한다 (기획 7.5).
 * 맞히면 이해한 내용으로 옮기고 해결한 날짜를 적는다.
 * 못 맞히면 그대로 두고 횟수를 올린다. 이때는 다시 한 해설이 꼭 있어야 한다.
 */
export function recordReview(projectId, input) {
  if (!input || typeof input.id !== 'string') throw invalid('The input must include "id".');
  const notes = loadNotes(projectId);
  const entry = notes.entries.find((e) => e.id === input.id);
  if (!entry) throw new WcError('NOTE_NOT_FOUND', `No note with id "${input.id}" in project ${projectId}.`);
  if (entry.status !== 'not_understood') {
    throw new WcError('ALREADY_UNDERSTOOD', `Note "${input.id}" is already understood.`);
  }
  const attempt = parseAttempt(input.attempt, 'attempt', 'review');
  const solved = attempt.result === 'correct' || attempt.result === 'shallow';
  if (solved) {
    entry.status = 'understood';
    entry.resolvedAt = today();
  } else {
    if (!attempt.explanation) {
      throw invalid('attempt.explanation is required when the topic is still not understood (explain it again, differently).');
    }
    entry.wrongCount += 1;
  }
  entry.attempts.push(attempt);
  const files = saveNotes(projectId, notes);
  return {
    id: entry.id,
    status: entry.status,
    wrongCount: entry.wrongCount,
    resolvedAt: entry.resolvedAt,
    stats: countStatuses(notes.entries),
    notesMd: files.md,
  };
}

/**
 * 이의 제기로 판정을 바꾼다 (기획 6.2.8). 원칙 1에 따라 노트의 상태를 바꾸는 유일한 방법이다.
 * - 이미 저장한 항목의 마지막 시도(지금 문제)만 바꿀 수 있다.
 * - 문제당 한 번: 그 시도에 이미 이의 제기 기록이 있으면 거부한다.
 * - 복습에서 바뀐 경우에는 그 복습이 올리거나 내린 횟수와 해결 날짜도 함께 되돌린다.
 *
 * input: {"outcome": "changed" | "kept", "updates": [{"id", "result", "status"?, "explanation"?}]}
 * 일부만 맞음으로 둘로 나눈 문제는 두 항목을 함께 넘긴다.
 */
export function recordDispute(projectId, input) {
  if (!input || !['changed', 'kept'].includes(input.outcome)) throw invalid('outcome must be "changed" or "kept".');
  if (!Array.isArray(input.updates) || input.updates.length === 0) {
    throw invalid('The input must include "updates": [{"id": ..., "result": ...}].');
  }
  const notes = loadNotes(projectId);
  const targets = input.updates.map((u, i) => {
    const entry = notes.entries.find((e) => e.id === u?.id);
    if (!entry) throw new WcError('NOTE_NOT_FOUND', `No note with id "${u?.id}" in project ${projectId}.`);
    const attempt = entry.attempts[entry.attempts.length - 1];
    if (attempt.dispute) {
      throw new WcError('ALREADY_DISPUTED', `Note "${entry.id}" was already disputed for this question. Only one dispute per question.`);
    }
    return { update: u, entry, attempt, where: `updates[${i}]` };
  });

  for (const { update, entry, attempt, where } of targets) {
    const originalResult = attempt.result;
    if (input.outcome === 'kept') {
      attempt.dispute = { originalResult, outcome: 'kept' };
      continue;
    }
    if (!RESULTS.includes(update.result)) throw invalid(`${where}.result must be one of: ${RESULTS.join(', ')}.`);
    const status = resolveStatus(update.status, update.result, where);
    const explanation =
      update.explanation !== undefined ? text(update.explanation, `${where}.explanation`, { required: false }) || null : attempt.explanation;
    if (status === 'not_understood' && !explanation) {
      throw invalid(`${where}.explanation is required when the entry ends up not_understood.`);
    }
    attempt.result = update.result;
    attempt.explanation = explanation;
    attempt.dispute = { originalResult, outcome: 'changed' };
    if (entry.status === status) continue;
    if (attempt.source === 'review') {
      // 그 복습이 한 일을 되돌린다.
      if (status === 'understood') {
        entry.wrongCount = Math.max(0, entry.wrongCount - 1);
        entry.resolvedAt = today();
      } else {
        entry.wrongCount += 1;
        entry.resolvedAt = null;
      }
    } else {
      entry.wrongCount = status === 'not_understood' ? 1 : 0;
      entry.resolvedAt = null;
    }
    entry.status = status;
  }

  const files = saveNotes(projectId, notes);
  return {
    outcome: input.outcome,
    updated: targets.map(({ entry }) => ({ id: entry.id, status: entry.status, wrongCount: entry.wrongCount, resolvedAt: entry.resolvedAt })),
    stats: countStatuses(notes.entries),
    notesMd: files.md,
  };
}

// ---- 복습 대상 고르기 ----

const lastSeen = (e) => e.attempts[e.attempts.length - 1]?.date ?? e.createdAt;

/** 여러 번 놓친 것 먼저, 같으면 가장 오래 안 본 것 먼저 (기획 7.2). */
export function reviewOrder(a, b) {
  return (
    b.wrongCount - a.wrongCount ||
    lastSeen(a).localeCompare(lastSeen(b)) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function pickForReview(projectIds, limit) {
  const pool = [];
  for (const project of projectIds) {
    for (const entry of loadNotes(project).entries) {
      if (entry.status === 'not_understood') pool.push({ project, entry });
    }
  }
  pool.sort((x, y) => reviewOrder(x.entry, y.entry));
  return { total: pool.length, picked: pool.slice(0, limit) };
}

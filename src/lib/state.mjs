// 프로젝트별 상태 (projects/<id>/state.json).
// - branches.<브랜치>.lastQuizzed: 마지막으로 퀴즈를 본 커밋
// - planDoc: 기획 문서 위치 ({ path: "docs/plan.md" }, 없다고 답했으면 { path: null }, 모르면 null)
// - prs.<브랜치>: PR 번호와 whycommit 부분을 마지막으로 쓴 내용 (4단계에서 사용)

import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic } from './io.mjs';
import { nowIso } from './dates.mjs';
import { assertDataHomeSafe, projectDir } from './paths.mjs';

export function stateFile(projectId) {
  return path.join(projectDir(projectId), 'state.json');
}

function emptyState() {
  return { version: 1, branches: {}, planDoc: null, prs: {} };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function loadState(projectId) {
  const file = stateFile(projectId);
  if (!fs.existsSync(file)) return emptyState();
  const raw = readJson(file, 'state.json');
  const state = emptyState();
  if (isObject(raw)) {
    if (isObject(raw.branches)) state.branches = { ...raw.branches };
    if (isObject(raw.prs)) state.prs = { ...raw.prs };
    if (raw.planDoc === null || isObject(raw.planDoc)) state.planDoc = raw.planDoc;
  }
  return state;
}

export function saveState(projectId, state) {
  assertDataHomeSafe();
  writeJsonAtomic(stateFile(projectId), state);
}

export function getLastQuizzed(state, branch) {
  return state.branches[branch]?.lastQuizzed ?? null;
}

export function setLastQuizzed(state, branch, sha) {
  state.branches[branch] = { ...(state.branches[branch] ?? {}), lastQuizzed: sha, updatedAt: nowIso() };
}

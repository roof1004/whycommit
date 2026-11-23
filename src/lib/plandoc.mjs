// 기획 문서 찾기 (기획 6.3.4).
// 흔한 이름을 자동으로 찾는다. 못 찾으면 에이전트가 한 번 묻고 state set-plan-doc으로 기억한다.
//
// Finding the planning document (spec 6.3.4).
// Common names are found automatically. If none is found, the agent asks once and remembers it with state set-plan-doc.

import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';

const PLAN_WORDS = /(plan|planning|spec|specs|prd|requirements?|roadmap|todo|design|proposal|기획|요구사항|명세|설계|계획)/i;
const MAX_CANDIDATES = 15;

/** 추적 중이거나 무시되지 않은 파일 목록 / Files that are tracked or not ignored */
function listRepoFiles(top) {
  const out = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: top }).stdout;
  return [...new Set(out.split('\0').filter(Boolean))];
}

function rank(file) {
  const base = path.posix.basename(file);
  const ext = path.posix.extname(base).toLowerCase();
  const isText = ['.md', '.markdown', '.txt', '.rst', '.adoc', ''].includes(ext);
  if (!isText) return null;
  const stem = base.slice(0, base.length - ext.length);
  if (/^readme$/i.test(stem)) return file.includes('/') ? null : 3; // 최상위 README만 / Only the top-level README
  if (PLAN_WORDS.test(stem)) return 1;
  if (/^docs?\//i.test(file) && ext !== '') return 2;
  return null;
}

/**
 * @returns {{remembered: {path: string|null}|null, rememberedExists: boolean, candidates: string[]}}
 */
export function findPlanDocs(top, planDoc) {
  const remembered = planDoc ?? null;
  const rememberedExists = Boolean(remembered?.path && fs.existsSync(path.join(top, ...remembered.path.split('/'))));
  const candidates = listRepoFiles(top)
    .map((f) => ({ f, r: rank(f) }))
    .filter((x) => x.r !== null)
    .sort((a, b) => a.r - b.r || a.f.split('/').length - b.f.split('/').length || a.f.localeCompare(b.f))
    .map((x) => x.f)
    .filter((f) => f !== remembered?.path)
    .slice(0, MAX_CANDIDATES);
  return { remembered, rememberedExists, candidates };
}

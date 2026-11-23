// PR 모드 마무리 (기획 6.5).
//
// 안전장치
// - 이미 PR이 있으면 본문 전체가 아니라 whycommit 부분만 바꾼다.
// - 사용자가 GitHub에서 whycommit 부분을 고쳤으면(edited) 또는 우리가 쓴 기록이 없으면(unknown)
//   --confirm overwrite 없이는 바꾸지 않는다. 마커를 지웠으면(removed) --confirm append 없이는 다시 넣지 않는다.
// - 미리보기 때 본 본문과 지금 본문이 다르면(BODY_CHANGED) 바꾸지 않는다. 미리보기를 다시 보여 줘야 한다.

import fs from 'node:fs';
import path from 'node:path';
import { WcError } from './cli.mjs';
import { nowIso } from './dates.mjs';
import { createPr, getPr, listPrsForBranch, updatePrBody } from './gh.mjs';
import {
  appendSection,
  bodyHash,
  canonical,
  findSection,
  normalizeBody,
  replaceSection,
  sameContent,
  wrapSection,
} from './prsection.mjs';
import { loadState, saveState } from './state.mjs';

const CONFIRM_NEEDED = { edited: 'overwrite', unknown: 'overwrite', removed: 'append' };

/**
 * GitHub이 인식하는 PR 템플릿 위치. 기본 템플릿(파일 하나)을 먼저, 폴더 안의 여러 템플릿을 뒤에 둔다.
 * 폴더 목록 순서는 운영체제마다 달라서 직접 정렬한다.
 */
export function findPrTemplates(top) {
  const single = [];
  const multiple = [];
  for (const dir of ['.github', '', 'docs']) {
    let items;
    try {
      items = fs.readdirSync(path.join(top, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    const rel = (...parts) => [dir, ...parts].filter(Boolean).join('/');
    for (const d of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
      if (d.isFile() && /^pull_request_template(\.md|\.txt)?$/i.test(d.name)) single.push(rel(d.name));
      if (d.isDirectory() && /^pull_request_template$/i.test(d.name)) {
        for (const f of fs.readdirSync(path.join(top, dir, d.name)).sort()) {
          if (/\.(md|txt)$/i.test(f)) multiple.push(rel(d.name, f));
        }
      }
    }
  }
  return [...single, ...multiple];
}

/** 이 브랜치의 열린 PR과 whycommit 부분의 상태 */
export function prStatus(top, projectId, branch) {
  const prs = listPrsForBranch(top, branch);
  const open = prs.find((p) => p.state === 'OPEN') ?? null;
  const otherPrs = prs.filter((p) => p.state !== 'OPEN').map((p) => ({ number: p.number, state: p.state, url: p.url }));
  if (!open) {
    return { exists: false, pr: null, otherPrs, sectionState: null, needsConfirm: null, currentSection: null, body: null, bodyHash: null };
  }
  const full = getPr(top, open.number);
  const body = normalizeBody(full.body);
  const record = loadState(projectId).prs[branch];
  const ours = record && record.number === open.number ? record : null;
  const found = findSection(body);
  let sectionState;
  if (found.state === 'present') {
    if (!ours?.lastSection) sectionState = 'unknown';
    else sectionState = sameContent(found.content, ours.lastSection) ? 'unchanged' : 'edited';
  } else if (found.state === 'absent') {
    sectionState = ours ? 'removed' : 'absent';
  } else {
    sectionState = found.state; // broken | duplicated
  }
  return {
    exists: true,
    pr: { number: open.number, url: full.html_url ?? open.url },
    otherPrs,
    sectionState,
    needsConfirm: CONFIRM_NEEDED[sectionState] ?? null,
    currentSection: found.state === 'present' ? found.content : null,
    body,
    bodyHash: bodyHash(body),
  };
}

/** 새 본문을 계산한다 (아무것도 쓰지 않는다). */
export function computeNewBody(status, sectionText, templateText) {
  if (!status.exists) {
    return templateText ? appendSection(templateText, sectionText) : `${wrapSection(sectionText)}\n`;
  }
  switch (status.sectionState) {
    case 'unchanged':
    case 'edited':
    case 'unknown':
      return replaceSection(status.body, sectionText);
    case 'absent':
    case 'removed':
      return appendSection(status.body, sectionText);
    default:
      throw new WcError(
        'SECTION_BROKEN',
        'The whycommit markers in the PR body are broken or duplicated. Ask the user to fix them on GitHub ' +
          '(exactly one start and one end marker), then run again.',
        { sectionState: status.sectionState },
      );
  }
}

function remember(projectId, branch, number, sectionText) {
  const state = loadState(projectId);
  state.prs[branch] = { number, lastSection: canonical(sectionText), updatedAt: nowIso() };
  saveState(projectId, state);
}

export function createPrWithSection(top, projectId, { branch, base, title, sectionText, templateText }) {
  const status = prStatus(top, projectId, branch);
  if (status.exists) {
    throw new WcError('PR_EXISTS', `PR #${status.pr.number} is already open for this branch. Use "pr update" instead.`, status.pr);
  }
  const body = computeNewBody(status, sectionText, templateText);
  const created = createPr(top, { title, body, head: branch, base });
  remember(projectId, branch, created.number, sectionText);
  return { number: created.number, url: created.html_url };
}

export function updatePrSection(top, projectId, { branch, sectionText, expectHash, confirm }) {
  const status = prStatus(top, projectId, branch);
  if (!status.exists) throw new WcError('NO_OPEN_PR', 'There is no open PR for this branch.');
  if (status.bodyHash !== expectHash) {
    throw new WcError(
      'BODY_CHANGED',
      'The PR body changed after the preview. Run "pr preview" again and show the user the new preview.',
      { bodyHash: status.bodyHash },
    );
  }
  if (status.needsConfirm && confirm !== status.needsConfirm) {
    throw new WcError(
      'NEEDS_CONFIRMATION',
      `The whycommit section is "${status.sectionState}". Show the user what will change and, only if they agree, run again with --confirm ${status.needsConfirm}.`,
      { sectionState: status.sectionState, needsConfirm: status.needsConfirm },
    );
  }
  const body = computeNewBody(status, sectionText, null);
  updatePrBody(top, status.pr.number, body);
  remember(projectId, branch, status.pr.number, sectionText);
  return { number: status.pr.number, url: status.pr.url, previousSectionState: status.sectionState };
}

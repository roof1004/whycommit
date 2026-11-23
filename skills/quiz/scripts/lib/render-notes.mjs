// notes.json → notes.md (사람이 열어 읽는 파일).
// 원칙 6에 따라 점수나 정답률은 보여주지 않고, 평가처럼 들리지 않는 말을 쓴다.
// 문구는 노트에 기억된 언어(notes.lang, 한국어 또는 영어)를 따르고, 파일 전체를 한 언어로 만든다.
//
// notes.json → notes.md (the file people open and read).
// Following principle 6, it shows no scores or accuracy rates and uses wording that does not sound like grading.
// The text follows the language remembered in the notes (notes.lang, Korean or English), and the whole file
// is written in that one language.

import { NOTES_TEXT } from './i18n.mjs';

// 답이나 해설 안에 "#"으로 시작하는 줄이 있어도 노트 구조가 깨지지 않게 인용문으로 감싼다.
// Wraps text in a block quote so that a line starting with "#" in an answer or explanation does not break
// the note structure.
const quote = (s) =>
  s
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');

const lastSeen = (e) => e.attempts[e.attempts.length - 1]?.date ?? e.createdAt;

function openOrder(a, b) {
  return b.wrongCount - a.wrongCount || lastSeen(a).localeCompare(lastSeen(b)) || a.id.localeCompare(b.id);
}

function doneOrder(a, b) {
  const da = a.resolvedAt ?? a.createdAt;
  const db = b.resolvedAt ?? b.createdAt;
  return db.localeCompare(da) || a.id.localeCompare(b.id);
}

function renderEntry(entry, byId, t) {
  const out = [`### ${entry.topic}`, ''];
  out.push(`- ${t.firstRecorded}: ${entry.createdAt}`);
  if (entry.status === 'not_understood') out.push(`- ${t.revisit}: ${entry.wrongCount}`);
  if (entry.resolvedAt) out.push(`- ${t.resolved}: ${entry.resolvedAt}`);
  if (entry.questionType) out.push(`- ${t.questionType}: ${t.questionTypes[entry.questionType]}`);
  if (entry.parentId) {
    const parent = byId.get(entry.parentId);
    out.push(`- ${t.followsUp}: ${parent ? parent.topic : entry.parentId}`);
  }
  if (entry.files.length > 0) {
    const files = entry.files.map((f) => `\`${f.path}\`${f.lines ? ` (${f.lines})` : ''}`);
    out.push(`- ${t.files}: ${files.join(', ')}`);
  }
  if (entry.commits.length > 0) {
    out.push(`- ${t.commits}: ${entry.commits.map((c) => `\`${c.slice(0, 7)}\``).join(', ')}`);
  }
  if (entry.branch) out.push(`- ${t.branch}: \`${entry.branch}\``);
  out.push(`- id: \`${entry.id}\``, '');

  for (const a of entry.attempts) {
    let heading = `#### ${a.date} ${t.source[a.source] ?? a.source}: ${t.result[a.result] ?? a.result}`;
    if (a.dispute) heading += a.dispute.outcome === 'changed' ? t.disputeChanged : t.disputeKept;
    out.push(heading, '');
    out.push(`**${t.question}**`, '', quote(a.question), '');
    out.push(`**${t.answer}**`, '', quote(a.answerSummary || t.noAnswer), '');
    if (a.explanation) out.push(`**${t.explanation}**`, '', quote(a.explanation), '');
  }
  return out;
}

export function renderNotesMarkdown(notes) {
  const t = NOTES_TEXT[notes.lang] ?? NOTES_TEXT.ko;
  const byId = new Map(notes.entries.map((e) => [e.id, e]));
  const open = notes.entries.filter((e) => e.status === 'not_understood').sort(openOrder);
  const done = notes.entries.filter((e) => e.status === 'understood').sort(doneOrder);

  const out = [`# ${t.title(notes.project)}`, '', ...t.banner, '', `## ${t.openSection} (${open.length})`, ''];
  if (open.length === 0) out.push(t.none, '');
  for (const e of open) out.push(...renderEntry(e, byId, t));

  out.push(`## ${t.doneSection} (${done.length})`, '');
  if (done.length === 0) out.push(t.none, '');
  for (const e of done) out.push(...renderEntry(e, byId, t));

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

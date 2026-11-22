// notes.json → notes.md (사람이 열어 읽는 파일).
// 원칙 6에 따라 점수나 정답률은 보여주지 않고, 평가처럼 들리지 않는 말을 쓴다.

const RESULT_LABEL = {
  correct: '이해함',
  shallow: '이해함 (꼬리 질문으로 이어짐)',
  partial: '일부 이해함',
  wrong: '다시 볼 부분',
  dont_know: '모르겠다고 답함',
};

const SOURCE_LABEL = { quiz: '퀴즈', review: '복습' };

const QUESTION_TYPE_LABEL = {
  why: '왜 이렇게 했나',
  alternative: '다른 방법은 없나',
  what_if: '이게 없으면 어떻게 되나',
};

// 답이나 해설 안에 "#"으로 시작하는 줄이 있어도 노트 구조가 깨지지 않게 인용문으로 감싼다.
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

function renderEntry(entry, byId) {
  const out = [`### ${entry.topic}`, ''];
  out.push(`- 처음 기록: ${entry.createdAt}`);
  if (entry.status === 'not_understood') out.push(`- 다시 볼 횟수: ${entry.wrongCount}`);
  if (entry.resolvedAt) out.push(`- 해결한 날짜: ${entry.resolvedAt}`);
  if (entry.questionType) out.push(`- 질문 유형: ${QUESTION_TYPE_LABEL[entry.questionType]}`);
  if (entry.parentId) {
    const parent = byId.get(entry.parentId);
    out.push(`- 이어진 질문: ${parent ? parent.topic : entry.parentId}`);
  }
  if (entry.files.length > 0) {
    const files = entry.files.map((f) => `\`${f.path}\`${f.lines ? ` (${f.lines})` : ''}`);
    out.push(`- 관련 파일: ${files.join(', ')}`);
  }
  if (entry.commits.length > 0) {
    out.push(`- 관련 커밋: ${entry.commits.map((c) => `\`${c.slice(0, 7)}\``).join(', ')}`);
  }
  if (entry.branch) out.push(`- 브랜치: \`${entry.branch}\``);
  out.push(`- id: \`${entry.id}\``, '');

  for (const a of entry.attempts) {
    let heading = `#### ${a.date} ${SOURCE_LABEL[a.source] ?? a.source}: ${RESULT_LABEL[a.result] ?? a.result}`;
    if (a.dispute) heading += a.dispute.outcome === 'changed' ? ' (이의 제기 후 판단 바뀜)' : ' (이의 제기 후 판단 유지)';
    out.push(heading, '');
    out.push('**질문**', '', quote(a.question), '');
    out.push('**내 답 요약**', '', quote(a.answerSummary || '(없음)'), '');
    if (a.explanation) out.push('**해설**', '', quote(a.explanation), '');
  }
  return out;
}

export function renderNotesMarkdown(notes) {
  const byId = new Map(notes.entries.map((e) => [e.id, e]));
  const open = notes.entries.filter((e) => e.status === 'not_understood').sort(openOrder);
  const done = notes.entries.filter((e) => e.status === 'understood').sort(doneOrder);

  const out = [
    `# whycommit 학습 노트: ${notes.project}`,
    '',
    '> 이 파일은 whycommit이 자동으로 만듭니다. 직접 고쳐도 다음 기록 때 덮어써집니다.',
    '> 원본은 같은 폴더의 notes.json입니다.',
    '',
    `## 이해하지 못한 내용 (${open.length})`,
    '',
  ];
  if (open.length === 0) out.push('아직 없습니다.', '');
  for (const e of open) out.push(...renderEntry(e, byId));

  out.push(`## 이해한 내용 (${done.length})`, '');
  if (done.length === 0) out.push('아직 없습니다.', '');
  for (const e of done) out.push(...renderEntry(e, byId));

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

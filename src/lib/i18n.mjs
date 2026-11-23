// 기록 본문과 학습 노트에 쓰는 고정 문구 (한국어, 영어).
//
// 에이전트는 사용자와 대화하는 언어를 --lang이나 입력 파일의 "lang"으로 넘긴다.
// 한국어(ko...)가 아니면 영어 문구를 쓴다. 아무것도 정해지지 않으면 한국어다 (첫 버전과 같은 동작).
//
// Fixed text used in record bodies and learning notes (Korean, English).
//
// The agent passes the language it uses with the user, via --lang or "lang" in an input file.
// Anything other than Korean (ko...) gets the English text. If nothing is set, Korean is used
// (the same behavior as the first version).

import { WcError } from './cli.mjs';

const LANG_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i;

/**
 * 언어 코드를 'ko' 또는 'en'으로 줄인다. 비어 있거나 'auto'면 null.
 * Reduce a language code to 'ko' or 'en'. Returns null when empty or 'auto'.
 */
export function normalizeLang(value) {
  if (value === undefined || value === null || value === '' || value === 'auto') return null;
  if (typeof value !== 'string' || !LANG_CODE.test(value)) {
    throw new WcError('INVALID_INPUT', `Invalid language code: ${value}. Use something like ko or en.`);
  }
  return value.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

/**
 * 정할 수 있는 첫 값을 쓴다. 하나도 없으면 한국어.
 * Use the first value that resolves. Korean if none does.
 */
export function pickLang(...candidates) {
  for (const candidate of candidates) {
    const lang = normalizeLang(candidate);
    if (lang) return lang;
  }
  return 'ko';
}

/** 본문의 네 항목 이름과 남은 작업의 출처 이름 / The four record headings and the labels for remaining-work sources */
export const BODY_TEXT = {
  ko: {
    headings: { done: '오늘 한 작업', todo: '남은 작업', understood: '이해한 내용', notUnderstood: '이해하지 못한 내용' },
    sources: { plan: '기획 문서', conversation: '대화', todo: 'TODO 주석', issue: '이슈', quiz: '퀴즈에서 확인', user: null },
  },
  en: {
    headings: {
      done: "Today's work",
      todo: 'Remaining work',
      understood: 'What I understood',
      notUnderstood: "What I don't understand yet",
    },
    sources: { plan: 'plan', conversation: 'conversation', todo: 'TODO comment', issue: 'issue', quiz: 'found in quiz', user: null },
  },
};

/** 학습 노트(notes.md)의 문구 / Text used in the learning notes (notes.md) */
export const NOTES_TEXT = {
  ko: {
    title: (project) => `whycommit 학습 노트: ${project}`,
    banner: [
      '> 이 파일은 whycommit이 자동으로 만듭니다. 직접 고쳐도 다음 기록 때 덮어써집니다.',
      '> 원본은 같은 폴더의 notes.json입니다.',
    ],
    openSection: '이해하지 못한 내용',
    doneSection: '이해한 내용',
    none: '아직 없습니다.',
    firstRecorded: '처음 기록',
    revisit: '다시 볼 횟수',
    resolved: '해결한 날짜',
    questionType: '질문 유형',
    followsUp: '이어진 질문',
    files: '관련 파일',
    commits: '관련 커밋',
    branch: '브랜치',
    question: '질문',
    answer: '내 답 요약',
    explanation: '해설',
    noAnswer: '(없음)',
    disputeChanged: ' (이의 제기 후 판단 바뀜)',
    disputeKept: ' (이의 제기 후 판단 유지)',
    source: { quiz: '퀴즈', review: '복습' },
    result: {
      correct: '이해함',
      shallow: '이해함 (꼬리 질문으로 이어짐)',
      partial: '일부 이해함',
      wrong: '다시 볼 부분',
      dont_know: '모르겠다고 답함',
    },
    questionTypes: { why: '왜 이렇게 했나', alternative: '다른 방법은 없나', what_if: '이게 없으면 어떻게 되나' },
  },
  en: {
    title: (project) => `whycommit learning notes: ${project}`,
    banner: [
      '> whycommit generates this file. Manual edits are overwritten on the next save.',
      '> The source data is notes.json in the same folder.',
    ],
    openSection: "What I don't understand yet",
    doneSection: 'What I understood',
    none: 'Nothing yet.',
    firstRecorded: 'First recorded',
    revisit: 'Times to revisit',
    resolved: 'Resolved on',
    questionType: 'Question type',
    followsUp: 'Follows up on',
    files: 'Related files',
    commits: 'Related commits',
    branch: 'Branch',
    question: 'Question',
    answer: 'My answer (summary)',
    explanation: 'Explanation',
    noAnswer: '(none)',
    disputeChanged: ' (re-judged after a dispute: changed)',
    disputeKept: ' (re-judged after a dispute: kept)',
    source: { quiz: 'Quiz', review: 'Review' },
    result: {
      correct: 'Understood',
      shallow: 'Understood (led to a follow-up)',
      partial: 'Partly understood',
      wrong: 'To revisit',
      dont_know: 'Answered "I don\'t know"',
    },
    questionTypes: { why: 'Why this way?', alternative: 'Is there another way?', what_if: 'What happens without it?' },
  },
};

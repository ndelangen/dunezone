import { describe, expect, test } from 'vitest';

import { faqQuestionPageForViewer } from './questionPageAccess';

/*
 * Expected values follow the per-viewer server read this replaced (`loadFaqQuestionPage`):
 * the asker edits and deletes the question and accepts or unaccepts answers,
 * an answer's author alone edits it and they or the asker delete it,
 * and a signed-in viewer who has not answered may answer.
 */
const page = {
  ruleset: { id: 'ruleset-1', slug: 'test-ruleset', name: 'TestRuleset' },
  question: { id: 'question-1', askedBy: 'asker' },
  answers: [
    { id: 'answer-accepted', answeredBy: 'answerer', accepted: true },
    { id: 'answer-open', answeredBy: 'other-answerer', accepted: false },
  ],
};

const NO_ANSWER_ACTIONS = { editAnswer: false, deleteAnswer: false, acceptAnswer: false, unacceptAnswer: false };

describe('faqQuestionPageForViewer', () => {
  test.each([
    {
      label: 'signed out',
      viewerId: null,
      viewerAnswered: false,
      question: { editQuestion: false, deleteQuestion: false },
      answerQuestion: false,
      answers: [NO_ANSWER_ACTIONS, NO_ANSWER_ACTIONS],
    },
    {
      label: 'the asker, not yet answered',
      viewerId: 'asker',
      viewerAnswered: false,
      question: { editQuestion: true, deleteQuestion: true },
      answerQuestion: true,
      answers: [
        { editAnswer: false, deleteAnswer: true, acceptAnswer: false, unacceptAnswer: true },
        { editAnswer: false, deleteAnswer: true, acceptAnswer: true, unacceptAnswer: false },
      ],
    },
    {
      label: 'the asker, already answered',
      viewerId: 'asker',
      viewerAnswered: true,
      question: { editQuestion: true, deleteQuestion: true },
      answerQuestion: false,
      answers: [
        { editAnswer: false, deleteAnswer: true, acceptAnswer: false, unacceptAnswer: true },
        { editAnswer: false, deleteAnswer: true, acceptAnswer: true, unacceptAnswer: false },
      ],
    },
    {
      label: "an answer's author",
      viewerId: 'answerer',
      viewerAnswered: true,
      question: { editQuestion: false, deleteQuestion: false },
      answerQuestion: false,
      answers: [
        { editAnswer: true, deleteAnswer: true, acceptAnswer: false, unacceptAnswer: false },
        NO_ANSWER_ACTIONS,
      ],
    },
    {
      label: 'a signed-in reader who has not answered',
      viewerId: 'reader',
      viewerAnswered: false,
      question: { editQuestion: false, deleteQuestion: false },
      answerQuestion: true,
      answers: [NO_ANSWER_ACTIONS, NO_ANSWER_ACTIONS],
    },
  ])('$label', ({ viewerId, viewerAnswered, question, answerQuestion, answers }) => {
    const combined = faqQuestionPageForViewer(page, viewerId, viewerAnswered);
    expect(combined.ruleset).toBe(page.ruleset);
    expect(combined.question).toEqual({ ...page.question, capabilities: question });
    expect(combined.viewer).toEqual({ answerQuestion });
    expect(combined.answers).toEqual(
      page.answers.map((answer, index) => ({ ...answer, capabilities: answers[index] }))
    );
  });
});

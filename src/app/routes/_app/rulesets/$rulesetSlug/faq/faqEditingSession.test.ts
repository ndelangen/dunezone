import { describe, expect, test, vi } from 'vitest';

import { createFaqEditingSession } from './faqEditingSession';

function harness(overrides?: { editQuestion?: () => Promise<void>; editAnswer?: () => Promise<void> }) {
  const editQuestion = vi.fn(overrides?.editQuestion ?? (async () => {}));
  const editAnswer = vi.fn(overrides?.editAnswer ?? (async () => {}));
  const session = createFaqEditingSession({
    editQuestion,
    editAnswer,
    onState: () => {},
  });
  return { session, editQuestion, editAnswer };
}

describe('FAQ editing session', () => {
  test('starting a question edit seeds the draft, falling back to the default tag', () => {
    const { session } = harness();

    session.startEditQuestion({ text: 'How does the storm move?', tags: [] });

    expect(session.state).toMatchObject({
      editingQuestion: true,
      questionValue: 'How does the storm move?',
      tagValues: ['other'],
    });
  });

  test('an unchanged save closes the editor without calling the command', async () => {
    const { session, editQuestion } = harness();
    const item = { text: 'Question', tags: ['rules'] as never };
    session.startEditQuestion(item);

    await session.saveQuestion(item);

    expect(editQuestion).not.toHaveBeenCalled();
    expect(session.state.editingQuestion).toBe(false);
  });

  test('a changed save trims, submits, and closes', async () => {
    const { session, editQuestion } = harness();
    const item = { text: 'Question', tags: ['rules'] as never };
    session.startEditQuestion(item);
    session.setQuestionValue('  Sharper question  ');
    session.toggleTag('errata' as never, true);

    await session.saveQuestion(item);

    expect(editQuestion).toHaveBeenCalledWith({
      question: 'Sharper question',
      tags: ['rules', 'errata'],
    });
    expect(session.state.editingQuestion).toBe(false);
  });

  test('a failed save keeps the editor open with the draft intact', async () => {
    const { session } = harness({
      editQuestion: async () => {
        throw new Error('rejected');
      },
    });
    const item = { text: 'Question', tags: ['rules'] as never };
    session.startEditQuestion(item);
    session.setQuestionValue('Changed');

    await session.saveQuestion(item);

    expect(session.state.editingQuestion).toBe(true);
    expect(session.state.questionValue).toBe('Changed');
  });

  test('deselecting every tag blocks the save', async () => {
    const { session, editQuestion } = harness();
    const item = { text: 'Question', tags: ['rules'] as never };
    session.startEditQuestion(item);
    session.toggleTag('rules' as never, false);
    session.setQuestionValue('Changed');

    await session.saveQuestion(item);

    expect(editQuestion).not.toHaveBeenCalled();
    expect(session.state.editingQuestion).toBe(true);
  });

  test('answer edits mirror the rules: unchanged closes silently, changed submits trimmed', async () => {
    const { session, editAnswer } = harness();
    const answer = { id: 'a1', text: 'The storm moves.' };

    session.startEditAnswer(answer);
    await session.saveAnswer(answer);
    expect(editAnswer).not.toHaveBeenCalled();
    expect(session.state.editingAnswerId).toBeNull();

    session.startEditAnswer(answer);
    session.setAnswerValue('  It moves 1-6 sectors.  ');
    await session.saveAnswer(answer);
    expect(editAnswer).toHaveBeenCalledWith({ answerId: 'a1', answer: 'It moves 1-6 sectors.' });
    expect(session.state.editingAnswerId).toBeNull();
  });
});

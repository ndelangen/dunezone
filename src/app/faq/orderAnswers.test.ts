import { describe, expect, test } from 'vitest';

import { orderFaqAnswers } from './orderAnswers';

describe('FAQ answer ordering', () => {
  test('puts the accepted answer first without changing the remaining order or input', () => {
    const answers = [
      { _id: 'first', answer: 'First answer' },
      { _id: 'second', answer: 'Second answer' },
      { _id: 'accepted', answer: 'Accepted answer' },
      { _id: 'fourth', answer: 'Fourth answer' },
    ];

    expect(orderFaqAnswers(answers, 'accepted').map((answer) => answer._id)).toEqual([
      'accepted',
      'first',
      'second',
      'fourth',
    ]);
    expect(answers.map((answer) => answer._id)).toEqual(['first', 'second', 'accepted', 'fourth']);
  });

  test('preserves stored order when there is no matching accepted answer', () => {
    const answers = [{ _id: 'first' }, { _id: 'second' }];

    expect(orderFaqAnswers(answers, null)).toBe(answers);
    expect(orderFaqAnswers(answers, 'missing')).toBe(answers);
  });
});

import { recalculateFactionComplexity } from '@shared/factions/complexity';
import type { FactionInput } from '@shared/factions/schema';
import { describe, expect, it } from 'vitest';

import {
  COMPLEXITY_CAPACITY_WORDS,
  calculateComplexity,
  complexityOutOfTen,
  complexityTier,
  effectiveComplexity,
  hasAdvisableComplexityDeviation,
} from './complexity';

function rulesWith(overrides: Partial<FactionInput['rules']> = {}): FactionInput['rules'] {
  return {
    startText: '',
    revivalText: '',
    spiceCount: 5,
    advantages: [],
    fate: { text: '' },
    alliance: { text: '' },
    ...overrides,
  };
}

const wordsOf = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ');

describe('calculateComplexity', () => {
  it('stays 0 up to the grace floor', () => {
    expect(calculateComplexity(rulesWith({ startText: wordsOf(80) }))).toBe(0);
  });

  it('reaches 1 at the capacity anchor and clamps beyond it', () => {
    expect(calculateComplexity(rulesWith({ startText: wordsOf(COMPLEXITY_CAPACITY_WORDS) }))).toBe(
      1
    );
    expect(
      calculateComplexity(rulesWith({ startText: wordsOf(COMPLEXITY_CAPACITY_WORDS * 2) }))
    ).toBe(1);
  });

  it('counts every sheet-rendered field and strips markdown syntax', () => {
    const spread = rulesWith({
      startText: 'one two',
      revivalText: 'three',
      alliance: { text: 'four five' },
      fate: { title: 'six', text: 'seven' },
      advantages: [{ title: 'eight', text: '**nine** _ten_', karama: 'eleven' }],
    });
    const concentrated = rulesWith({ startText: wordsOf(11) });
    expect(calculateComplexity(spread)).toBe(calculateComplexity(concentrated));
  });

  it('does not count unordered, ordered, or thematic-break markdown markers as words', () => {
    const markdown = rulesWith({
      startText: '- one\n+ two\n1. three\n2) four\n---\n**five**',
    });
    const renderedWords = rulesWith({ startText: 'one two three four five' });

    expect(calculateComplexity(markdown)).toBe(calculateComplexity(renderedWords));
  });

  it('does not count fenced-code language metadata as rendered text', () => {
    const renderedWords = wordsOf(81);
    const markdown = rulesWith({ startText: `\`\`\`js\n${renderedWords}\n\`\`\`` });

    expect(calculateComplexity(markdown)).toBe(
      calculateComplexity(rulesWith({ startText: renderedWords }))
    );
  });

  it('bumps the score for advantage counts past the threshold', () => {
    const text = wordsOf(390);
    const few = rulesWith({ startText: text });
    const many = rulesWith({
      startText: text,
      advantages: Array.from({ length: 10 }, () => ({ text: '' })),
    });
    expect(calculateComplexity(many)).toBeCloseTo(calculateComplexity(few) + 0.06, 5);
  });
});

describe('effectiveComplexity', () => {
  it('prefers the manual rating and otherwise uses the stored calculation', () => {
    expect(effectiveComplexity({ calculated: 0.8, manual: 0.2 })).toBe(0.2);
    expect(effectiveComplexity({ calculated: 0.8 })).toBe(0.8);
  });
});

describe('stored complexity records', () => {
  it('recalculates before writes while preserving only the manual rating', () => {
    const rules = rulesWith({ startText: wordsOf(COMPLEXITY_CAPACITY_WORDS) });

    expect(
      recalculateFactionComplexity({
        rules,
        complexity: { calculated: 0.123, manual: 0.4 },
      }).complexity
    ).toEqual({ calculated: 1, manual: 0.4 });
  });
});

describe('complexityTier', () => {
  it('maps the band edges, edge value belonging to the band above', () => {
    expect(complexityTier(0)).toBe('novice');
    expect(complexityTier(0.25)).toBe('intermediate');
    expect(complexityTier(0.5)).toBe('expert');
    expect(complexityTier(0.75)).toBe('master');
    expect(complexityTier(1)).toBe('master');
  });
});

describe('complexityOutOfTen', () => {
  it('rounds onto the ten-point display scale', () => {
    expect(complexityOutOfTen(0)).toBe(0);
    expect(complexityOutOfTen(0.649)).toBe(6);
    expect(complexityOutOfTen(1)).toBe(10);
  });
});

describe('hasAdvisableComplexityDeviation', () => {
  it('fires at an exact three-point displayed gap in both directions', () => {
    expect(hasAdvisableComplexityDeviation(0.7, 0.4)).toBe(true);
    expect(hasAdvisableComplexityDeviation(0.4, 0.7)).toBe(true);
    expect(hasAdvisableComplexityDeviation(0.6, 0.4)).toBe(false);
  });
});

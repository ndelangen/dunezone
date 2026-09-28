import { describe, expect, it } from 'vitest';

import { publishingSpiceCard } from './assets/fixtures/publishingSpiceCard';
import { publishingTreacheryCard } from './assets/fixtures/publishingTreacheryCard';
import { SpiceAsset, SpiceAssetInput, TreacheryAsset, TreacheryAssetInput } from './assets/schema';
import { parseAssetDataForWrite } from './assets/validation';
import { faqAnswerSchema, faqQuestionSchema } from './faq/validation';
import { rulesetAboutSchema } from './rulesets/validation';

describe('stored prose write validation', () => {
  it('normalizes valid asset prose and rejects invalid source only at the write boundary', () => {
    const valid = { ...publishingTreacheryCard, about: 'Opening  \r\n\r\n- first' };
    const invalid = { ...publishingTreacheryCard, text: '*unfinished' };

    expect(TreacheryAssetInput.parse(valid).about).toBe('Opening\n\n- first');
    expect(TreacheryAssetInput.safeParse(invalid).success).toBe(false);
    expect(TreacheryAsset.safeParse(invalid).success).toBe(true);
  });

  it('writes a spice card with or without a body, and refuses one that is incomplete', () => {
    expect(parseAssetDataForWrite('card-spice', publishingSpiceCard)).toEqual({
      data: publishingSpiceCard,
      name: 'Arsunt',
    });
    expect(SpiceAssetInput.parse({ ...publishingSpiceCard, text: 'Add *6 spice*  \r\nto Arsunt' }).text).toBe(
      'Add *6 spice*\nto Arsunt'
    );
    expect(SpiceAssetInput.safeParse({ ...publishingSpiceCard, text: '*unfinished' }).success).toBe(false);
    expect(SpiceAsset.safeParse({ ...publishingSpiceCard, text: '*unfinished' }).success).toBe(true);
    const { amount: _amount, ...withoutAmount } = publishingSpiceCard;
    expect(() => parseAssetDataForWrite('card-spice', withoutAmount)).toThrow();
    expect(() => parseAssetDataForWrite('card-spice', { ...publishingSpiceCard, amount: 0 })).toThrow();
    expect(() => parseAssetDataForWrite('card-spice', { ...publishingSpiceCard, highlights: ['nowhere'] })).toThrow();
  });

  it('allows blocks in ruleset About and FAQ answers, but keeps FAQ questions inline', () => {
    const about = `${'*Formatted* rules explain the complete game clearly. '.repeat(2)}\n\n- First rule`;

    expect(rulesetAboutSchema.safeParse(about).success).toBe(true);
    expect(faqAnswerSchema.safeParse('Paragraph one\n\n- one\n- two').success).toBe(true);
    expect(faqQuestionSchema.safeParse('Can I use *this* effect?').success).toBe(true);
    expect(faqQuestionSchema.safeParse('First line\nsecond line').success).toBe(false);
  });
});

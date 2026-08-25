import { describe, expect, it } from 'vitest';

import { publishingTreacheryCard } from './assets/fixtures/publishingTreacheryCard';
import { TreacheryAsset, TreacheryAssetInput } from './assets/schema';
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

  it('allows blocks in ruleset About and FAQ answers, but keeps FAQ questions inline', () => {
    const about = `${'*Formatted* rules explain the complete game clearly. '.repeat(2)}\n\n- First rule`;

    expect(rulesetAboutSchema.safeParse(about).success).toBe(true);
    expect(faqAnswerSchema.safeParse('Paragraph one\n\n- one\n- two').success).toBe(true);
    expect(faqQuestionSchema.safeParse('Can I use *this* effect?').success).toBe(true);
    expect(faqQuestionSchema.safeParse('First line\nsecond line').success).toBe(false);
  });
});

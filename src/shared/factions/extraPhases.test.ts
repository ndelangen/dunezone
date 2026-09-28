import { describe, expect, it } from 'vitest';

import { phaseDeclarationProblems, phaseDeclarationSchema } from './extraPhases';
import { assetPublishingFaction } from './fixtures/assetPublishingFaction';
import { CanonicalFactionStoredSchema, FactionInputSchema } from './schema';

const valid = {
  id: 'phase-1',
  type: 'instruction',
  title: 'Spacing guild ship',
  symbol: '/vector/icon/fate.svg',
  before: 'bidding',
  priority: 5,
  allPlayersMustBeReady: false,
};

function withPhases(extraPhases: unknown) {
  return { ...structuredClone(assetPublishingFaction), extraPhases };
}

describe('faction phase declarations (#1138)', () => {
  it('accepts a turn declaration and a setup declaration', () => {
    expect(phaseDeclarationSchema.parse(valid)).toEqual(valid);
    expect(phaseDeclarationSchema.safeParse({ ...valid, before: 'forces' }).success).toBe(true);
  });

  it('fills priority and readiness with their defaults, so a row with only the required fields is valid', () => {
    const { priority: _priority, allPlayersMustBeReady: _ready, ...required } = valid;
    expect(phaseDeclarationSchema.parse(required)).toMatchObject({ priority: 10, allPlayersMustBeReady: false });
  });

  it('refuses each invalid field with the decision wording', () => {
    expect(phaseDeclarationProblems({ ...valid, before: 'karama' })).toEqual({
      before: 'Karama is not a phase you can place before.',
    });
    expect(phaseDeclarationProblems({ ...valid, type: 'predictoin' })).toEqual({
      type: '"predictoin" is not a phase type.',
    });
    expect(phaseDeclarationProblems({ ...valid, symbol: undefined })).toEqual({ symbol: 'Choose a symbol.' });
    expect(phaseDeclarationProblems({ ...valid, title: '  ' })).toEqual({ title: 'Give the phase a title.' });
    expect(phaseDeclarationProblems({ ...valid, priority: 2.5 })).toEqual({
      priority: 'Priority must be a whole number.',
    });
    expect(phaseDeclarationProblems({ ...valid, priority: '' })).toEqual({
      priority: 'Priority must be a whole number.',
    });
    expect(phaseDeclarationProblems({ ...valid, before: undefined })).toEqual({
      before: 'Choose where the phase goes.',
    });
    expect(phaseDeclarationProblems({ ...valid, type: 'prediction' })).toEqual({
      before: 'A prediction runs once, so place it before a setup step.',
    });
    expect(phaseDeclarationProblems({ ...valid, type: 'prediction', before: 'traitors' })).toEqual({});
    expect(phaseDeclarationProblems(valid)).toEqual({});
  });

  it('allows two prediction rows and same-target, same-priority rows in one faction', () => {
    const phases = [
      { ...valid, id: 'a', type: 'prediction', before: 'traitors' },
      { ...valid, id: 'b', type: 'prediction', before: 'traitors' },
    ];
    expect(FactionInputSchema.safeParse(withPhases(phases)).success).toBe(true);
  });

  it('refuses a repeated phase id within the faction', () => {
    const result = FactionInputSchema.safeParse(withPhases([valid, { ...valid }]));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['extraPhases', 1, 'id']);
  });

  it('reads a faction without the field, and an empty list, unchanged', () => {
    const older = structuredClone(assetPublishingFaction);
    expect('extraPhases' in older).toBe(false);
    expect(FactionInputSchema.parse(older)).toEqual(older);
    expect(CanonicalFactionStoredSchema.parse(older)).toEqual(older);
    expect(FactionInputSchema.parse(withPhases([]))).toEqual(withPhases([]));
  });

  it('refuses an invalid row at the faction boundary the Convex save uses', () => {
    expect(FactionInputSchema.safeParse(withPhases([{ ...valid, before: 'karama' }])).success).toBe(false);
    expect(CanonicalFactionStoredSchema.safeParse(withPhases([{ ...valid, extra: true }])).success).toBe(false);
  });
});

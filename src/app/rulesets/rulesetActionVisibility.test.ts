import { describe, expect, test } from 'vitest';

import { rulesetActionVisibility } from './rulesetActionVisibility';

describe('rulesetActionVisibility', () => {
  test('keeps deletion available without a bogus group action while profile resolves', () => {
    expect(
      rulesetActionVisibility({
        hasProfile: false,
        canChangeGroup: true,
        canDelete: true,
        hasAssignedGroup: false,
      })
    ).toEqual({
      askQuestion: false,
      assignGroup: false,
      removeGroup: false,
      deleteRuleset: true,
    });
  });

  test('selects assignment for unassigned rulesets and removal for assigned rulesets', () => {
    expect(
      rulesetActionVisibility({
        hasProfile: true,
        canChangeGroup: true,
        canDelete: false,
        hasAssignedGroup: false,
      })
    ).toMatchObject({ assignGroup: true, removeGroup: false });

    expect(
      rulesetActionVisibility({
        hasProfile: false,
        canChangeGroup: true,
        canDelete: false,
        hasAssignedGroup: true,
      })
    ).toMatchObject({ assignGroup: false, removeGroup: true });
  });
});

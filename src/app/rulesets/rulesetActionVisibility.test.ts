import { describe, expect, test } from 'vitest';

import { rulesetActionVisibility } from './rulesetActionVisibility';

describe('rulesetActionVisibility', () => {
  test('keeps owner assignment and deletion independent of profile projection loading', () => {
    expect(
      rulesetActionVisibility({
        hasProfile: false,
        canChangeGroup: true,
        canDelete: true,
        hasAssignedGroup: false,
      })
    ).toEqual({
      askQuestion: false,
      assignGroup: true,
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
        hasProfile: true,
        canChangeGroup: true,
        canDelete: false,
        hasAssignedGroup: true,
      })
    ).toMatchObject({ assignGroup: false, removeGroup: true });

    expect(
      rulesetActionVisibility({
        hasProfile: true,
        canChangeGroup: false,
        canDelete: false,
        hasAssignedGroup: true,
      })
    ).toMatchObject({ assignGroup: false, removeGroup: false });
  });
});

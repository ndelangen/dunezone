import { describe, expect, test } from 'vitest';

import * as factionsApi from './factions';
import * as groupsApi from './groups';
import * as membersApi from './members';
import * as rulesetsApi from './rulesets';

/*
 * ADR-0001: the former source-text assertions are fully retired. The server-policy layering rule
 * lives in .oxlintrc.json (no-restricted-imports); wire guarantees live in the returns validators.
 */
describe('collaborative-access caller contract', () => {
  test('the narrowed Convex registry exposes only canonical collaborative-access transport', () => {
    expect(Object.keys(membersApi).sort()).toEqual(
      ['addMember', 'approveRequest', 'rejectRequest', 'removeMember', 'request'].sort()
    );
    expect(groupsApi).not.toHaveProperty('getBySlug');
    expect(rulesetsApi).not.toHaveProperty('canEdit');
    expect(factionsApi).not.toHaveProperty('getCreatePageContext');
  });
});

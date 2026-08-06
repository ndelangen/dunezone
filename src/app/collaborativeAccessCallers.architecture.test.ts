import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import * as factionsApi from '../../convex/factions';
import * as groupsApi from '../../convex/groups';
import * as membersApi from '../../convex/members';
import * as rulesetsApi from '../../convex/rulesets';

// ADR-0001: tests assert contracts through public interfaces, never source text. The former
// source-text assertions in this file were retired in #233; the guarantees they expressed live in
// the narrowed `returns` validators (convex/lib/collaborativeAccessValidators.ts), the narrowed
// registry below, and the client types derived from the server contract.
describe('collaborative-access caller contract', () => {
  test('the narrowed Convex registry exposes only canonical collaborative-access transport', () => {
    expect(Object.keys(membersApi).sort()).toEqual(
      ['addMember', 'approveRequest', 'rejectRequest', 'removeMember', 'request'].sort()
    );
    expect(groupsApi).not.toHaveProperty('getBySlug');
    expect(rulesetsApi).not.toHaveProperty('canEdit');
    expect(factionsApi).not.toHaveProperty('getCreatePageContext');
  });

  test('the server policy module does not import client code', () => {
    // Allowlisted source-text assertion (see #233): a dependency-direction rule the compiler does
    // not enforce. Its proper long-term home is a no-restricted-imports lint rule.
    const collaborativeAccess = readFileSync(
      new URL('../../convex/lib/collaborativeAccess.ts', import.meta.url),
      'utf8'
    );
    expect(collaborativeAccess).not.toContain('../../src/app');
  });
});

import { describe, expect, test } from 'vitest';

import type { Id } from '../_generated/dataModel';
import { evaluateCollaborativeAccess } from './collaborativeAccess';

describe('collaborative access evaluator', () => {
  test.each([
    {
      label: 'Group none',
      facts: {
        kind: 'group' as const,
        group: { eligible: true },
        viewer: { kind: 'authenticated' as const, membership: 'none' as const, ownsSubject: false },
      },
      expected: { requestMembership: true, rename: false, delete: false, addMember: false },
    },
    {
      label: 'Group pending',
      facts: {
        kind: 'group' as const,
        group: { eligible: true },
        viewer: {
          kind: 'authenticated' as const,
          membership: 'pending' as const,
          ownsSubject: false,
        },
      },
      expected: { requestMembership: false, rename: false, delete: false, addMember: false },
    },
    {
      label: 'Group active',
      facts: {
        kind: 'group' as const,
        group: { eligible: true },
        viewer: {
          kind: 'authenticated' as const,
          membership: 'active' as const,
          ownsSubject: false,
        },
      },
      expected: { requestMembership: false, rename: false, delete: false, addMember: true },
    },
    {
      label: 'Group owner without membership',
      facts: {
        kind: 'group' as const,
        group: { eligible: true },
        viewer: { kind: 'authenticated' as const, membership: 'none' as const, ownsSubject: true },
      },
      expected: { requestMembership: true, rename: true, delete: true, addMember: false },
    },
    {
      label: 'Faction active collaborator',
      facts: {
        kind: 'faction' as const,
        resource: { available: true },
        group: { eligible: true, summary: null },
        viewer: {
          kind: 'authenticated' as const,
          membership: 'active' as const,
          ownsSubject: false,
        },
      },
      /* Identical to the ruleset row below since #605: the two kinds no longer differ on rename. */
      expected: {
        requestMembership: false,
        edit: true,
        rename: false,
        changeGroup: false,
        delete: false,
      },
    },
    {
      label: 'Ruleset active collaborator',
      facts: {
        kind: 'ruleset' as const,
        resource: { available: true },
        group: { eligible: true, summary: null },
        viewer: {
          kind: 'authenticated' as const,
          membership: 'active' as const,
          ownsSubject: false,
        },
      },
      expected: {
        requestMembership: false,
        edit: true,
        rename: false,
        changeGroup: false,
        delete: false,
      },
    },
    {
      label: 'Unassigned asset owner',
      facts: {
        kind: 'ruleset' as const,
        resource: { available: true },
        group: { eligible: false, summary: null },
        viewer: { kind: 'authenticated' as const, membership: 'none' as const, ownsSubject: true },
      },
      expected: {
        requestMembership: false,
        edit: true,
        rename: true,
        changeGroup: true,
        delete: true,
      },
    },
  ])('$label capabilities are explicit', ({ facts, expected }) => {
    expect(evaluateCollaborativeAccess(facts).capabilities).toEqual(expected);
  });

  test('an anonymous Group viewer receives no collaborative actions', () => {
    expect(
      evaluateCollaborativeAccess({
        kind: 'group',
        group: { eligible: true },
        viewer: { kind: 'anonymous' },
      })
    ).toEqual({
      kind: 'group',
      viewer: { kind: 'anonymous' },
      capabilities: {
        requestMembership: false,
        rename: false,
        delete: false,
        addMember: false,
      },
    });
  });

  test('a removed Group membership is public none and may request again', () => {
    expect(
      evaluateCollaborativeAccess({
        kind: 'group',
        group: { eligible: true },
        viewer: { kind: 'authenticated', membership: 'removed', ownsSubject: false },
      })
    ).toEqual({
      kind: 'group',
      viewer: { kind: 'authenticated', membership: 'none' },
      capabilities: {
        requestMembership: true,
        rename: false,
        delete: false,
        addMember: false,
      },
    });
  });

  test('an active collaborator may rename nothing, whatever kind it is', () => {
    const assignedGroup = {
      id: 'group-1' as Id<'groups'>,
      name: 'Dune Designers',
      slug: 'dune-designers',
    };
    const viewer = {
      kind: 'authenticated' as const,
      membership: 'active' as const,
      ownsSubject: false,
    };

    expect(
      evaluateCollaborativeAccess({
        kind: 'faction',
        resource: { available: true },
        group: { eligible: true, summary: assignedGroup },
        viewer,
      }).capabilities
    ).toEqual({
      requestMembership: false,
      edit: true,
      /* A rename moves the public URL, so it is the owner's alone for every kind (#605). */
      rename: false,
      changeGroup: false,
      delete: false,
    });
    expect(
      evaluateCollaborativeAccess({
        kind: 'ruleset',
        resource: { available: true },
        group: { eligible: true, summary: assignedGroup },
        viewer,
      }).capabilities
    ).toEqual({
      requestMembership: false,
      edit: true,
      rename: false,
      changeGroup: false,
      delete: false,
    });
  });

  test('an unavailable Group grants no effective Group capabilities', () => {
    expect(
      evaluateCollaborativeAccess({
        kind: 'group',
        group: { eligible: false },
        viewer: { kind: 'authenticated', membership: 'active', ownsSubject: true },
      }).capabilities
    ).toEqual({
      requestMembership: false,
      rename: false,
      delete: false,
      addMember: false,
    });
  });

  test('a deleted asset grants no effective capabilities even to its owner', () => {
    expect(
      evaluateCollaborativeAccess({
        kind: 'ruleset',
        resource: { available: false },
        group: { eligible: true, summary: null },
        viewer: { kind: 'authenticated', membership: 'active', ownsSubject: true },
      }).capabilities
    ).toEqual({
      requestMembership: false,
      edit: false,
      rename: false,
      changeGroup: false,
      delete: false,
    });
  });
});

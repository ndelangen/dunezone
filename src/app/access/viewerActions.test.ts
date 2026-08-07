import { describe, expect, test } from 'vitest';

import type { CollaborativeAccess } from '../../../convex/lib/collaborativeAccess';
import { viewerActionsFor } from './viewerActions';

const assetAccess = (overrides?: {
  edit?: boolean;
  changeGroup?: boolean;
  del?: boolean;
  assigned?: boolean;
  anonymous?: boolean;
}): CollaborativeAccess => ({
  kind: 'ruleset',
  assignedGroup: overrides?.assigned
    ? { id: 'group-1' as never, name: 'Sietch', slug: 'sietch' }
    : null,
  viewer: overrides?.anonymous
    ? { kind: 'anonymous' }
    : { kind: 'authenticated', membership: 'active' },
  capabilities: {
    requestMembership: false,
    edit: overrides?.edit ?? false,
    rename: false,
    changeGroup: overrides?.changeGroup ?? false,
    delete: overrides?.del ?? false,
  },
});

describe('viewer actions projection', () => {
  test('a maintainer sees edit, delete, and assignment for an unassigned asset', () => {
    const actions = viewerActionsFor(assetAccess({ edit: true, changeGroup: true, del: true }), {
      hasProfile: true,
      subjectGroupId: null,
    });
    expect(actions).toMatchObject({
      canEdit: true,
      canDelete: true,
      assignGroup: true,
      removeGroup: false,
      askQuestion: true,
      membershipStatus: 'active',
    });
  });

  test('a dangling assignment still offers removal, never assignment', () => {
    const actions = viewerActionsFor(assetAccess({ changeGroup: true, assigned: false }), {
      subjectGroupId: 'group-deleted',
    });
    expect(actions.removeGroup).toBe(true);
    expect(actions.assignGroup).toBe(false);
    expect(actions.assignedGroup).toBeNull();
  });

  test('anonymous viewers get no capabilities and read as anonymous, not members', () => {
    const actions = viewerActionsFor(assetAccess({ anonymous: true }));
    expect(actions).toMatchObject({
      isAnonymous: true,
      membershipStatus: 'none',
      canEdit: false,
      canDelete: false,
      askQuestion: false,
    });
  });

  test('group access maps membership without asset-only actions', () => {
    const groupAccess: CollaborativeAccess = {
      kind: 'group',
      viewer: { kind: 'authenticated', membership: 'pending' },
      capabilities: { requestMembership: false, rename: true, delete: true, addMember: true },
    };
    const actions = viewerActionsFor(groupAccess);
    expect(actions).toMatchObject({
      membershipStatus: 'pending',
      canEdit: false,
      assignGroup: false,
      removeGroup: false,
      assignedGroup: null,
      canDelete: true,
    });
  });
});

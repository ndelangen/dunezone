import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

const sources = {
  collaborativeAccess: readFileSync(
    new URL('../../convex/lib/collaborativeAccess.ts', import.meta.url),
    'utf8'
  ),
  factionDb: readFileSync(new URL('./factions/db.ts', import.meta.url), 'utf8'),
  factionDetail: readFileSync(
    new URL('./routes/_app/factions/$factionId/index.tsx', import.meta.url),
    'utf8'
  ),
  factionEdit: readFileSync(
    new URL('./routes/_app/factions/$factionId/edit.tsx', import.meta.url),
    'utf8'
  ),
  groupAssignPopover: readFileSync(
    new URL('./components/groups/GroupAssignPopover.tsx', import.meta.url),
    'utf8'
  ),
  groupDb: readFileSync(new URL('./groups/db.ts', import.meta.url), 'utf8'),
  groupDetail: readFileSync(
    new URL('./routes/_app/groups/$groupSlug/index.tsx', import.meta.url),
    'utf8'
  ),
  groupEdit: readFileSync(
    new URL('./routes/_app/groups/$groupSlug/edit.tsx', import.meta.url),
    'utf8'
  ),
  membersDb: readFileSync(new URL('./members/db.ts', import.meta.url), 'utf8'),
  rulesetDb: readFileSync(new URL('./rulesets/db.ts', import.meta.url), 'utf8'),
  rulesetDetail: readFileSync(
    new URL('./routes/_app/rulesets/$rulesetSlug/index.tsx', import.meta.url),
    'utf8'
  ),
  rulesetEdit: readFileSync(
    new URL('./routes/_app/rulesets/$rulesetSlug/edit.tsx', import.meta.url),
    'utf8'
  ),
};

describe('faction and ruleset collaborative-access caller contract', () => {
  test('domain page adapters expose the canonical viewer projection', () => {
    expect(sources.factionDb).toContain('viewerAccess');
    expect(sources.rulesetDb).toContain('viewerAccess');
    expect(sources.factionDb).not.toContain('FactionPageGroupAccess');
    expect(sources.factionDb).not.toMatch(/^\s+memberships:/m);
    expect(sources.factionDb).not.toMatch(/^\s+groupAccess:/m);
    expect(sources.rulesetDb).not.toContain('canEditRuleset');
    expect(sources.rulesetDb).not.toMatch(/^\s+memberships:/m);
    expect(sources.rulesetDb).not.toMatch(/^\s+groupAccess:/m);
  });

  test('the server policy module owns its public contract', () => {
    expect(sources.collaborativeAccess).not.toContain('../../src/app');
    expect(sources.collaborativeAccess).toContain('export type CollaborativeAccess =');
    expect(sources.factionDb).toContain("from '../../../convex/lib/collaborativeAccess'");
    expect(sources.rulesetDb).toContain("from '../../../convex/lib/collaborativeAccess'");
  });

  test('detail and edit routes render authorization from viewerAccess capabilities', () => {
    for (const source of [
      sources.factionDetail,
      sources.factionEdit,
      sources.rulesetDetail,
      sources.rulesetEdit,
    ]) {
      expect(source).toContain('viewerAccess');
    }

    expect(sources.factionDetail).not.toContain('canEditFaction(');
    expect(sources.factionDetail).not.toContain('groupAccess');
    expect(sources.factionDetail).not.toContain('memberships');
    expect(sources.rulesetDetail).not.toContain('canEditRuleset');
    expect(sources.rulesetDetail).not.toContain('groupAccess');
    expect(sources.rulesetEdit).not.toContain('canEditRuleset');
  });

  test('ruleset owner actions do not depend on profile projection availability', () => {
    expect(sources.rulesetDetail).not.toMatch(
      /\{profile\.data\?\._id \? \(\s*<Group[^>]+aria-label="Ruleset actions"/
    );
  });

  test('membership request handlers consume command rejections after state records the error', () => {
    for (const source of [sources.factionDetail, sources.rulesetDetail]) {
      expect(source).not.toMatch(
        /onClick=\{\(\) => void membershipWorkflow\.request\.run\(assignedGroup\.id\)\}/
      );
      expect(source).toMatch(
        /void membershipWorkflow\.request\s*\.run\(assignedGroup\.id\)\s*\.catch\(\(\) => undefined\)/
      );
    }
  });

  test('assignment callers consume server-derived group summaries without raw membership fallbacks', () => {
    expect(sources.groupAssignPopover).toContain('assignableGroups');
    expect(sources.groupAssignPopover).not.toContain('prefetchedMemberships');
    expect(sources.groupAssignPopover).not.toContain('useUserGroupMemberships');
    expect(sources.groupAssignPopover).not.toContain('userId');

    expect(sources.factionEdit).toContain('assignableGroups={assignableGroups}');
    expect(sources.rulesetDetail).toContain('assignableGroups={page.assignableGroups}');
    expect(sources.rulesetDetail).not.toContain('viewerAssignableMemberships');
    expect(sources.rulesetDb).not.toContain('viewerAssignableMemberships');
    expect(sources.membersDb).not.toContain('listByUserActiveWithGroups');
  });

  test('Group callers consume viewer access, owner summary, roster capabilities, and one workflow', () => {
    expect(sources.groupDb).toContain('viewerAccess');
    expect(sources.groupDb).toContain('owner: GroupOwnerSummary | null');
    expect(sources.groupDb).toContain('roster: GroupRosterEntry[]');
    expect(sources.groupDb).not.toMatch(/^\s+members:/m);
    expect(sources.groupDb).not.toMatch(/^\s+profiles:/m);

    expect(sources.groupDetail).toContain('groupData.viewerAccess');
    expect(sources.groupDetail).toContain('groupData.owner');
    expect(sources.groupDetail).toContain('groupData.roster');
    expect(sources.groupDetail).toContain('useGroupMembershipWorkflow');
    expect(sources.groupDetail).toContain('entry.capabilities.approve');
    expect(sources.groupDetail).toContain('entry.capabilities.reject');
    expect(sources.groupDetail).toContain('entry.capabilities.remove');
    expect(sources.groupDetail).toMatch(/approve\s*\.run\(entry\.membershipId\)/);
    expect(sources.groupDetail).toMatch(/reject\s*\.run\(entry\.membershipId\)/);
    expect(sources.groupDetail).toContain('remove.run(membershipId)');
    expect(sources.groupDetail).toContain('handleRemoveMember(entry.membershipId)');
    expect(sources.groupDetail).not.toContain('useCurrentProfile');
    expect(sources.groupDetail).not.toContain('useApproveGroupMember');
    expect(sources.groupDetail).not.toContain('useRejectGroupMember');
    expect(sources.groupDetail).not.toContain('useRemoveGroupMember');
    expect(sources.groupDetail).not.toContain('useRequestGroupMembership');

    expect(sources.groupEdit).toContain('useGroupEditBySlug');
    expect(sources.groupEdit).toContain('viewerAccess.capabilities.rename');
    expect(sources.groupEdit).not.toContain('useCurrentProfile');
    expect(sources.groupEdit).not.toContain('group.created_by');

    expect(sources.groupDb).not.toContain('api.groups.getBySlug');
    expect(sources.groupDb).not.toContain('loadGroupBySlug');
    expect(sources.groupDb).not.toContain('useGroupBySlug');
    expect(sources.membersDb).not.toContain('api.members.listByGroup');
    expect(sources.membersDb).not.toContain('api.members.get');
    expect(sources.membersDb).not.toContain('useRequestGroupMembership');
    expect(sources.membersDb).not.toContain('useApproveGroupMember');
    expect(sources.membersDb).not.toContain('useRejectGroupMember');
    expect(sources.membersDb).not.toContain('useRemoveGroupMember');
  });
});

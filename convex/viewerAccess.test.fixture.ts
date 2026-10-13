import type { TestConvexForDataModel } from 'convex-test';
import type { FunctionArgs } from 'convex/server';

import {
  assetAccessForViewer,
  assetSubjectFacts,
  groupAccessForViewer,
  groupRosterCapabilities,
  groupSubjectFacts,
} from '../src/shared/access/collaborativeAccess';
import type { AccessViewer } from '../src/shared/access/collaborativeAccess';
import { api } from './_generated/api';
import type { DataModel, Id } from './_generated/dataModel';

/** A convex-test client, anonymous or `withIdentity`. Only `query` is needed. */
type QueryClient = Pick<TestConvexForDataModel<DataModel>, 'query'>;

/** The viewer as the browser assembles them for one subject: the session's user id and their membership of the subject's Group. */
async function accessViewerFor(client: QueryClient, groupId: Id<'groups'> | null): Promise<AccessViewer> {
  const [session, membership] = await Promise.all([
    client.query(api.profiles.session, {}),
    client.query(api.groups.viewerMembership, { groupId }),
  ]);
  return session.userId === null
    ? { kind: 'anonymous' }
    : { kind: 'authenticated', userId: session.userId, membership };
}

/**
 * The faction page as a given viewer sees it: the public page combined with that viewer, exactly as `useFactionAccess` does in the browser.
 * Tests assert capabilities through this so they keep exercising the path users actually run.
 */
export async function factionPageAs(client: QueryClient, slug: string) {
  const page = await client.query(api.factions.pageBySlug, { slug });
  const [viewer, assignableGroups] = await Promise.all([
    accessViewerFor(client, page.assignedGroup?.id ?? null),
    client.query(api.groups.viewerAssignableGroups, {}),
  ]);
  return {
    ...page,
    viewerAccess: assetAccessForViewer(assetSubjectFacts('faction', page.faction, page.assignedGroup), viewer),
    assignableGroups,
  };
}

/** The rulebook reader as a given viewer sees it: the public page plus its edit and delete links, combined as `useRulebookReader` does. */
export async function rulebookReaderAs(
  client: QueryClient,
  locator: FunctionArgs<typeof api.rulebooks.readerDelivery>
) {
  const page = await client.query(api.rulebooks.readerDelivery, locator);
  if (!page) {
    return null;
  }
  const viewer = await accessViewerFor(client, page.access.assignedGroup?.id ?? null);
  const subject = { owner_id: page.access.rulesetOwnerId, is_deleted: false };
  const { capabilities } = assetAccessForViewer(
    assetSubjectFacts('ruleset', subject, page.access.assignedGroup),
    viewer
  );
  return { ...page, canEdit: capabilities.edit, canDelete: capabilities.delete };
}

/** The ruleset detail page as a given viewer sees it, combined as `useRulesetDetailPage` does. Null for an unknown slug. */
export async function rulesetDetailPageAs(client: QueryClient, slug: string) {
  const page = await client.query(api.rulesets.detailPage, { slug });
  if (!page) {
    return null;
  }
  const [viewer, assignableGroups] = await Promise.all([
    accessViewerFor(client, page.assignedGroup?.id ?? null),
    client.query(api.groups.viewerAssignableGroups, {}),
  ]);
  return {
    ...page,
    viewerAccess: assetAccessForViewer(assetSubjectFacts('ruleset', page.ruleset, page.assignedGroup), viewer),
    assignableGroups,
  };
}

/** One asset's page as a given viewer sees it, combined as `useAssetPage` does. Null for an unknown address. */
export async function assetPageAs(client: QueryClient, args: FunctionArgs<typeof api.assets.page>) {
  const page = await client.query(api.assets.page, args);
  if (!page) {
    return null;
  }
  const [viewer, assignableGroups, session] = await Promise.all([
    accessViewerFor(client, page.assignedGroup?.id ?? null),
    client.query(api.groups.viewerAssignableGroups, {}),
    client.query(api.profiles.session, {}),
  ]);
  const subject = { owner_id: page.ownerId, is_deleted: false };
  return {
    ...page,
    viewerAccess: assetAccessForViewer(assetSubjectFacts('asset', subject, page.assignedGroup), viewer),
    assignableGroups,
    canConvertToCustom: page.convertibleToCustom && session.isAdmin,
  };
}

/** The Group page as a given viewer sees it: its access and each roster member's moderation capabilities, combined as `useGroupDetailBySlug` does. */
export async function groupPageAs(client: QueryClient, slug: string) {
  const page = await client.query(api.groups.detailPage, { slug });
  const viewerAccess = groupAccessForViewer(
    groupSubjectFacts(page.group),
    await accessViewerFor(client, page.group._id)
  );
  return {
    ...page,
    viewerAccess,
    roster: page.roster.map((member) => ({ ...member, capabilities: groupRosterCapabilities(viewerAccess, member) })),
  };
}

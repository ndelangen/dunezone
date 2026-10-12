/**
 * The collaborative access rules: facts in, capabilities out.
 * Shared by the server, whose mutation gates enforce them, and the browser, which combines a page's public facts with the viewer's own to decide what to show.
 * One copy is what keeps the two from drifting;
 * the server's answer is the authoritative one.
 */

/** What a viewer's membership of a Group is, as the client sees it. `StoredMembershipState` is the same plus the state the database keeps and the client never receives. */
export type MembershipState = 'none' | 'pending' | 'active';

/**
 * Membership as the `group_members` row stores it, including `removed`.
 * `evaluateCollaborativeAccess` flattens `removed` to `none` for membership-derived capabilities.
 */
export type StoredMembershipState = MembershipState | 'removed';

/** The viewer as a page is told about them: signed in with a membership, or anonymous. Never carries an id, which is why it is safe on the wire. */
type PublicViewer = { kind: 'anonymous' } | { kind: 'authenticated'; membership: MembershipState };

type GroupSummaryShape = { id: string; name: string; slug: string };

export type ViewerFacts =
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; membership: StoredMembershipState; ownsSubject: boolean };

/** The inputs the rules need about a Group. */
export type GroupAccessFacts = {
  kind: 'group';
  group: { eligible: boolean };
  viewer: ViewerFacts;
};

/** The inputs the rules need about a faction, ruleset or asset. The three share one shape because they share one set of rules. */
export type AssetAccessFacts<GroupSummary extends GroupSummaryShape = GroupSummaryShape> = {
  kind: 'faction' | 'ruleset' | 'asset';
  resource: { available: boolean };
  group: { eligible: boolean; summary: GroupSummary | null };
  viewer: ViewerFacts;
};

/** Everything `evaluateCollaborativeAccess` reads. Build one of these and the answer is a pure function of it. */
export type CollaborativeAccessFacts<GroupSummary extends GroupSummaryShape = GroupSummaryShape> =
  | GroupAccessFacts
  | AssetAccessFacts<GroupSummary>;

export type GroupViewerAccess = {
  kind: 'group';
  viewer: PublicViewer;
  capabilities: { requestMembership: boolean; rename: boolean; delete: boolean; addMember: boolean };
};

export type AssetViewerAccess<
  Kind extends 'faction' | 'ruleset' | 'asset' = 'faction' | 'ruleset' | 'asset',
  GroupSummary extends GroupSummaryShape = GroupSummaryShape,
> = {
  kind: Kind;
  assignedGroup: GroupSummary | null;
  viewer: PublicViewer;
  capabilities: { requestMembership: boolean; edit: boolean; rename: boolean; changeGroup: boolean; delete: boolean };
};

/**
 * The base subject capability matrix: facts in, capabilities out.
 * Pure, with no `ctx` and no database, which is what lets the rules be tested exhaustively without one and run in the browser.
 * A server caller wanting an answer about a real subject calls `loadCollaborativeAccess` or a `require*` gate;
 * gates load and evaluate access before applying operation-specific checks, rather than building facts by hand.
 */
export function evaluateCollaborativeAccess(facts: GroupAccessFacts): GroupViewerAccess;
export function evaluateCollaborativeAccess<GroupSummary extends GroupSummaryShape>(
  facts: AssetAccessFacts<GroupSummary>
): AssetViewerAccess<AssetAccessFacts['kind'], GroupSummary>;
export function evaluateCollaborativeAccess<GroupSummary extends GroupSummaryShape>(
  facts: CollaborativeAccessFacts<GroupSummary>
): GroupViewerAccess | AssetViewerAccess<AssetAccessFacts['kind'], GroupSummary>;
export function evaluateCollaborativeAccess<GroupSummary extends GroupSummaryShape>(
  facts: CollaborativeAccessFacts<GroupSummary>
): GroupViewerAccess | AssetViewerAccess<AssetAccessFacts['kind'], GroupSummary> {
  const authenticated = facts.viewer.kind === 'authenticated';
  const membership: MembershipState | null =
    facts.viewer.kind === 'authenticated'
      ? facts.viewer.membership === 'removed'
        ? 'none'
        : facts.viewer.membership
      : null;
  const activeMember = authenticated && membership === 'active';
  const owner = facts.viewer.kind === 'authenticated' && facts.viewer.ownsSubject;
  const viewer: PublicViewer =
    facts.viewer.kind === 'anonymous' ? facts.viewer : { kind: 'authenticated', membership: membership ?? 'none' };
  const requestMembership = authenticated && membership === 'none' && facts.group.eligible;

  if (facts.kind === 'group') {
    return {
      kind: 'group',
      viewer,
      capabilities: {
        requestMembership,
        rename: owner && facts.group.eligible,
        delete: owner && facts.group.eligible,
        addMember: activeMember && facts.group.eligible,
      },
    };
  }

  return {
    kind: facts.kind,
    assignedGroup: facts.group.summary,
    viewer,
    capabilities: {
      requestMembership: requestMembership && facts.resource.available,
      edit: facts.resource.available && (owner || (activeMember && facts.group.eligible)),
      /*
       * Renaming is the owner's alone for every kind, because a name change is an identity change:
       * it recalculates the slug, moves the public URL, and leaves no redirect behind (#605).
       * An active collaborator keeps `edit` and loses only this, which is why the two are separate
       * capabilities rather than one.
       */
      rename: facts.resource.available && owner,
      changeGroup: facts.resource.available && owner,
      delete: facts.resource.available && owner,
    },
  };
}

/**
 * The viewer, as the browser knows them for one subject: anonymous, or signed in with their user id and their membership of the subject's Group.
 * Combined with a page's public facts, it answers what the page would once have computed per viewer on the server.
 */
export type AccessViewer =
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; userId: string; membership: StoredMembershipState };

/** The public facts a faction, ruleset or asset page carries for its subject. */
export type AssetSubjectFacts<GroupSummary extends GroupSummaryShape = GroupSummaryShape> = {
  kind: AssetAccessFacts['kind'];
  ownerId: string;
  available: boolean;
  /** The subject's Group when it resolves to a live one, else null. */
  assignedGroup: GroupSummary | null;
};

/** A faction, ruleset or asset's capabilities for this viewer: the same rules the mutation gates apply, run on the page's public facts. */
export function assetAccessForViewer<GroupSummary extends GroupSummaryShape>(
  subject: AssetSubjectFacts<GroupSummary>,
  viewer: AccessViewer
): AssetViewerAccess<AssetAccessFacts['kind'], GroupSummary> {
  return evaluateCollaborativeAccess({
    kind: subject.kind,
    resource: { available: subject.available },
    group: { eligible: subject.assignedGroup !== null, summary: subject.assignedGroup },
    viewer:
      viewer.kind === 'anonymous'
        ? viewer
        : { kind: 'authenticated', membership: viewer.membership, ownsSubject: viewer.userId === subject.ownerId },
  });
}

/* oxlint-disable-next-line no-restricted-imports -- The group's page mark is a rounded square filling its header slot, not a name disc. */
import { Avatar, Box, Group, Stack, Text } from '@mantine/core';
import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { FormError } from '@ui/block/FormError';
import { Notice } from '@ui/block/Notice';
import { PageIdentity } from '@ui/block/PageIdentity';
import type { PageIdentityStanding } from '@ui/block/PageIdentity';
import { Section } from '@ui/block/Section';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { formatStableDate } from '@ui/content/dates';
import { EmptyNote } from '@ui/content/EmptyNote';
import { FactionLink } from '@ui/content/FactionLink';
import { NameDisc, nameDiscColor } from '@ui/content/NameDisc';
import { ProfileLink } from '@ui/content/ProfileLink';
import { RulesetLink } from '@ui/content/RulesetLink';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssignPopover } from '@ui/control/AssignPopover';
import { HoldAction } from '@ui/control/HoldAction';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  BookOpen,
  Check,
  Crown,
  LogOut,
  MailPlus,
  Pencil,
  Plus,
  Undo2,
  UserPlus,
  UserRoundMinus,
  UsersRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { isPublicPageNotFound, loadPublicPage } from '@db/core/publicPage';
import { useSetFactionGroup } from '@db/factions';
import type { FactionEntry } from '@db/factions';
import { loadGroupDetailBySlug, useDeleteGroup, useGroupDetailBySlug } from '@db/groups';
import type { GroupDetailPageData, MembershipState } from '@db/groups';
import { useGroupInvitations, useGroupMembershipWorkflow, useViewerInvitationForGroup } from '@db/members';
import type { GroupInvitation, ViewerInvitation } from '@db/members';
import { useSetRulesetGroup } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { OwnedFactionAssignPicker, OwnedRulesetAssignPicker } from '@app/pickers/GroupAssignPicker';
import type { OwnedAssignItem } from '@app/pickers/GroupAssignPicker';
import { GroupInvitePicker } from '@app/pickers/GroupInvitePicker';
import { redirectFromFormerAddress } from '@app/routes/formerAddress';
import { publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { detailError } from '@app/routes/routeStates';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';

import styles from './index.module.css';

type RosterEntry = GroupDetailPageData['roster'][number];

const backToProfiles = <PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>;

export const Route = createFileRoute('/_app/groups/$groupSlug/')({
  ssr: true,
  loader: async ({ params, location }) => {
    const groupDetail = await loadPublicPage(loadGroupDetailBySlug(params.groupSlug));
    if (!groupDetail) {
      await redirectFromFormerAddress({ kind: 'group', slug: params.groupSlug }, location);
      throw notFound();
    }
    return { groupDetail };
  },
  errorComponent: detailError({ noun: 'group', isMissing: isPublicPageNotFound, back: backToProfiles }),
  head: ({ loaderData, params, match }) =>
    publicPageHead({
      name: loaderData?.groupDetail.group.name ?? 'Group',
      kind: loaderData ? 'Group' : undefined,
      pathname: `/groups/${encodeURIComponent(params.groupSlug)}`,
      description: loaderData
        ? `Members: ${loaderData.groupDetail.roster.filter((member) => member.status === 'active').length}. Factions: ${loaderData.groupDetail.factions.length}. Rulesets: ${loaderData.groupDetail.rulesets.length}. Explore this Group on Dune Zone.`
        : '',
      social: { shape: 'round' },
      trail: [],
      match,
    }),
  component: GroupDetail,
});

function GroupDetail() {
  const { groupSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const groupData = useGroupDetailBySlug(groupSlug, { initialData: loaderData.groupDetail });

  /* The failed case is the route's `errorComponent` now, since the branch that used to sit here
     could not run. What is left is the wait, which every other page in the tree spells this way:
     the skeleton grid was the only one of its kind and announced nothing to a reader who cannot
     see it. */
  const page = groupData.data;
  useLivePageTitle(page?.group.name, 'Group');
  if (!page) {
    return (
      <RoutePending size="compact" title="Group" back={backToProfiles} loading="Loading group">
        The group details are still loading.
      </RoutePending>
    );
  }
  return <GroupDetailPage page={page} />;
}

/** The invitation this Group holds for the viewer: undefined until both the viewer and their invitation have arrived. */
function invitationFor(
  page: GroupDetailPageData,
  membershipStatus: string,
  read: { data: ViewerInvitation | null | undefined; isPending: boolean }
): ViewerInvitation | null | undefined {
  if (!page.viewerResolved || read.isPending) {
    return undefined;
  }
  return membershipStatus === 'none' ? (read.data ?? null) : null;
}

/**
 * The page itself, one component however the viewer resolves, so the shared page is never torn down and rebuilt when the viewer arrives.
 * The viewer's own invitation is read for everyone: a signed-out viewer is answered with null and no read.
 */
function GroupDetailPage({ page }: { page: GroupDetailPageData }) {
  const { groupSlug } = Route.useParams();
  const navigate = Route.useNavigate();
  const membershipWorkflow = useGroupMembershipWorkflow();
  const deleteGroup = useDeleteGroup();
  const setFactionGroup = useSetFactionGroup();
  const setRulesetGroup = useSetRulesetGroup();
  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);
  const viewerInvitationRead = useViewerInvitationForGroup(page.group._id);

  const group = page.group;
  const groupId = group._id;
  /* The page is the same for everyone and usually settles first; controls wait for the viewer, as the anonymous capabilities grant none. */
  const viewerAccess = page.viewerAccess;
  const capabilities = page.viewerResolved ? viewerAccess.capabilities : undefined;
  const ownerProfile = page.owner;
  const membershipStatus = viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';
  const isOwner = viewerAccess.capabilities.rename;
  const isActiveMember = page.viewerResolved && membershipStatus === 'active';
  /*
   * On the wire an invited viewer reads as `none`; the invitation itself says otherwise.
   * Undefined while the viewer or their invitations are on their way, so the toolbar offers nothing the answer may take back.
   */
  const viewerInvitation = invitationFor(page, membershipStatus, viewerInvitationRead);
  const factions = page.factions;
  const rulesets = page.rulesets;
  const roster = page.roster;

  const activeMembers = roster.filter((member) => member.status === 'active');
  const pendingMembers = roster.filter((member) => member.status === 'pending');

  const membersModerationBusy =
    membershipWorkflow.approve.isPending || membershipWorkflow.reject.isPending || membershipWorkflow.remove.isPending;
  const membersModerationError =
    membershipWorkflow.approve.error?.message ??
    membershipWorkflow.reject.error?.message ??
    membershipWorkflow.remove.error?.message ??
    null;

  /* No question: the trigger itself is held five seconds, the same commitment every destructive action asks for. */
  /* Which membership's removal is in flight, so only the held row's trigger reads as busy; cleared during render when the round trip ends, the search box's pattern. */
  if (!membershipWorkflow.remove.isPending && removingMembershipId !== null) {
    setRemovingMembershipId(null);
  }
  const handleRemoveMember = (membershipId: string) => {
    setRemovingMembershipId(membershipId);
    void membershipWorkflow.remove.run(membershipId).catch(() => undefined);
  };

  const handleDeleteGroup = () => {
    deleteGroup.mutate(groupId, {
      onSuccess: () => void navigate({ to: '/profiles' }),
    });
  };

  const handleAssignFaction = async (item: OwnedAssignItem) => {
    await setFactionGroup.mutateAsync({ id: item.id, groupId });
  };

  const handleAssignRuleset = async (item: OwnedAssignItem) => {
    await setRulesetGroup.mutateAsync({ id: item.id, groupId });
  };

  const standing = isOwner
    ? { tone: 'brand' as const, label: 'Owner', icon: <Crown size={12} aria-hidden /> }
    : viewerInvitation
      ? { tone: 'pending' as const, label: 'Invited' }
      : membershipStandings[membershipStatus];
  const headerStats = [
    {
      key: 'members',
      icon: <UsersRound size={17} aria-hidden />,
      value: activeMembers.length,
      label: `${activeMembers.length} ${activeMembers.length === 1 ? 'member' : 'members'}`,
    },
    {
      key: 'factions',
      icon: <TopicIcon topic="factions" size={17} />,
      value: factions.length,
      label: `${factions.length} ${factions.length === 1 ? 'faction' : 'factions'} maintained`,
    },
    {
      key: 'rulesets',
      icon: <TopicIcon topic="rulesets" size={17} />,
      value: rulesets.length,
      label: `${rulesets.length} ${rulesets.length === 1 ? 'ruleset' : 'rulesets'} maintained`,
    },
  ];
  /* The viewer's own commands share one failure line, the newest of them, since each clears the others when it runs. */
  const viewerCommandError = (
    [
      ['Membership request failed', membershipWorkflow.request],
      ['Could not withdraw the request', membershipWorkflow.withdraw],
      ['Could not accept the invitation', membershipWorkflow.accept],
      ['Could not decline the invitation', membershipWorkflow.decline],
      ['Could not leave the group', membershipWorkflow.leave],
    ] as const
  ).find(([, command]) => command.error);
  const viewerCommandBusy =
    membershipWorkflow.request.isPending ||
    membershipWorkflow.withdraw.isPending ||
    membershipWorkflow.accept.isPending ||
    membershipWorkflow.decline.isPending;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity
          title={group.name}
          media={
            <Avatar
              radius="md"
              size="100%"
              variant="filled"
              color={nameDiscColor(group.name)}
              className={styles.groupAvatar}
              /* The name is the h1 beside it, so the letter is not read out again. Inline, so the size outranks Mantine's own placeholder rule whatever the stylesheet order. */
              aria-hidden
              styles={{ placeholder: { fontSize: '48cqi', fontWeight: 600 } }}
            >
              {group.name.trim().slice(0, 1).toUpperCase()}
            </Avatar>
          }
          breadcrumb={<Breadcrumb to="/profiles">Profiles</Breadcrumb>}
          maintainers={{
            label: 'Owned by',
            owner: ownerProfile?.slug
              ? { slug: ownerProfile.slug, name: ownerProfile.username, image: ownerProfile.avatar_url }
              : null,
          }}
          standing={standing}
          stats={headerStats}
        />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left label="Navigation">
            {capabilities?.rename ? (
              <IconAction
                label="Edit group"
                emphasis="standard"
                intent="neutral"
                size="lg"
                renderRoot={(rootProps) => <Link {...rootProps} to="/groups/$groupSlug/edit" params={{ groupSlug }} />}
                icon={<Pencil size={17} aria-hidden />}
              />
            ) : null}
          </Toolbar.Left>
          <Toolbar.Right label="Group actions">
            <Toolbar.Cluster kind="access">
              {capabilities?.requestMembership && viewerInvitation === null ? (
                <IconAction
                  label="Request membership"
                  emphasis="standard"
                  intent="neutral"
                  size="lg"
                  loading={membershipWorkflow.request.isPending}
                  disabled={viewerCommandBusy}
                  onClick={() => void membershipWorkflow.request.run(groupId).catch(() => undefined)}
                  icon={<UserPlus size={17} aria-hidden />}
                />
              ) : null}
              {page.viewerResolved && membershipStatus === 'pending' ? (
                <IconAction
                  label="Withdraw request"
                  emphasis="standard"
                  intent="neutral"
                  size="lg"
                  loading={membershipWorkflow.withdraw.isPending}
                  disabled={viewerCommandBusy}
                  onClick={() => void membershipWorkflow.withdraw.run(groupId).catch(() => undefined)}
                  icon={<Undo2 size={17} aria-hidden />}
                />
              ) : null}
            </Toolbar.Cluster>
            <Toolbar.Cluster kind="discard">
              {isActiveMember && !isOwner ? (
                <HoldAction
                  label="Leave group"
                  verb="leave"
                  pending={membershipWorkflow.leave.isPending}
                  onConfirm={() => void membershipWorkflow.leave.run(groupId).catch(() => undefined)}
                  icon={<LogOut size={17} aria-hidden />}
                />
              ) : null}
              {capabilities?.delete ? (
                <HoldAction label="Delete group" pending={deleteGroup.isPending} onConfirm={handleDeleteGroup} />
              ) : null}
            </Toolbar.Cluster>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        {viewerCommandError || deleteGroup.error || viewerInvitation ? (
          <Stack gap="lg" mb="lg">
            {viewerCommandError ? (
              <FormError title={viewerCommandError[0]}>{viewerCommandError[1].error?.message ?? ''}</FormError>
            ) : null}
            <ActionError subject="Group" verb="delete" error={deleteGroup.error} />
            {viewerInvitation ? (
              <ViewerInvitationNotice
                invitation={viewerInvitation}
                busy={viewerCommandBusy}
                accepting={membershipWorkflow.accept.isPending}
                declining={membershipWorkflow.decline.isPending}
                onAccept={() => void membershipWorkflow.accept.run(groupId).catch(() => undefined)}
                onDecline={() => void membershipWorkflow.decline.run(groupId).catch(() => undefined)}
              />
            ) : null}
          </Stack>
        ) : null}
        <Box className={styles.twoColumnGrid}>
          <Stack gap="xl">
            <Section
              icon={<FremenIcon />}
              title="Factions maintained"
              action={
                isActiveMember ? (
                  <FactionAssignPicker
                    disabled={setFactionGroup.isPending}
                    currentGroupId={groupId}
                    currentGroupName={group.name}
                    onAssign={handleAssignFaction}
                  />
                ) : undefined
              }
            >
              <FactionList factions={factions} />
            </Section>
            <Section
              icon={<BookOpen size={18} aria-hidden />}
              title="Rulesets maintained"
              action={
                isActiveMember ? (
                  <RulesetAssignPicker
                    disabled={setRulesetGroup.isPending}
                    currentGroupId={groupId}
                    currentGroupName={group.name}
                    onAssign={handleAssignRuleset}
                  />
                ) : undefined
              }
            >
              <RulesetList rulesets={rulesets} />
            </Section>
          </Stack>

          <Stack gap="lg">
            {membersModerationError && <FormError title="Moderation failed">{membersModerationError}</FormError>}

            <PendingRequestsPanel
              pendingMembers={pendingMembers}
              moderationBusy={membersModerationBusy}
              onApprove={(membershipId) => void membershipWorkflow.approve.run(membershipId).catch(() => undefined)}
              onReject={(membershipId) => void membershipWorkflow.reject.run(membershipId).catch(() => undefined)}
            />

            {isActiveMember ? (
              <InvitationsPanel
                groupId={groupId}
                moderationBusy={membersModerationBusy}
                onWithdraw={(membershipId) => void membershipWorkflow.reject.run(membershipId).catch(() => undefined)}
              />
            ) : null}

            <Card
              icon={<UsersRound size={18} aria-hidden />}
              title="Members"
              action={
                isActiveMember ? (
                  <InviteMemberPopover
                    groupId={groupId}
                    disabled={membershipWorkflow.add.isPending}
                    onInvite={(userId) => membershipWorkflow.add.run({ groupId, userId })}
                  />
                ) : undefined
              }
            >
              <MemberRoster
                members={activeMembers}
                moderationBusy={membersModerationBusy}
                onApprove={(membershipId) => void membershipWorkflow.approve.run(membershipId).catch(() => undefined)}
                onReject={(membershipId) => void membershipWorkflow.reject.run(membershipId).catch(() => undefined)}
                onRemove={handleRemoveMember}
                removingMembershipId={removingMembershipId}
              />
            </Card>
          </Stack>
        </Box>
      </PageLayout.Content>
    </PageLayout>
  );
}

/* Page-local presentation helpers. */

type AssignPickerProps = {
  disabled: boolean;
  currentGroupId: string;
  currentGroupName: string;
  onAssign: (item: OwnedAssignItem) => Promise<void>;
};

/**
 * The one thing neither the kit nor the picker may own: asking before a move.
 * An asset already maintained by another group leaves that group when it is added here, which is a consequence only this page knows about, so the question lives here, and backing out resolves `false` to leave the pane open.
 */
async function confirmThenAssign(
  item: OwnedAssignItem,
  currentGroupName: string,
  onAssign: (item: OwnedAssignItem) => Promise<void>
): Promise<boolean | void> {
  if (item.groupId !== null) {
    const confirmed = window.confirm(
      `Move "${item.name}" from "${item.groupName}" to "${currentGroupName}"? It will no longer be maintained by "${item.groupName}".`
    );
    if (!confirmed) {
      return false;
    }
  }
  await onAssign(item);
}

/** The shell both add-buttons wear, so the two directions cannot drift apart in their words. */
function AddOwnedPopover({ noun, disabled, children }: { noun: string; disabled: boolean; children: ReactNode }) {
  return (
    <AssignPopover
      noun={noun}
      size="sm"
      icon={<Plus size={14} aria-hidden />}
      title={`Add a ${noun}`}
      triggerLabel={`Add a ${noun} you own`}
      disabled={disabled}
    >
      {children}
    </AssignPopover>
  );
}

/**
 * Only mounted for active members (see call sites): the owned-factions query requires authentication, so it must not be called for anonymous, pending, or non-member viewers.
 * The query itself now starts when the pane opens rather than when the page does, because the picker is mounted by the shell's own gate;
 * the lists staying separate from `detailPage` is still #348/#182's decision.
 */
function FactionAssignPicker({ disabled, currentGroupId, currentGroupName, onAssign }: AssignPickerProps) {
  return (
    <AddOwnedPopover noun="faction" disabled={disabled}>
      <OwnedFactionAssignPicker
        currentGroupId={currentGroupId}
        onPick={(item) => confirmThenAssign(item, currentGroupName, onAssign)}
      />
    </AddOwnedPopover>
  );
}

/** Same rules as `FactionAssignPicker`: only mount this for active members. */
function RulesetAssignPicker({ disabled, currentGroupId, currentGroupName, onAssign }: AssignPickerProps) {
  return (
    <AddOwnedPopover noun="ruleset" disabled={disabled}>
      <OwnedRulesetAssignPicker
        currentGroupId={currentGroupId}
        onPick={(item) => confirmThenAssign(item, currentGroupName, onAssign)}
      />
    </AddOwnedPopover>
  );
}

/**
 * The way in for someone who has not asked: an active member picks them and an invitation goes out.
 * Only mounted for active members (see call site): the candidate query answers nobody else.
 * The popover's title says what the pane is;
 * the trigger says what the reader is about to do.
 */
function InviteMemberPopover({
  groupId,
  disabled,
  onInvite,
}: {
  groupId: string;
  disabled: boolean;
  onInvite: (userId: string) => Promise<void>;
}) {
  return (
    <AssignPopover
      noun="person"
      size="sm"
      icon={<MailPlus size={14} aria-hidden />}
      title="Invite someone"
      triggerLabel="Invite a member"
      disabled={disabled}
    >
      <GroupInvitePicker groupId={groupId} onPick={(candidate) => onInvite(candidate.userId)} />
    </AssignPopover>
  );
}

/** The Group asked the viewer in: the one place the page says so, with both answers beside it. */
function ViewerInvitationNotice({
  invitation,
  busy,
  accepting,
  declining,
  onAccept,
  onDecline,
}: {
  invitation: ViewerInvitation;
  busy: boolean;
  accepting: boolean;
  declining: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Notice
      tone="info"
      title="You are invited to this group"
      action={
        <Group gap="xs" wrap="nowrap">
          <LabeledAction
            intent="positive"
            emphasis="strong"
            icon={<Check size={16} aria-hidden />}
            busy={accepting}
            disabledReason={busy && !accepting ? 'Another membership change is in progress.' : undefined}
            onClick={onAccept}
          >
            Accept invitation
          </LabeledAction>
          <LabeledAction
            intent="negative"
            icon={<X size={16} aria-hidden />}
            busy={declining}
            disabledReason={busy && !declining ? 'Another membership change is in progress.' : undefined}
            onClick={onDecline}
          >
            Decline invitation
          </LabeledAction>
        </Group>
      }
    >
      {invitation.invitedBy?.username
        ? `${invitation.invitedBy.username} invited you on ${formatStableDate(invitation.invitedAt)}. Accepting lists you as a member.`
        : `Invited on ${formatStableDate(invitation.invitedAt)}. Accepting lists you as a member.`}
    </Notice>
  );
}

/**
 * The invitations this Group has open, for its active members, each with the way to take it back.
 * Its own component so the query mounts only for an active member, whom alone the server answers.
 */
function InvitationsPanel({
  groupId,
  moderationBusy,
  onWithdraw,
}: {
  groupId: string;
  moderationBusy: boolean;
  onWithdraw: (membershipId: string) => void;
}) {
  const invitations = useGroupInvitations(groupId);
  const rows = invitations.data ?? [];
  if (rows.length === 0) {
    return null;
  }
  return (
    <Notice tone="neutral" title={`Invitations sent (${rows.length})`}>
      <Stack gap="xs">
        {rows.map((invitation) => (
          <InvitationRow
            key={invitation.membershipId}
            invitation={invitation}
            moderationBusy={moderationBusy}
            onWithdraw={onWithdraw}
          />
        ))}
      </Stack>
    </Notice>
  );
}

function InvitationRow({
  invitation,
  moderationBusy,
  onWithdraw,
}: {
  invitation: GroupInvitation;
  moderationBusy: boolean;
  onWithdraw: (membershipId: string) => void;
}) {
  return (
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Group gap="xs" wrap="nowrap" miw={0}>
        <ProfileLink slug={invitation.user.slug} name={invitation.user.username} image={invitation.user.avatar_url} />
        <Text size="xs" c="dimmed">
          invited {formatStableDate(invitation.invitedAt)}
        </Text>
      </Group>
      <IconAction
        label="Withdraw invitation"
        tooltip="Withdraw"
        intent="negative"
        emphasis="standard"
        disabled={moderationBusy}
        onClick={() => onWithdraw(invitation.membershipId)}
        icon={<X size={15} aria-hidden />}
      />
    </Group>
  );
}

/**
 * Dune-specific crest for the Factions section.
 * These faction emblem files ship without root width/height (see `Token`'s `StrokedUse` pattern).
 * Reference the `#root` fragment via `<use>` inside an own viewBox rather than a plain `<img src>`, which renders as a broken 0x0 image.
 */
function FremenIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <use href="/vector/emblem/fremen.svg#root" width={100} height={100} fill="currentColor" />
    </svg>
  );
}

/** The viewer's own relation to the group, when there is one worth naming; a stranger is the default and gets none. */
const membershipStandings: Record<MembershipState, PageIdentityStanding | null> = {
  active: { tone: 'positive', label: 'Active member' },
  pending: { tone: 'pending', label: 'Pending approval' },
  none: null,
};

function MemberRow({
  entry,
  moderationBusy,
  onApprove,
  onReject,
  onRemove,
  removingMembershipId = null,
}: {
  entry: RosterEntry;
  moderationBusy: boolean;
  onApprove: (membershipId: string) => void;
  onReject: (membershipId: string) => void;
  onRemove?: (membershipId: string) => void;
  removingMembershipId?: string | null;
}) {
  const isPending = entry.status === 'pending';
  return (
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Group gap="xs" wrap="nowrap" miw={0}>
        {entry.user.slug ? (
          <ProfileLink slug={entry.user.slug} name={entry.user.username} image={entry.user.avatar_url} />
        ) : (
          /* No slug means no profile to link to, so the avatar has no anchor to live inside. */
          <>
            <NameDisc src={entry.user.avatar_url} name={entry.user.username ?? '?'} size={26} />
            <Text size="sm">{entry.user.username ?? entry.user.id}</Text>
          </>
        )}
        {isPending && (
          <Text size="xs" c="dimmed">
            requested {formatStableDate(entry.requestedAt)}
          </Text>
        )}
      </Group>
      <Group gap={4} wrap="nowrap">
        {entry.capabilities.approve && (
          <IconAction
            label="Approve membership"
            tooltip="Approve"
            intent="positive"
            emphasis="standard"
            disabled={moderationBusy}
            onClick={() => onApprove(entry.membershipId)}
            icon={<Check size={15} aria-hidden />}
          />
        )}
        {entry.capabilities.reject && (
          <IconAction
            label="Decline membership"
            tooltip="Decline"
            intent="negative"
            emphasis="standard"
            disabled={moderationBusy}
            onClick={() => onReject(entry.membershipId)}
            icon={<X size={15} aria-hidden />}
          />
        )}
        {entry.capabilities.remove && onRemove && (
          <HoldAction
            label="Remove member"
            verb="remove"
            size="md"
            pending={removingMembershipId === entry.membershipId}
            disabled={moderationBusy && removingMembershipId !== entry.membershipId}
            onConfirm={() => onRemove(entry.membershipId)}
            icon={<UserRoundMinus size={15} aria-hidden />}
          />
        )}
      </Group>
    </Group>
  );
}

function MemberRoster({
  members,
  moderationBusy,
  onApprove,
  onReject,
  onRemove,
  removingMembershipId,
}: {
  members: RosterEntry[];
  moderationBusy: boolean;
  onApprove: (membershipId: string) => void;
  onReject: (membershipId: string) => void;
  onRemove: (membershipId: string) => void;
  /** The one row whose removal is in flight; the others stay disabled-but-quiet rather than all spinning. */
  removingMembershipId: string | null;
}) {
  if (members.length === 0) {
    return <EmptyNote>No members yet.</EmptyNote>;
  }
  return (
    <Stack gap="xs">
      {members.map((entry) => (
        <MemberRow
          key={entry.membershipId}
          entry={entry}
          moderationBusy={moderationBusy}
          onApprove={onApprove}
          onReject={onReject}
          onRemove={onRemove}
          removingMembershipId={removingMembershipId}
        />
      ))}
    </Stack>
  );
}

/** Pending membership requests, pulled out of the plain roster into their own highlighted, conditional panel. */
function PendingRequestsPanel({
  pendingMembers,
  moderationBusy,
  onApprove,
  onReject,
}: {
  pendingMembers: RosterEntry[];
  moderationBusy: boolean;
  onApprove: (membershipId: string) => void;
  onReject: (membershipId: string) => void;
}) {
  if (pendingMembers.length === 0) {
    return null;
  }
  return (
    <Notice tone="caution" title={`Pending requests (${pendingMembers.length})`}>
      <Stack gap="xs">
        {pendingMembers.map((entry) => (
          <MemberRow
            key={entry.membershipId}
            entry={entry}
            moderationBusy={moderationBusy}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </Stack>
    </Notice>
  );
}

function FactionList({ factions }: { factions: FactionEntry[] }) {
  return factions.length === 0 ? (
    <EmptyNote>No factions in this group yet.</EmptyNote>
  ) : (
    <Stack gap="xs" align="flex-start">
      {factions.map((faction) => (
        <FactionLink
          key={faction._id}
          slug={faction.slug}
          name={faction.data.name}
          emblem={faction.data.emblem}
          background={faction.data.background}
        />
      ))}
    </Stack>
  );
}

function RulesetList({ rulesets }: { rulesets: RulesetEntry[] }) {
  return rulesets.length === 0 ? (
    <EmptyNote>No rulesets in this group yet.</EmptyNote>
  ) : (
    <Stack gap="xs" align="flex-start">
      {rulesets.map((ruleset) => (
        <RulesetLink key={ruleset._id} slug={ruleset.slug} name={ruleset.name} image={ruleset.coverThumbUrl} />
      ))}
    </Stack>
  );
}

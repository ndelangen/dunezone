import { Alert, Anchor, Avatar, Badge, Box, Button, Divider, Group, Stack, Text } from '@mantine/core';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { PageTitle } from '@ui/block/PageTitle';
import { formatRelativeDate } from '@ui/content/dates';
import { FactionLink } from '@ui/content/FactionLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { RulesetLink } from '@ui/content/RulesetLink';
import { AssignPopover } from '@ui/control/AssignPopover';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, BookOpen, Check, Crown, Pencil, Plus, UserPlus, UserRoundMinus, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { useSetFactionGroup } from '@db/factions';
import type { FactionEntry } from '@db/factions';
import { loadGroupDetailBySlug, useDeleteGroup, useGroupDetailBySlug } from '@db/groups';
import type { GroupDetailPageData, MembershipState } from '@db/groups';
import { useGroupMembershipWorkflow } from '@db/members';
import { useSetRulesetGroup } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { OwnedFactionAssignPicker, OwnedRulesetAssignPicker } from '@app/pickers/GroupAssignPicker';
import type { OwnedAssignItem } from '@app/pickers/GroupAssignPicker';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

type RosterEntry = GroupDetailPageData['roster'][number];

export const Route = createFileRoute('/_app/groups/$groupSlug/')({
  loader: async ({ params }) => {
    const groupDetail = await loadGroupDetailBySlug(params.groupSlug);
    return { groupDetail };
  },
  errorComponent: GroupDetailError,
  component: GroupDetailPage,
});

const backToProfiles = <PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>;

/**
 * The frame for a load that failed, most often a slug naming no group.
 * A failed Convex query throws to this route boundary, so the live-query result has no separate error state.
 */
function GroupDetailError({ error }: ErrorComponentProps) {
  return (
    <PageMessage title="Group" back={backToProfiles}>
      <LoadError title="Group could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

function GroupDetailPage() {
  const { groupSlug } = Route.useParams();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const groupData = useGroupDetailBySlug(groupSlug, { initialData: loaderData.groupDetail });
  const membershipWorkflow = useGroupMembershipWorkflow();
  const deleteGroup = useDeleteGroup();
  const setFactionGroup = useSetFactionGroup();
  const setRulesetGroup = useSetRulesetGroup();

  /* The failed case is the route's `errorComponent` now, since the branch that used to sit here
     could not run. What is left is the wait, which every other page in the tree spells this way:
     the skeleton grid was the only one of its kind and announced nothing to a reader who cannot
     see it. */
  const page = groupData.data;
  if (!page) {
    return (
      <PageMessage title="Group" back={backToProfiles}>
        <LoadPending title="Loading group">The group details are still loading.</LoadPending>
      </PageMessage>
    );
  }

  const group = page.group;
  const groupId = group._id;
  const viewerAccess = page.viewerAccess;
  const ownerProfile = page.owner;
  const membershipStatus = viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';
  const isOwner = viewerAccess.capabilities.rename;
  const isActiveMember = membershipStatus === 'active';
  const isAnonymous = viewerAccess.viewer.kind === 'anonymous';
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
  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);
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

  return (
    <PageLayout>
      <PageLayout.Header>
        <PageTitle title={group.name} />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <>
          <Toolbar>
            <Toolbar.Left>
              <Group gap="xs" wrap="wrap" role="group" aria-label="Navigation and editing">
                <IconAction
                  label="Back to profiles"
                  variant="light"
                  color="gray"
                  size="lg"
                  renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
                  icon={<ArrowLeft size={17} aria-hidden />}
                />
                {viewerAccess.capabilities.rename ? (
                  <IconAction
                    label="Edit group settings"
                    variant="light"
                    color="gray"
                    size="lg"
                    renderRoot={(rootProps) => (
                      <Link {...rootProps} to="/groups/$groupSlug/edit" params={{ groupSlug }} />
                    )}
                    icon={<Pencil size={17} aria-hidden />}
                  />
                ) : null}
                {viewerAccess.capabilities.delete ? (
                  <ConfirmDeleteAction
                    label="Delete group"
                    pending={deleteGroup.isPending}
                    onConfirm={handleDeleteGroup}
                  />
                ) : null}
              </Group>
            </Toolbar.Left>
            <Toolbar.Right>
              <RequestMembershipButton
                canRequestMembership={viewerAccess.capabilities.requestMembership}
                isAnonymous={isAnonymous}
                requestPending={membershipWorkflow.request.isPending}
                requestError={membershipWorkflow.request.error?.message ?? null}
                onRequestMembership={() => void membershipWorkflow.request.run(groupId).catch(() => undefined)}
              />
            </Toolbar.Right>
          </Toolbar>
          {deleteGroup.error && (
            <Text size="sm" c="red" role="alert" mt="xs">
              Delete failed: {deleteGroup.error.message}
            </Text>
          )}
        </>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Box className={styles.twoColumnGrid}>
          <Stack gap="lg">
            <Card
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
            </Card>
            <Card
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
            </Card>
          </Stack>

          <Stack gap="lg">
            <Card icon={<Crown size={18} aria-hidden />} title="Stewardship">
              <Stack gap="sm">
                <OwnerLine ownerProfile={ownerProfile} createdBy={group.created_by} />
                <Divider />
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Your membership
                  </Text>
                  <MembershipStatusBadge status={membershipStatus} isOwner={isOwner} />
                </Group>
              </Stack>
            </Card>

            {membersModerationError && (
              <Alert color="red" variant="light" title="Moderation failed" role="alert">
                {membersModerationError}
              </Alert>
            )}

            <PendingRequestsPanel
              pendingMembers={pendingMembers}
              moderationBusy={membersModerationBusy}
              onApprove={(membershipId) => void membershipWorkflow.approve.run(membershipId).catch(() => undefined)}
              onReject={(membershipId) => void membershipWorkflow.reject.run(membershipId).catch(() => undefined)}
            />

            <Card icon={<UsersRound size={18} aria-hidden />} title={`Members (${activeMembers.length})`}>
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
 * the lists staying separate from `detailBySlug` is still #348/#182's decision.
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
 * Dune-specific crest for the Factions section.
 * These faction logo files ship without root width/height (see `Token`'s `StrokedUse` pattern).
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
      style={{ display: 'block', flex: '0 0 auto', color: 'var(--color-link)' }}
    >
      <use href="/vector/logo/fremen.svg#root" width={100} height={100} fill="currentColor" />
    </svg>
  );
}

function OwnerLine({ ownerProfile, createdBy }: { ownerProfile: GroupDetailPageData['owner']; createdBy: string }) {
  return ownerProfile?.slug ? (
    <ProfileLink slug={ownerProfile.slug} name={ownerProfile.username} image={ownerProfile.avatar_url} />
  ) : (
    <Text size="sm">{ownerProfile?.username ?? createdBy}</Text>
  );
}

const membershipBadges: Record<MembershipState, { color: string; label: string }> = {
  active: { color: 'green', label: 'Active member' },
  pending: { color: 'yellow', label: 'Pending approval' },
  none: { color: 'gray', label: 'Not a member' },
};

function MembershipStatusBadge({ status, isOwner }: { status: MembershipState; isOwner: boolean }) {
  if (isOwner) {
    return (
      <Badge color="dune" variant="light" leftSection={<Crown size={12} aria-hidden />}>
        Owner
      </Badge>
    );
  }
  const badge = membershipBadges[status];
  return (
    <Badge color={badge.color} variant="light">
      {badge.label}
    </Badge>
  );
}

function RequestMembershipButton({
  canRequestMembership,
  isAnonymous,
  requestPending,
  requestError,
  onRequestMembership,
}: {
  canRequestMembership: boolean;
  isAnonymous: boolean;
  requestPending: boolean;
  requestError: string | null;
  onRequestMembership: () => void;
}) {
  return (
    <Stack gap={4}>
      {isAnonymous && (
        <Text size="sm" c="dimmed">
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to request
          membership.
        </Text>
      )}
      {canRequestMembership && (
        <Button
          type="button"
          variant="filled"
          leftSection={<UserPlus size={16} aria-hidden />}
          loading={requestPending}
          onClick={onRequestMembership}
          w="fit-content"
        >
          Request membership
        </Button>
      )}
      {requestError && (
        <Text size="sm" c="red" role="alert">
          {requestError}
        </Text>
      )}
    </Stack>
  );
}

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
            <Avatar src={entry.user.avatar_url} radius="xl" size="sm" />
            <Text size="sm">{entry.user.username ?? entry.user.id}</Text>
          </>
        )}
        {isPending && (
          <Text size="xs" c="dimmed">
            requested {formatRelativeDate(entry.requestedAt)}
          </Text>
        )}
      </Group>
      <Group gap={4} wrap="nowrap">
        {entry.capabilities.approve && (
          <IconAction
            label="Approve membership"
            tooltip="Approve"
            color="confirm"
            variant="light"
            disabled={moderationBusy}
            onClick={() => onApprove(entry.membershipId)}
            icon={<Check size={15} aria-hidden />}
          />
        )}
        {entry.capabilities.reject && (
          <IconAction
            label="Decline membership"
            tooltip="Decline"
            color="red"
            variant="light"
            disabled={moderationBusy}
            onClick={() => onReject(entry.membershipId)}
            icon={<X size={15} aria-hidden />}
          />
        )}
        {entry.capabilities.remove && onRemove && (
          <ConfirmDeleteAction
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
    return (
      <Text size="sm" c="dimmed">
        No members yet.
      </Text>
    );
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
    <Alert color="yellow" variant="light" title={`Pending requests (${pendingMembers.length})`}>
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
    </Alert>
  );
}

function FactionList({ factions }: { factions: FactionEntry[] }) {
  return factions.length === 0 ? (
    <Text size="sm" c="dimmed">
      No factions in this group yet.
    </Text>
  ) : (
    <Stack gap="xs" align="flex-start">
      {factions.map((faction) => (
        <FactionLink
          key={faction._id}
          slug={faction.slug}
          name={faction.data.name}
          logo={faction.data.logo}
          background={faction.data.background}
        />
      ))}
    </Stack>
  );
}

function RulesetList({ rulesets }: { rulesets: RulesetEntry[] }) {
  return rulesets.length === 0 ? (
    <Text size="sm" c="dimmed">
      No rulesets in this group yet.
    </Text>
  ) : (
    <Stack gap="xs" align="flex-start">
      {rulesets.map((ruleset) => (
        <RulesetLink key={ruleset._id} slug={ruleset.slug} name={ruleset.name} image={ruleset.coverThumbUrl} />
      ))}
    </Stack>
  );
}

import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { formatRelativeDate } from '@ui/content/dates';
import { ProfileLink } from '@ui/content/ProfileLink';
import { AssignPopover } from '@ui/control/AssignPopover';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Crown,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  UserRoundMinus,
  UsersRound,
  X,
} from 'lucide-react';

import { useFactionsOwnedForGroupAssign, useSetFactionGroup } from '@db/factions';
import type { FactionEntry } from '@db/factions';
import { loadGroupDetailBySlug, useDeleteGroup, useGroupDetailBySlug } from '@db/groups';
import type { GroupDetailPageData, MembershipState } from '@db/groups';
import { useGroupMembershipWorkflow } from '@db/members';
import { useRulesetsOwnedForGroupAssign, useUpdateRuleset } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';

import styles from './index.module.css';

/**
 * The structural minimum both owned-asset queries satisfy. Their validator-derived row types remain
 * the authority for the shape; this names only the part the picker reads.
 */
type AssetAssignOption = {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
};

type RosterEntry = GroupDetailPageData['roster'][number];

export const Route = createFileRoute('/_app/groups/$groupSlug/')({
  loader: async ({ params }) => {
    const groupDetail = await loadGroupDetailBySlug(params.groupSlug);
    return { groupDetail };
  },
  component: GroupDetailPage,
});

function GroupDetailPage() {
  const { groupSlug } = Route.useParams();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const groupData = useGroupDetailBySlug(groupSlug, { initialData: loaderData.groupDetail });
  const membershipWorkflow = useGroupMembershipWorkflow();
  const deleteGroup = useDeleteGroup();
  const setFactionGroup = useSetFactionGroup();
  const updateRuleset = useUpdateRuleset();

  if (groupData.isError) {
    return (
      <PageLayout header={<Title order={1}>Group</Title>}>
        <Surface padding="xl">
          <Alert color="red" title="Group could not be loaded" role="alert">
            <Text size="sm">This group may have been deleted, or the link may be incorrect.</Text>
          </Alert>
        </Surface>
      </PageLayout>
    );
  }

  const page = groupData.data;
  if (!page) {
    return (
      <PageLayout header={<Title order={1}>Group</Title>}>
        <Box className={styles.twoColumnGrid}>
          <Stack gap="lg">
            <Skeleton height={140} radius="md" />
            <Skeleton height={140} radius="md" />
          </Stack>
          <Stack gap="lg">
            <Skeleton height={160} radius="md" />
            <Skeleton height={160} radius="md" />
          </Stack>
        </Box>
      </PageLayout>
    );
  }

  const group = page.group;
  const groupId = group._id;
  const viewerAccess = page.viewerAccess;
  const ownerProfile = page.owner;
  const membershipStatus =
    viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';
  const isOwner = viewerAccess.capabilities.rename;
  const isActiveMember = membershipStatus === 'active';
  const isAnonymous = viewerAccess.viewer.kind === 'anonymous';
  const factions = page.factions;
  const rulesets = page.rulesets;
  const roster = page.roster;

  const activeMembers = roster.filter((member) => member.status === 'active');
  const pendingMembers = roster.filter((member) => member.status === 'pending');

  const membersModerationBusy =
    membershipWorkflow.approve.isPending ||
    membershipWorkflow.reject.isPending ||
    membershipWorkflow.remove.isPending;
  const membersModerationError =
    membershipWorkflow.approve.error?.message ??
    membershipWorkflow.reject.error?.message ??
    membershipWorkflow.remove.error?.message ??
    null;

  const handleRemoveMember = (membershipId: string) => {
    if (!window.confirm('Remove this member from the group?')) {
      return;
    }
    void membershipWorkflow.remove.run(membershipId).catch(() => undefined);
  };

  const handleDeleteGroup = () => {
    if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) {
      return;
    }
    deleteGroup.mutate(groupId, {
      onSuccess: () => void navigate({ to: '/profiles' }),
    });
  };

  const handleAssignFaction = async (item: AssetAssignOption) => {
    await setFactionGroup.mutateAsync({ id: item.id, groupId });
  };

  const handleAssignRuleset = async (item: AssetAssignOption) => {
    await updateRuleset.mutateAsync({
      id: item.id,
      input: { name: item.name },
      groupId,
    });
  };

  return (
    <PageLayout
      header={<Title order={1}>{group.name}</Title>}
      toolbar={
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
                    color="dune"
                    size="lg"
                    renderRoot={(rootProps) => (
                      <Link {...rootProps} to="/groups/$groupSlug/edit" params={{ groupSlug }} />
                    )}
                    icon={<Pencil size={17} aria-hidden />}
                  />
                ) : null}
                {viewerAccess.capabilities.delete ? (
                  <IconAction
                    label="Delete group"
                    variant="light"
                    color="red"
                    size="lg"
                    disabled={deleteGroup.isPending}
                    onClick={handleDeleteGroup}
                    icon={<Trash2 size={17} aria-hidden />}
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
                onRequestMembership={() =>
                  void membershipWorkflow.request.run(groupId).catch(() => undefined)
                }
              />
            </Toolbar.Right>
          </Toolbar>
          {deleteGroup.error && (
            <Text size="sm" c="red" role="alert" mt="xs">
              Delete failed: {deleteGroup.error.message}
            </Text>
          )}
        </>
      }
    >
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
                  disabled={updateRuleset.isPending}
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
            onApprove={(membershipId) =>
              void membershipWorkflow.approve.run(membershipId).catch(() => undefined)
            }
            onReject={(membershipId) =>
              void membershipWorkflow.reject.run(membershipId).catch(() => undefined)
            }
          />

          <Card
            icon={<UsersRound size={18} aria-hidden />}
            title={`Members (${activeMembers.length})`}
          >
            <MemberRoster
              members={activeMembers}
              moderationBusy={membersModerationBusy}
              onApprove={(membershipId) =>
                void membershipWorkflow.approve.run(membershipId).catch(() => undefined)
              }
              onReject={(membershipId) =>
                void membershipWorkflow.reject.run(membershipId).catch(() => undefined)
              }
              onRemove={handleRemoveMember}
            />
          </Card>
        </Stack>
      </Box>
    </PageLayout>
  );
}

/* ---------------------------------------------------------------------- */
/* Page-local presentation helpers.                                       */
/* ---------------------------------------------------------------------- */

type AssignPickerProps = {
  disabled: boolean;
  currentGroupId: string;
  currentGroupName: string;
  onAssign: (item: AssetAssignOption) => Promise<void>;
};

/**
 * Labels this viewer's own factions or rulesets for `AssignPopover`, and owns the one thing the kit
 * control must not: asking before a move. An asset already maintained by another group leaves that
 * group when it is added here, which is a consequence only this page knows about — so the
 * confirmation lives here, and backing out resolves `false` to leave the popover open.
 */
function OwnedAssetPicker({
  noun,
  items,
  loading,
  disabled,
  currentGroupId,
  currentGroupName,
  onAssign,
}: AssignPickerProps & {
  noun: string;
  items: AssetAssignOption[];
  loading: boolean;
}) {
  const assignable = items.filter((item) => item.groupId !== currentGroupId);
  const byId = new Map(assignable.map((item) => [item.id, item]));

  return (
    <AssignPopover
      noun={noun}
      size="sm"
      icon={<Plus size={14} aria-hidden />}
      title={`Add a ${noun}`}
      triggerLabel={`Add a ${noun} you own`}
      searchLabel={`Search your ${noun}s`}
      submitLabel="Add to this group"
      descriptionLines={[
        `Only ${noun}s you own are listed.`,
        'Moving one already in another group needs confirmation.',
      ]}
      disabled={disabled}
      loading={loading}
      options={assignable.map((item) => ({
        value: item.id,
        label: item.groupName
          ? `${item.name} — currently in ${item.groupName}`
          : `${item.name} — unassigned`,
      }))}
      emptyMessage={
        items.length === 0
          ? `You don't own any ${noun}s yet.`
          : `All your ${noun}s are already in this group.`
      }
      onAssign={async (value) => {
        const item = byId.get(value);
        if (!item) {
          return false;
        }
        if (item.groupId !== null) {
          const confirmed = window.confirm(
            `Move "${item.name}" from "${item.groupName}" to "${currentGroupName}"? It will no longer be maintained by "${item.groupName}".`
          );
          if (!confirmed) {
            return false;
          }
        }
        await onAssign(item);
      }}
    />
  );
}

/**
 * Only mounted for active members (see call sites): the owned-factions query requires
 * authentication, so it must not be called for anonymous, pending, or non-member viewers.
 * Subscribing to a second query beyond the page query deviates from DD-013's default; that was
 * decided explicitly for this picker (issues #348/#182: keep `detailBySlug` unchanged, expose the
 * viewer-scoped owned lists as their own queries).
 */
function FactionAssignPicker(props: AssignPickerProps) {
  const ownedFactionsQuery = useFactionsOwnedForGroupAssign();
  return (
    <OwnedAssetPicker
      noun="faction"
      items={ownedFactionsQuery.data ?? []}
      loading={ownedFactionsQuery.isLoading}
      {...props}
    />
  );
}

/** Same rules as `FactionAssignPicker`: only mount this for active members. */
function RulesetAssignPicker(props: AssignPickerProps) {
  const ownedRulesetsQuery = useRulesetsOwnedForGroupAssign();
  return (
    <OwnedAssetPicker
      noun="ruleset"
      items={ownedRulesetsQuery.data ?? []}
      loading={ownedRulesetsQuery.isLoading}
      {...props}
    />
  );
}

/**
 * Dune-specific crest for the Factions section. These faction logo files ship without root
 * width/height (see `Token`'s `StrokedUse` pattern) — reference the `#root` fragment via `<use>`
 * inside an own viewBox rather than a plain `<img src>`, which renders as a broken 0x0 image.
 */
function FremenIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto', color: 'var(--mantine-color-dune-8)' }}
    >
      <use href="/vector/logo/fremen.svg#root" width={100} height={100} fill="currentColor" />
    </svg>
  );
}

function OwnerLine({
  ownerProfile,
  createdBy,
}: {
  ownerProfile: GroupDetailPageData['owner'];
  createdBy: string;
}) {
  return ownerProfile?.slug ? (
    <ProfileLink
      slug={ownerProfile.slug}
      username={ownerProfile.username}
      avatar_url={ownerProfile.avatar_url}
    />
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
          <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>
            Log in
          </Anchor>{' '}
          to request membership.
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
}: {
  entry: RosterEntry;
  moderationBusy: boolean;
  onApprove: (membershipId: string) => void;
  onReject: (membershipId: string) => void;
  onRemove?: (membershipId: string) => void;
}) {
  const isPending = entry.status === 'pending';
  return (
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Group gap="xs" wrap="nowrap" miw={0}>
        <Avatar src={entry.user.avatar_url} radius="xl" size="sm" />
        {entry.user.slug ? (
          <ProfileLink slug={entry.user.slug} username={entry.user.username} avatar_url={null} />
        ) : (
          <Text size="sm">{entry.user.username ?? entry.user.id}</Text>
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
          <IconAction
            label="Remove member"
            color="red"
            variant="light"
            disabled={moderationBusy}
            onClick={() => onRemove(entry.membershipId)}
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
}: {
  members: RosterEntry[];
  moderationBusy: boolean;
  onApprove: (membershipId: string) => void;
  onReject: (membershipId: string) => void;
  onRemove: (membershipId: string) => void;
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
        />
      ))}
    </Stack>
  );
}

/**
 * Pending membership requests, pulled out of the plain roster into their own highlighted,
 * conditional panel.
 */
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
    <Stack gap={6}>
      {factions.map((faction) => (
        <Anchor
          key={faction._id}
          fw={600}
          renderRoot={(rootProps) => (
            <Link {...rootProps} to="/factions/$factionId" params={{ factionId: faction.slug }} />
          )}
        >
          {faction.data.name}
        </Anchor>
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
    <Stack gap={6}>
      {rulesets.map((ruleset) => (
        <Anchor
          key={ruleset._id}
          fw={600}
          renderRoot={(rootProps) => (
            <Link
              {...rootProps}
              to="/rulesets/$rulesetSlug"
              params={{ rulesetSlug: ruleset.slug }}
            />
          )}
        >
          {ruleset.name}
        </Anchor>
      ))}
    </Stack>
  );
}

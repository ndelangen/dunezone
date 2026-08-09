import {
  ActionIcon,
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Crown,
  Pencil,
  Trash2,
  UserPlus,
  UserRoundMinus,
  UsersRound,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { useFactionsOwnedForGroupAssign, useSetFactionGroup } from '@db/factions';
import type { FactionEntry } from '@db/factions';
import { loadGroupDetailBySlug, useDeleteGroup, useGroupDetailBySlug } from '@db/groups';
import type { GroupDetailPageData } from '@db/groups';
import { useGroupMembershipWorkflow } from '@db/members';
import { useRulesetsOwnedForGroupAssign, useUpdateRuleset } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { viewerActionsFor } from '@app/access/viewerActions';
import { AssetAssignPopover } from '@app/components/groups/AssetAssignPopover';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';
import { formatRelativeDate } from '@app/utils/formatRelativeDate';

import styles from './index.module.css';

type RosterEntry = GroupDetailPageData['roster'][number];
type MembershipStatus = ReturnType<typeof viewerActionsFor>['membershipStatus'];

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
  const ownedFactionsQuery = useFactionsOwnedForGroupAssign();
  const ownedRulesetsQuery = useRulesetsOwnedForGroupAssign();

  if (groupData.isError) {
    return (
      <PageLayout header={<Title order={1}>Group</Title>}>
        <Paper withBorder p="xl" radius="md">
          <Alert color="red" title="Group could not be loaded" role="alert">
            <Text size="sm">This group may have been deleted, or the link may be incorrect.</Text>
          </Alert>
        </Paper>
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
  const { membershipStatus } = viewerActionsFor(viewerAccess);
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

  const handleAssignFaction = async (factionId: string) => {
    await setFactionGroup.mutateAsync({ id: factionId, groupId });
  };

  const handleAssignRuleset = async (rulesetId: string) => {
    const owned = ownedRulesetsQuery.data?.find((item) => item.id === rulesetId);
    await updateRuleset.mutateAsync({
      id: rulesetId,
      input: { name: owned?.name ?? '' },
      groupId,
    });
  };

  return (
    <PageLayout
      header={<Title order={1}>{group.name}</Title>}
      toolbar={
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Group gap="xs" wrap="wrap" role="group" aria-label="Navigation and editing">
              <Tooltip label="Back to profiles">
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="lg"
                  aria-label="Back to profiles"
                  renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
                >
                  <ArrowLeft size={17} aria-hidden />
                </ActionIcon>
              </Tooltip>
              {viewerAccess.capabilities.rename ? (
                <Tooltip label="Edit group settings">
                  <ActionIcon
                    variant="light"
                    color="dune"
                    size="lg"
                    aria-label="Edit group settings"
                    renderRoot={(rootProps) => (
                      <Link {...rootProps} to="/groups/$groupSlug/edit" params={{ groupSlug }} />
                    )}
                  >
                    <Pencil size={17} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              ) : null}
              {viewerAccess.capabilities.delete ? (
                <Tooltip label="Delete group">
                  <ActionIcon
                    type="button"
                    variant="light"
                    color="red"
                    size="lg"
                    aria-label="Delete group"
                    disabled={deleteGroup.isPending}
                    onClick={handleDeleteGroup}
                  >
                    <Trash2 size={17} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              ) : null}
            </Group>
            <RequestMembershipButton
              canRequestMembership={viewerAccess.capabilities.requestMembership}
              isAnonymous={isAnonymous}
              requestPending={membershipWorkflow.request.isPending}
              requestError={membershipWorkflow.request.error?.message ?? null}
              onRequestMembership={() =>
                void membershipWorkflow.request.run(groupId).catch(() => undefined)
              }
            />
          </Group>
        </Paper>
      }
    >
      <Box className={styles.twoColumnGrid}>
        <Stack gap="lg">
          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              <Group justify="space-between" wrap="nowrap">
                <SectionHeading icon={<FremenIcon />}>Factions maintained</SectionHeading>
                {isActiveMember && (
                  <AssetAssignPopover
                    kind="faction"
                    disabled={setFactionGroup.isPending}
                    currentGroupId={groupId}
                    currentGroupName={group.name}
                    ownedItems={ownedFactionsQuery.data ?? []}
                    onAssign={handleAssignFaction}
                  />
                )}
              </Group>
              <FactionList factions={factions} />
            </Stack>
          </Card>
          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              <Group justify="space-between" wrap="nowrap">
                <SectionHeading icon={<BookOpen size={18} aria-hidden />}>
                  Rulesets maintained
                </SectionHeading>
                {isActiveMember && (
                  <AssetAssignPopover
                    kind="ruleset"
                    disabled={updateRuleset.isPending}
                    currentGroupId={groupId}
                    currentGroupName={group.name}
                    ownedItems={ownedRulesetsQuery.data ?? []}
                    onAssign={handleAssignRuleset}
                  />
                )}
              </Group>
              <RulesetList rulesets={rulesets} />
            </Stack>
          </Card>
        </Stack>

        <Stack gap="lg">
          <Card withBorder padding="lg" radius="md">
            <Stack gap="sm">
              <SectionHeading icon={<Crown size={18} aria-hidden />}>Stewardship</SectionHeading>
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

          <PendingRequestsPanel
            pendingMembers={pendingMembers}
            moderationBusy={membersModerationBusy}
            moderationError={membersModerationError}
            onApprove={(membershipId) =>
              void membershipWorkflow.approve.run(membershipId).catch(() => undefined)
            }
            onReject={(membershipId) =>
              void membershipWorkflow.reject.run(membershipId).catch(() => undefined)
            }
          />

          <Card withBorder padding="lg" radius="md">
            <Stack gap="sm">
              <SectionHeading icon={<UsersRound size={18} aria-hidden />}>
                Members ({activeMembers.length})
              </SectionHeading>
              <MemberRoster
                members={activeMembers}
                moderationBusy={membersModerationBusy}
                moderationError={membersModerationError}
                onApprove={(membershipId) =>
                  void membershipWorkflow.approve.run(membershipId).catch(() => undefined)
                }
                onReject={(membershipId) =>
                  void membershipWorkflow.reject.run(membershipId).catch(() => undefined)
                }
                onRemove={handleRemoveMember}
              />
            </Stack>
          </Card>
        </Stack>
      </Box>
    </PageLayout>
  );
}

/* ---------------------------------------------------------------------- */
/* Page-local presentation helpers.                                       */
/* ---------------------------------------------------------------------- */

function SectionHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Title order={3} size="h4">
        {children}
      </Title>
      {icon}
    </Group>
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

const membershipBadgeColors: Record<MembershipStatus, string> = {
  active: 'green',
  pending: 'yellow',
  none: 'gray',
};

function membershipBadgeColor(status: MembershipStatus) {
  return membershipBadgeColors[status];
}

const membershipBadgeLabels: Record<MembershipStatus, string> = {
  active: 'Active member',
  pending: 'Pending approval',
  none: 'Not a member',
};

function membershipBadgeLabel(status: MembershipStatus) {
  return membershipBadgeLabels[status];
}

function MembershipStatusBadge({
  status,
  isOwner,
}: {
  status: MembershipStatus;
  isOwner: boolean;
}) {
  if (isOwner) {
    return (
      <Badge color="dune" variant="light" leftSection={<Crown size={12} aria-hidden />}>
        Owner
      </Badge>
    );
  }
  return (
    <Badge color={membershipBadgeColor(status)} variant="light">
      {membershipBadgeLabel(status)}
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
  onRemove: (membershipId: string) => void;
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
          <Tooltip label="Approve">
            <ActionIcon
              aria-label="Approve membership"
              color="confirm"
              variant="light"
              disabled={moderationBusy}
              onClick={() => onApprove(entry.membershipId)}
            >
              <Check size={15} aria-hidden />
            </ActionIcon>
          </Tooltip>
        )}
        {entry.capabilities.reject && (
          <Tooltip label="Decline">
            <ActionIcon
              aria-label="Decline membership"
              color="red"
              variant="light"
              disabled={moderationBusy}
              onClick={() => onReject(entry.membershipId)}
            >
              <X size={15} aria-hidden />
            </ActionIcon>
          </Tooltip>
        )}
        {entry.capabilities.remove && (
          <Tooltip label="Remove member">
            <ActionIcon
              aria-label="Remove member"
              color="red"
              variant="light"
              disabled={moderationBusy}
              onClick={() => onRemove(entry.membershipId)}
            >
              <UserRoundMinus size={15} aria-hidden />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
  );
}

function MemberRoster({
  members,
  moderationBusy,
  moderationError,
  onApprove,
  onReject,
  onRemove,
}: {
  members: RosterEntry[];
  moderationBusy: boolean;
  moderationError: string | null;
  onApprove: (membershipId: string) => void;
  onReject: (membershipId: string) => void;
  onRemove: (membershipId: string) => void;
}) {
  return (
    <Stack gap="sm">
      {members.length === 0 ? (
        <Text size="sm" c="dimmed">
          No members yet.
        </Text>
      ) : (
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
      )}
      {moderationError && (
        <Text size="sm" c="red" role="alert">
          {moderationError}
        </Text>
      )}
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
  moderationError,
  onApprove,
  onReject,
}: {
  pendingMembers: RosterEntry[];
  moderationBusy: boolean;
  moderationError: string | null;
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
            onRemove={() => undefined}
          />
        ))}
        {moderationError && (
          <Text size="sm" c="red" role="alert">
            {moderationError}
          </Text>
        )}
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

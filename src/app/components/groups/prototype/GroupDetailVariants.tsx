/**
 * PROTOTYPE ONLY — six structurally different desktop concepts for the Group detail page.
 * Wayfinder ticket: https://github.com/ndelangen/dunezone/issues/183
 * Throwaway: capture the winner into the real route, then drop this file and its switcher.
 */
import {
  Accordion,
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import {
  BookOpen,
  Check,
  Crown,
  Layers3,
  UserPlus,
  UserRoundMinus,
  UsersRound,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { FactionEntry, OwnedFactionForGroupAssign } from '@db/factions';
import type { OwnedRulesetForGroupAssign, RulesetEntry } from '@db/rulesets';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { formatRelativeDate } from '@app/utils/formatRelativeDate';

import type { GroupRosterEntry } from '../../../../../convex/lib/collaborativeAccess';
import type { MembershipState } from '../../../../../convex/lib/collaborativeAccess';
import type { ProfileSummary } from '../../../../../convex/lib/collaborativeAccessValidators';
import { AssetAssignPopover } from './AssetAssignPopover';
import styles from './GroupDetailVariants.module.css';

export interface GroupDetailVariantProps {
  groupId: string;
  groupName: string;
  ownerProfile: ProfileSummary | null;
  createdBy: string;
  membershipStatus: MembershipState;
  isAnonymous: boolean;
  isOwner: boolean;
  isActiveMember: boolean;
  canRequestMembership: boolean;
  requestPending: boolean;
  requestError: string | null;
  onRequestMembership: () => void;
  activeMembers: GroupRosterEntry[];
  pendingMembers: GroupRosterEntry[];
  moderationBusy: boolean;
  moderationError: string | null;
  onApprove: (membershipId: string) => void;
  onReject: (membershipId: string) => void;
  onRemove: (membershipId: string) => void;
  factions: FactionEntry[];
  rulesets: RulesetEntry[];
  ownedFactions: OwnedFactionForGroupAssign[];
  ownedRulesets: OwnedRulesetForGroupAssign[];
  assignFactionBusy: boolean;
  assignRulesetBusy: boolean;
  onAssignFaction: (factionId: string) => Promise<void>;
  onAssignRuleset: (rulesetId: string) => Promise<void>;
}

export type VariantKey = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

export const VARIANT_LIST: ReadonlyArray<{ key: VariantKey; name: string }> = [
  { key: 'a', name: 'Stewardship sidebar' },
  { key: 'b', name: 'Tabbed overview' },
  { key: 'c', name: 'Roster-first hub' },
  { key: 'd', name: 'Dashboard tiles' },
  { key: 'e', name: 'Sticky rail + accordion' },
  { key: 'f', name: 'Showcase banner' },
];

/* ---------------------------------------------------------------------- */
/* Shared, presentation-only building blocks (not layout) reused by every  */
/* variant so capability logic (who can approve/reject/remove/request)    */
/* stays in one place while each variant is free to arrange it its way.   */
/* ---------------------------------------------------------------------- */

function membershipBadgeColor(status: MembershipState) {
  return status === 'active' ? 'green' : status === 'pending' ? 'yellow' : 'gray';
}

function membershipBadgeLabel(status: MembershipState) {
  return status === 'active' ? 'Active member' : status === 'pending' ? 'Pending approval' : 'Not a member';
}

function MembershipStatusBadge({ status, isOwner = false }: { status: MembershipState; isOwner?: boolean }) {
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

function OwnerLine({
  ownerProfile,
  createdBy,
}: {
  ownerProfile: ProfileSummary | null;
  createdBy: string;
}) {
  return ownerProfile?.slug ? (
    <ProfileLink slug={ownerProfile.slug} username={ownerProfile.username} avatar_url={ownerProfile.avatar_url} />
  ) : (
    <Text size="sm">{ownerProfile?.username ?? createdBy}</Text>
  );
}

export function RequestMembershipButton({
  canRequestMembership,
  isAnonymous,
  requestPending,
  requestError,
  onRequestMembership,
  variant = 'light',
}: Pick<
  GroupDetailVariantProps,
  'canRequestMembership' | 'isAnonymous' | 'requestPending' | 'requestError' | 'onRequestMembership'
> & { variant?: 'light' | 'filled' }) {
  return (
    <Stack gap={4}>
      {isAnonymous && (
        <Text size="sm" c="dimmed">
          <Anchor to="/auth/login">Log in</Anchor> to request membership.
        </Text>
      )}
      {canRequestMembership && (
        <Button
          type="button"
          variant={variant}
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

function Anchor({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} style={{ color: 'var(--mantine-color-dune-7)', fontWeight: 600 }}>
      {children}
    </Link>
  );
}

function MemberRow({
  entry,
  moderationBusy,
  onApprove,
  onReject,
  onRemove,
}: {
  entry: GroupRosterEntry;
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
  activeMembers,
  pendingMembers,
  moderationBusy,
  moderationError,
  onApprove,
  onReject,
  onRemove,
}: Pick<
  GroupDetailVariantProps,
  | 'activeMembers'
  | 'pendingMembers'
  | 'moderationBusy'
  | 'moderationError'
  | 'onApprove'
  | 'onReject'
  | 'onRemove'
>) {
  const rows = [...activeMembers, ...pendingMembers];
  return (
    <Stack gap="sm">
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No members yet.
        </Text>
      ) : (
        <Stack gap="xs">
          {rows.map((entry) => (
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

function FactionList({ factions }: { factions: FactionEntry[] }) {
  return factions.length === 0 ? (
    <Text size="sm" c="dimmed">
      No factions in this group yet.
    </Text>
  ) : (
    <Stack gap={6}>
      {factions.map((faction) => (
        <Anchor key={faction._id} to={`/factions/${faction.slug}`}>
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
        <Anchor key={ruleset._id} to={`/rulesets/${ruleset.slug}`}>
          {ruleset.name}
        </Anchor>
      ))}
    </Stack>
  );
}

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

/** Pending membership requests, pulled out of the plain roster into their own highlighted, conditional panel. */
function PendingRequestsPanel({
  pendingMembers,
  moderationBusy,
  moderationError,
  onApprove,
  onReject,
  onRemove,
}: Pick<
  GroupDetailVariantProps,
  'pendingMembers' | 'moderationBusy' | 'moderationError' | 'onApprove' | 'onReject' | 'onRemove'
>) {
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
            onRemove={onRemove}
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

/* ---------------------------------------------------------------------- */
/* Variant A — Stewardship sidebar: creations lead a two-column layout,   */
/* membership + roster live in a slim aside (mirrors the ruleset detail   */
/* page's primary/aside split).                                          */
/* ---------------------------------------------------------------------- */

export function VariantA(props: GroupDetailVariantProps) {
  return (
    <Box className={styles.twoColumnGrid}>
      <Stack gap="lg">
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
              <SectionHeading icon={<FremenIcon />}>Factions maintained</SectionHeading>
              {props.isActiveMember && (
                <AssetAssignPopover
                  kind="faction"
                  disabled={props.assignFactionBusy}
                  currentGroupId={props.groupId}
                  currentGroupName={props.groupName}
                  ownedItems={props.ownedFactions}
                  onAssign={props.onAssignFaction}
                />
              )}
            </Group>
            <FactionList factions={props.factions} />
          </Stack>
        </Card>
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
              <SectionHeading icon={<BookOpen size={18} aria-hidden />}>Rulesets maintained</SectionHeading>
              {props.isActiveMember && (
                <AssetAssignPopover
                  kind="ruleset"
                  disabled={props.assignRulesetBusy}
                  currentGroupId={props.groupId}
                  currentGroupName={props.groupName}
                  ownedItems={props.ownedRulesets}
                  onAssign={props.onAssignRuleset}
                />
              )}
            </Group>
            <RulesetList rulesets={props.rulesets} />
          </Stack>
        </Card>
      </Stack>
      <Stack gap="lg">
        <Card withBorder padding="lg" radius="md">
          <Stack gap="sm">
            <SectionHeading icon={<Crown size={18} aria-hidden />}>Stewardship</SectionHeading>
            <OwnerLine ownerProfile={props.ownerProfile} createdBy={props.createdBy} />
            <Divider />
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Your membership
              </Text>
              <MembershipStatusBadge status={props.membershipStatus} isOwner={props.isOwner} />
            </Group>
          </Stack>
        </Card>
        <PendingRequestsPanel {...props} />
        <Card withBorder padding="lg" radius="md">
          <Stack gap="sm">
            <SectionHeading icon={<UsersRound size={18} aria-hidden />}>
              Members ({props.activeMembers.length})
            </SectionHeading>
            <MemberRoster {...props} pendingMembers={[]} />
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}

/* ---------------------------------------------------------------------- */
/* Variant B — Tabbed overview: one column, single focus at a time.       */
/* ---------------------------------------------------------------------- */

export function VariantB(props: GroupDetailVariantProps) {
  return (
    <Stack gap="lg">
      <Group gap="xl">
        <Group gap={6}>
          <UsersRound size={16} aria-hidden />
          <Text size="sm" fw={600}>
            {props.activeMembers.length} member{props.activeMembers.length === 1 ? '' : 's'}
          </Text>
        </Group>
        <Group gap={6}>
          <Layers3 size={16} aria-hidden />
          <Text size="sm" fw={600}>
            {props.factions.length} faction{props.factions.length === 1 ? '' : 's'}
          </Text>
        </Group>
        <Group gap={6}>
          <BookOpen size={16} aria-hidden />
          <Text size="sm" fw={600}>
            {props.rulesets.length} ruleset{props.rulesets.length === 1 ? '' : 's'}
          </Text>
        </Group>
      </Group>
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="members">Members</Tabs.Tab>
          <Tabs.Tab value="creations">Creations</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md">
          <Card withBorder padding="lg" radius="md">
            <Stack gap="sm">
              <Box>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  Owner
                </Text>
                <OwnerLine ownerProfile={props.ownerProfile} createdBy={props.createdBy} />
              </Box>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Your membership
                </Text>
                <MembershipStatusBadge status={props.membershipStatus} />
              </Group>
              <RequestMembershipButton {...props} />
            </Stack>
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="members" pt="md">
          <Card withBorder padding="lg" radius="md">
            <MemberRoster {...props} />
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="creations" pt="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Card withBorder padding="lg" radius="md">
              <Stack gap="md">
                <SectionHeading icon={<Layers3 size={18} aria-hidden />}>Factions</SectionHeading>
                <FactionList factions={props.factions} />
              </Stack>
            </Card>
            <Card withBorder padding="lg" radius="md">
              <Stack gap="md">
                <SectionHeading icon={<BookOpen size={18} aria-hidden />}>Rulesets</SectionHeading>
                <RulesetList rulesets={props.rulesets} />
              </Stack>
            </Card>
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

/* ---------------------------------------------------------------------- */
/* Variant C — Roster-first hub: membership leads, creations follow at    */
/* equal visual weight — the inverse ordering of Variant A.               */
/* ---------------------------------------------------------------------- */

export function VariantC(props: GroupDetailVariantProps) {
  return (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" wrap="wrap">
          <Group gap="sm">
            <Text size="sm" c="dimmed">
              Owner:
            </Text>
            <OwnerLine ownerProfile={props.ownerProfile} createdBy={props.createdBy} />
          </Group>
          <Group gap="sm">
            <MembershipStatusBadge status={props.membershipStatus} />
            <RequestMembershipButton {...props} variant="filled" />
          </Group>
        </Group>
      </Paper>
      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <SectionHeading icon={<UsersRound size={18} aria-hidden />}>
            Members ({props.activeMembers.length + props.pendingMembers.length})
          </SectionHeading>
          <MemberRoster {...props} />
        </Stack>
      </Card>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <SectionHeading icon={<Layers3 size={18} aria-hidden />}>Factions</SectionHeading>
            <FactionList factions={props.factions} />
          </Stack>
        </Card>
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <SectionHeading icon={<BookOpen size={18} aria-hidden />}>Rulesets</SectionHeading>
            <RulesetList rulesets={props.rulesets} />
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

/* ---------------------------------------------------------------------- */
/* Variant D — Dashboard tiles: every section is an equally-sized widget  */
/* in a grid, rather than a column or a sequence.                         */
/* ---------------------------------------------------------------------- */

export function VariantD(props: GroupDetailVariantProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      <Card withBorder padding="lg" radius="md">
        <Stack gap="sm">
          <SectionHeading icon={<Crown size={18} aria-hidden />}>Membership</SectionHeading>
          <Box>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Owner
            </Text>
            <OwnerLine ownerProfile={props.ownerProfile} createdBy={props.createdBy} />
          </Box>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              You
            </Text>
            <MembershipStatusBadge status={props.membershipStatus} />
          </Group>
          <RequestMembershipButton {...props} />
        </Stack>
      </Card>
      <Card withBorder padding="lg" radius="md">
        <Stack gap="sm">
          <SectionHeading icon={<UsersRound size={18} aria-hidden />}>
            Members ({props.activeMembers.length})
          </SectionHeading>
          <MemberRoster {...props} />
        </Stack>
      </Card>
      <Card withBorder padding="lg" radius="md">
        <Stack gap="sm">
          <SectionHeading icon={<Layers3 size={18} aria-hidden />}>Factions</SectionHeading>
          <FactionList factions={props.factions} />
        </Stack>
      </Card>
      <Card withBorder padding="lg" radius="md">
        <Stack gap="sm">
          <SectionHeading icon={<BookOpen size={18} aria-hidden />}>Rulesets</SectionHeading>
          <RulesetList rulesets={props.rulesets} />
        </Stack>
      </Card>
    </SimpleGrid>
  );
}

/* ---------------------------------------------------------------------- */
/* Variant E — Sticky rail + accordion: identity stays pinned while every */
/* other section collapses into an accordion the visitor expands at will.*/
/* ---------------------------------------------------------------------- */

export function VariantE(props: GroupDetailVariantProps) {
  return (
    <Box className={styles.twoColumnGrid}>
      <Box className={styles.stickyAside}>
        <Card withBorder padding="lg" radius="md">
          <Stack gap="sm">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Owner
            </Text>
            <OwnerLine ownerProfile={props.ownerProfile} createdBy={props.createdBy} />
            <Divider />
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Your membership
              </Text>
              <MembershipStatusBadge status={props.membershipStatus} />
            </Group>
            <RequestMembershipButton {...props} />
          </Stack>
        </Card>
      </Box>
      <Accordion defaultValue="members" variant="separated">
        <Accordion.Item value="members">
          <Accordion.Control icon={<UsersRound size={18} aria-hidden />}>
            Members ({props.activeMembers.length + props.pendingMembers.length})
          </Accordion.Control>
          <Accordion.Panel>
            <MemberRoster {...props} />
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="factions">
          <Accordion.Control icon={<Layers3 size={18} aria-hidden />}>
            Factions ({props.factions.length})
          </Accordion.Control>
          <Accordion.Panel>
            <FactionList factions={props.factions} />
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="rulesets">
          <Accordion.Control icon={<BookOpen size={18} aria-hidden />}>
            Rulesets ({props.rulesets.length})
          </Accordion.Control>
          <Accordion.Panel>
            <RulesetList rulesets={props.rulesets} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Box>
  );
}

/* ---------------------------------------------------------------------- */
/* Variant F — Showcase banner: a unified "creations" grid mixing         */
/* factions and rulesets, membership as a banner action, members as a     */
/* horizontal chip row.                                                   */
/* ---------------------------------------------------------------------- */

type Creation = { key: string; kind: 'faction' | 'ruleset'; name: string; to: string };

export function VariantF(props: GroupDetailVariantProps) {
  const creations: Creation[] = [
    ...props.factions.map((faction) => ({
      key: `faction-${faction._id}`,
      kind: 'faction' as const,
      name: faction.data.name,
      to: `/factions/${faction.slug}`,
    })),
    ...props.rulesets.map((ruleset) => ({
      key: `ruleset-${ruleset._id}`,
      kind: 'ruleset' as const,
      name: ruleset.name,
      to: `/rulesets/${ruleset.slug}`,
    })),
  ];

  return (
    <Stack gap="xl">
      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" wrap="wrap" gap="md">
          <Group gap="sm">
            <Text size="sm" c="dimmed">
              Owned by
            </Text>
            <OwnerLine ownerProfile={props.ownerProfile} createdBy={props.createdBy} />
          </Group>
          <Group gap="sm">
            <MembershipStatusBadge status={props.membershipStatus} />
            <RequestMembershipButton {...props} variant="filled" />
          </Group>
        </Group>
      </Paper>

      <Stack gap="md">
        <SectionHeading icon={<Layers3 size={18} aria-hidden />}>
          Creations ({creations.length})
        </SectionHeading>
        {creations.length === 0 ? (
          <Text size="sm" c="dimmed">
            No factions or rulesets in this group yet.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="md">
            {creations.map((creation) => (
              <Card key={creation.key} withBorder padding="md" radius="md">
                <Stack gap={6}>
                  <Badge
                    variant="light"
                    color={creation.kind === 'faction' ? 'dune' : 'gray'}
                    w="fit-content"
                    leftSection={
                      creation.kind === 'faction' ? (
                        <Layers3 size={12} aria-hidden />
                      ) : (
                        <BookOpen size={12} aria-hidden />
                      )
                    }
                  >
                    {creation.kind === 'faction' ? 'Faction' : 'Ruleset'}
                  </Badge>
                  <Anchor to={creation.to}>{creation.name}</Anchor>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <Stack gap="md">
        <SectionHeading icon={<UsersRound size={18} aria-hidden />}>
          Members ({props.activeMembers.length})
        </SectionHeading>
        <Box className={styles.chipRow}>
          {props.activeMembers.length === 0 ? (
            <Text size="sm" c="dimmed">
              No active members yet.
            </Text>
          ) : (
            props.activeMembers.map((entry) => (
              <Tooltip key={entry.membershipId} label={entry.user.username ?? entry.user.id}>
                <Avatar src={entry.user.avatar_url} radius="xl" size="md" />
              </Tooltip>
            ))
          )}
        </Box>
        {props.pendingMembers.length > 0 && (
          <Alert color="yellow" variant="light" title="Pending requests">
            <MemberRoster
              {...props}
              activeMembers={[]}
              pendingMembers={props.pendingMembers}
            />
          </Alert>
        )}
        {props.moderationError && (
          <Text size="sm" c="red" role="alert">
            {props.moderationError}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

export const VARIANT_COMPONENTS: Record<VariantKey, (props: GroupDetailVariantProps) => ReactNode> = {
  a: VariantA,
  b: VariantB,
  c: VariantC,
  d: VariantD,
  e: VariantE,
  f: VariantF,
};

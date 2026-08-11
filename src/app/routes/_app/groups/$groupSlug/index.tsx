import { ActionIcon, Anchor, Group, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { Section } from '@ui/content/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { FormTooltip } from '@ui/input/FormTooltip';
import { Links } from '@ui/list/Links';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  Check,
  Layers3,
  Pencil,
  UserPlus,
  UserRoundMinus,
  UsersRound,
  X,
} from 'lucide-react';

import { loadGroupDetailBySlug, useGroupDetailBySlug } from '@db/groups';
import { useGroupMembershipWorkflow } from '@db/members';
import { viewerActionsFor } from '@app/access/viewerActions';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';
import { TopicIcon } from '@app/components/topics/TopicIcon';
import { formatRelativeDate } from '@app/utils/formatRelativeDate';

import pageStyles from './index.module.css';

export const Route = createFileRoute('/_app/groups/$groupSlug/')({
  loader: async ({ params }) => {
    const groupDetail = await loadGroupDetailBySlug(params.groupSlug);
    return { groupDetail };
  },
  component: GroupDetailPage,
});

function GroupDetailPage() {
  const { groupSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const groupData = useGroupDetailBySlug(groupSlug, { initialData: loaderData.groupDetail });
  const membershipWorkflow = useGroupMembershipWorkflow();

  if (groupData.isError) {
    return (
      <PageLayout header={<h1>Group</h1>}>
        <Surface padding="lg">
          <p>Group not found.</p>
        </Surface>
      </PageLayout>
    );
  }

  const page = groupData.data;
  if (!page) {
    return <PageLayout header={<h1>Group</h1>}>Loading group…</PageLayout>;
  }

  const group = page.group;
  const groupId = group._id;
  const viewerAccess = page.viewerAccess;
  const ownerProfile = page.owner;
  const { membershipStatus } = viewerActionsFor(viewerAccess);
  const factions = page.factions;
  const rulesets = page.rulesets;
  const roster = page.roster;

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

  const activeMembers = roster.filter((member) => member.status === 'active');
  const pendingMembers = roster.filter((member) => member.status === 'pending');
  const memberRows = [...activeMembers, ...pendingMembers];

  const header = <h1>{group.name}</h1>;

  return (
    <PageLayout
      header={header}
      toolbar={
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs" wrap="nowrap">
              <FormTooltip content="Back to profiles">
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="lg"
                  aria-label="Back to profiles"
                  renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
                >
                  <ArrowLeft size={16} aria-hidden />
                </ActionIcon>
              </FormTooltip>
              {viewerAccess.capabilities.rename ? (
                <FormTooltip content="Edit group settings">
                  <ActionIcon
                    variant="light"
                    color="dune"
                    size="lg"
                    aria-label="Edit group settings"
                    renderRoot={(rootProps) => (
                      <Link {...rootProps} to="/groups/$groupSlug/edit" params={{ groupSlug }} />
                    )}
                  >
                    <Pencil size={16} aria-hidden />
                  </ActionIcon>
                </FormTooltip>
              ) : null}
            </Group>
          </Toolbar.Left>
        </Toolbar>
      }
    >
      <Card header={<Section icon={<UsersRound size={20} aria-hidden />} title="Stewardship" />}>
        <Eyebrow>Owner</Eyebrow>
        {ownerProfile?.slug ? (
          <ProfileLink
            slug={ownerProfile.slug}
            username={ownerProfile.username}
            avatar_url={ownerProfile.avatar_url}
          />
        ) : (
          <Text fw={600}>{ownerProfile?.username ?? group.created_by}</Text>
        )}
        <Group justify="space-between" gap="xs" mt="sm">
          <Text size="sm" c="dimmed">
            Your membership
          </Text>
          <StatusBadge
            tone={
              membershipStatus === 'active'
                ? 'positive'
                : membershipStatus === 'pending'
                  ? 'pending'
                  : 'neutral'
            }
          >
            {membershipStatus === 'active'
              ? 'Active member'
              : membershipStatus === 'pending'
                ? 'Pending approval'
                : 'Not a member'}
          </StatusBadge>
        </Group>
        {membershipStatus === 'pending' && (
          <Text size="sm" c="dimmed">
            Your request is awaiting approval.
          </Text>
        )}
        {viewerAccess.viewer.kind === 'anonymous' && (
          <Text size="sm">
            <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>
              Log in
            </Anchor>{' '}
            to request membership.
          </Text>
        )}
        {viewerAccess.capabilities.requestMembership && (
          <FormTooltip content="Request membership">
            <ActionIcon
              variant="filled"
              color="confirm"
              size="lg"
              type="button"
              aria-label="Request membership"
              disabled={membershipWorkflow.request.isPending}
              onClick={() => void membershipWorkflow.request.run(groupId).catch(() => undefined)}
            >
              <UserPlus size={16} aria-hidden />
            </ActionIcon>
          </FormTooltip>
        )}
        {membershipWorkflow.request.isError && (
          <p role="alert">{membershipWorkflow.request.error?.message}</p>
        )}
      </Card>

      <Card header={<Section icon={<UsersRound size={20} aria-hidden />} title="Members" />}>
        {memberRows.length === 0 ? (
          <Text size="sm" c="dimmed">
            No members yet.
          </Text>
        ) : (
          <ul>
            {memberRows.map((entry) => {
              const isPending = entry.status === 'pending';

              return (
                <li key={entry.membershipId}>
                  <div className={pageStyles.memberRow}>
                    <div className={pageStyles.memberRowMain}>
                      {entry.user.slug ? (
                        <ProfileLink
                          slug={entry.user.slug}
                          username={entry.user.username}
                          avatar_url={entry.user.avatar_url}
                        />
                      ) : (
                        <span>{entry.user.username ?? entry.user.id}</span>
                      )}
                      {isPending ? (
                        <>
                          <span className={pageStyles.pendingMeta}>(pending)</span>
                          <span className={pageStyles.pendingMeta}>
                            {formatRelativeDate(entry.requestedAt)}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {entry.capabilities.approve || entry.capabilities.reject ? (
                      <Group gap="xs" wrap="nowrap">
                        {entry.capabilities.approve ? (
                          <FormTooltip content="Approve">
                            <ActionIcon
                              variant="filled"
                              color="confirm"
                              size="lg"
                              type="button"
                              aria-label="Approve membership"
                              disabled={membersModerationBusy}
                              onClick={() =>
                                void membershipWorkflow.approve
                                  .run(entry.membershipId)
                                  .catch(() => undefined)
                              }
                            >
                              <Check size={16} aria-hidden />
                            </ActionIcon>
                          </FormTooltip>
                        ) : null}
                        {entry.capabilities.reject ? (
                          <FormTooltip content="Decline">
                            <ActionIcon
                              variant="light"
                              color="red"
                              size="lg"
                              type="button"
                              aria-label="Decline membership"
                              disabled={membersModerationBusy}
                              onClick={() =>
                                void membershipWorkflow.reject
                                  .run(entry.membershipId)
                                  .catch(() => undefined)
                              }
                            >
                              <X size={16} aria-hidden />
                            </ActionIcon>
                          </FormTooltip>
                        ) : null}
                      </Group>
                    ) : null}
                    {entry.capabilities.remove ? (
                      <Group gap="xs" wrap="nowrap">
                        <FormTooltip content="Remove member">
                          <ActionIcon
                            variant="light"
                            color="red"
                            size="lg"
                            type="button"
                            aria-label="Remove member"
                            disabled={membersModerationBusy}
                            onClick={() => handleRemoveMember(entry.membershipId)}
                          >
                            <UserRoundMinus size={16} aria-hidden />
                          </ActionIcon>
                        </FormTooltip>
                      </Group>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {membersModerationError ? <p role="alert">{membersModerationError}</p> : null}
      </Card>

      <Card header={<Section icon={<Layers3 size={20} aria-hidden />} title="Factions" />}>
        {factions.length === 0 ? (
          <Text size="sm" c="dimmed">
            No factions in this group yet.
          </Text>
        ) : (
          <Links>
            {factions.map((faction) => (
              <Links.Item
                key={faction._id}
                to="/factions/$factionId"
                params={{ factionId: faction.slug }}
              >
                {faction.data.name}
              </Links.Item>
            ))}
          </Links>
        )}
      </Card>

      <Card header={<Section icon={<TopicIcon topic="rulesets" size={20} />} title="Rulesets" />}>
        {rulesets.length === 0 ? (
          <Text size="sm" c="dimmed">
            No rulesets in this group yet.
          </Text>
        ) : (
          <Links>
            {rulesets.map((ruleset) => (
              <Links.Item
                key={ruleset._id}
                to="/rulesets/$rulesetSlug"
                params={{ rulesetSlug: ruleset.slug }}
              >
                {ruleset.name}
              </Links.Item>
            ))}
          </Links>
        )}
      </Card>
    </PageLayout>
  );
}

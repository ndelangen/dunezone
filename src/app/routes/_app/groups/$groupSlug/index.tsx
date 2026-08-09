import { ActionIcon, Group, Paper, Tooltip } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Check, Pencil, Trash2, UserPlus, UserRoundMinus, X } from 'lucide-react';

import { useFactionsOwnedForGroupAssign, useSetFactionGroup } from '@db/factions';
import { useDeleteGroup, loadGroupDetailBySlug, useGroupDetailBySlug } from '@db/groups';
import { useGroupMembershipWorkflow } from '@db/members';
import { useRulesetsOwnedForGroupAssign, useUpdateRuleset } from '@db/rulesets';
import { viewerActionsFor } from '@app/access/viewerActions';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { ButtonGroup, Toolbar } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { PrototypeSwitcher } from '@app/components/prototype/PrototypeSwitcher';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';
import { formatRelativeDate } from '@app/utils/formatRelativeDate';
import {
  RequestMembershipButton,
  VARIANT_COMPONENTS,
  VARIANT_LIST,
} from '@app/components/groups/prototype/GroupDetailVariants';
import type { VariantKey } from '@app/components/groups/prototype/GroupDetailVariants';

import pageStyles from './index.module.css';

/** PROTOTYPE ONLY — Wayfinder issue #183: throwaway `?variant=` switcher over 6 desktop concepts. */
type PageVariant = 'current' | VariantKey;
const PROTOTYPE_VARIANT_LIST: ReadonlyArray<{ key: PageVariant; name: string }> = [
  { key: 'current', name: 'Current (shipped)' },
  ...VARIANT_LIST,
];
function isPageVariant(value: unknown): value is PageVariant {
  return typeof value === 'string' && PROTOTYPE_VARIANT_LIST.some((variant) => variant.key === value);
}

export const Route = createFileRoute('/_app/groups/$groupSlug/')({
  validateSearch: (search: Record<string, unknown>): { variant?: PageVariant } =>
    isPageVariant(search.variant) && search.variant !== 'current'
      ? { variant: search.variant }
      : {},
  loader: async ({ params }) => {
    const groupDetail = await loadGroupDetailBySlug(params.groupSlug);
    return { groupDetail };
  },
  component: GroupDetailPage,
});

function GroupDetailPage() {
  const { groupSlug } = Route.useParams();
  const { variant = 'current' } = Route.useSearch();
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
      <PageLayout header={<h1>Group</h1>}>
        <Card>
          <p>Group not found.</p>
        </Card>
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

  const activeMembers = roster.filter((member) => member.status === 'active');
  const pendingMembers = roster.filter((member) => member.status === 'pending');
  const memberRows = [...activeMembers, ...pendingMembers];
  const isActiveMember = membershipStatus === 'active';

  const header = <h1>{group.name}</h1>;
  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <ButtonGroup>
          <FormTooltip content="Back to profiles">
            <UIButton variant="nav" to="/profiles" aria-label="Back to profiles">
              <ArrowLeft size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
          {viewerAccess.capabilities.rename ? (
            <FormTooltip content="Edit group settings">
              <UIButton
                variant="secondary"
                to="/groups/$groupSlug/edit"
                params={{ groupSlug }}
                aria-label="Edit group settings"
              >
                <Pencil size={16} aria-hidden />
              </UIButton>
            </FormTooltip>
          ) : null}
        </ButtonGroup>
      </Toolbar.Left>
    </Toolbar>
  );

  const chosenToolbar = (
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
          isAnonymous={viewerAccess.viewer.kind === 'anonymous'}
          requestPending={membershipWorkflow.request.isPending}
          requestError={membershipWorkflow.request.error?.message ?? null}
          onRequestMembership={() => void membershipWorkflow.request.run(groupId).catch(() => undefined)}
          variant="filled"
        />
      </Group>
    </Paper>
  );

  const prototypeSwitcher = (
    <PrototypeSwitcher
      ariaLabel="Group detail prototype variants"
      variants={PROTOTYPE_VARIANT_LIST}
      current={variant}
      onChange={(nextVariant) =>
        void navigate({
          search: { variant: nextVariant === 'current' ? undefined : nextVariant },
          replace: true,
        })
      }
    />
  );

  if (variant !== 'current') {
    const VariantComponent = VARIANT_COMPONENTS[variant];
    return (
      <>
        <PageLayout header={header} toolbar={variant === 'a' ? chosenToolbar : toolbar}>
          <VariantComponent
            groupId={groupId}
            groupName={group.name}
            ownerProfile={ownerProfile}
            createdBy={group.created_by}
            membershipStatus={membershipStatus}
            isAnonymous={viewerAccess.viewer.kind === 'anonymous'}
            isOwner={viewerAccess.capabilities.rename}
            isActiveMember={isActiveMember}
            canRequestMembership={viewerAccess.capabilities.requestMembership}
            requestPending={membershipWorkflow.request.isPending}
            requestError={membershipWorkflow.request.error?.message ?? null}
            onRequestMembership={() => void membershipWorkflow.request.run(groupId).catch(() => undefined)}
            activeMembers={activeMembers}
            pendingMembers={pendingMembers}
            moderationBusy={membersModerationBusy}
            moderationError={membersModerationError}
            onApprove={(membershipId) =>
              void membershipWorkflow.approve.run(membershipId).catch(() => undefined)
            }
            onReject={(membershipId) =>
              void membershipWorkflow.reject.run(membershipId).catch(() => undefined)
            }
            onRemove={handleRemoveMember}
            factions={factions}
            rulesets={rulesets}
            ownedFactions={ownedFactionsQuery.data ?? []}
            ownedRulesets={ownedRulesetsQuery.data ?? []}
            assignFactionBusy={setFactionGroup.isPending}
            assignRulesetBusy={updateRuleset.isPending}
            onAssignFaction={handleAssignFaction}
            onAssignRuleset={handleAssignRuleset}
          />
        </PageLayout>
        {prototypeSwitcher}
      </>
    );
  }

  return (
    <>
      <PageLayout header={header} toolbar={toolbar}>
      <Card>
        <p>
          Owner:{' '}
          {ownerProfile?.slug ? (
            <ProfileLink
              slug={ownerProfile.slug}
              username={ownerProfile.username}
              avatar_url={ownerProfile.avatar_url}
            />
          ) : (
            (ownerProfile?.username ?? group.created_by)
          )}
        </p>
        <p>
          Membership status:{' '}
          {membershipStatus === 'active'
            ? 'Active member'
            : membershipStatus === 'pending'
              ? 'Pending approval'
              : 'Not a member'}
        </p>
        {membershipStatus === 'pending' && <p>Your request is awaiting approval.</p>}
        {viewerAccess.viewer.kind === 'anonymous' && (
          <p>
            <Link to="/auth/login">Log in</Link> to request membership.
          </p>
        )}
        {viewerAccess.capabilities.requestMembership && (
          <FormTooltip content="Request membership">
            <UIButton
              type="button"
              iconOnly
              aria-label="Request membership"
              disabled={membershipWorkflow.request.isPending}
              onClick={() => void membershipWorkflow.request.run(groupId).catch(() => undefined)}
            >
              <UserPlus size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
        )}
        {membershipWorkflow.request.isError && (
          <p role="alert">{membershipWorkflow.request.error?.message}</p>
        )}
      </Card>

      <Card>
        <h3>Members</h3>
        {memberRows.length === 0 ? (
          <p>No members yet.</p>
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
                      <ButtonGroup>
                        {entry.capabilities.approve ? (
                          <FormTooltip content="Approve">
                            <UIButton
                              type="button"
                              variant="confirm"
                              iconOnly
                              aria-label="Approve membership"
                              disabled={membersModerationBusy}
                              onClick={() =>
                                void membershipWorkflow.approve
                                  .run(entry.membershipId)
                                  .catch(() => undefined)
                              }
                            >
                              <Check size={16} aria-hidden />
                            </UIButton>
                          </FormTooltip>
                        ) : null}
                        {entry.capabilities.reject ? (
                          <FormTooltip content="Decline">
                            <UIButton
                              type="button"
                              variant="critical"
                              iconOnly
                              aria-label="Decline membership"
                              disabled={membersModerationBusy}
                              onClick={() =>
                                void membershipWorkflow.reject
                                  .run(entry.membershipId)
                                  .catch(() => undefined)
                              }
                            >
                              <X size={16} aria-hidden />
                            </UIButton>
                          </FormTooltip>
                        ) : null}
                      </ButtonGroup>
                    ) : null}
                    {entry.capabilities.remove ? (
                      <ButtonGroup>
                        <FormTooltip content="Remove member">
                          <UIButton
                            type="button"
                            variant="critical"
                            iconOnly
                            aria-label="Remove member"
                            disabled={membersModerationBusy}
                            onClick={() => handleRemoveMember(entry.membershipId)}
                          >
                            <UserRoundMinus size={16} aria-hidden />
                          </UIButton>
                        </FormTooltip>
                      </ButtonGroup>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {membersModerationError ? <p role="alert">{membersModerationError}</p> : null}
      </Card>

      <Card>
        <h3>Factions</h3>
        {factions.length === 0 ? (
          <p>No factions in this group yet.</p>
        ) : (
          <ul>
            {factions.map((faction) => (
              <li key={faction._id}>
                <Link to="/factions/$factionId" params={{ factionId: faction.slug }}>
                  {faction.data.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3>Rulesets</h3>
        {rulesets.length === 0 ? (
          <p>No rulesets in this group yet.</p>
        ) : (
          <ul>
            {rulesets.map((ruleset) => (
              <li key={ruleset._id}>
                <Link to="/rulesets/$rulesetSlug" params={{ rulesetSlug: ruleset.slug }}>
                  {ruleset.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </PageLayout>
      {prototypeSwitcher}
    </>
  );
}

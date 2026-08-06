import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Check, Pencil, UserPlus, UserRoundMinus, X } from 'lucide-react';

import { loadGroupDetailBySlug, useGroupDetailBySlug } from '@db/groups';
import { useGroupMembershipWorkflow } from '@db/members';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { ButtonGroup, Toolbar } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';
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
  const membershipStatus =
    viewerAccess.viewer.kind === 'authenticated' ? viewerAccess.viewer.membership : 'none';
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
      }
    >
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
  );
}

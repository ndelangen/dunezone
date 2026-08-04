import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Check, Pencil, UserPlus, UserRoundMinus, X } from 'lucide-react';

import { loadGroupDetailBySlug, useGroupDetailBySlug } from '@db/groups';
import {
  useApproveGroupMember,
  useRejectGroupMember,
  useRemoveGroupMember,
  useRequestGroupMembership,
} from '@db/members';
import { useCurrentProfile } from '@db/profiles';
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
  const requestMembership = useRequestGroupMembership();
  const approveMember = useApproveGroupMember();
  const rejectMember = useRejectGroupMember();
  const removeMember = useRemoveGroupMember();
  const profile = useCurrentProfile();
  const viewerUserId = profile.data?.user_id;

  if (groupData.isError) {
    return (
      <PageLayout header={<h1>Group</h1>}>
        <Card>
          <p>Group not found.</p>
        </Card>
      </PageLayout>
    );
  }

  if (!groupData.group) {
    return <PageLayout header={<h1>Group</h1>}>Loading group…</PageLayout>;
  }

  const group = groupData.group;
  const groupId = group._id;
  const members = groupData.members ?? [];
  const profileByUserId = new Map((groupData.profiles ?? []).map((p) => [p.user_id, p]));
  const ownerProfile = profileByUserId.get(group.created_by);
  const viewerMembership = members.find((entry) => entry.user_id === viewerUserId);
  const membershipStatus =
    viewerMembership && viewerMembership.status !== 'removed' ? viewerMembership.status : 'none';
  const canRequestMembership = membershipStatus === 'none' && !!viewerUserId;
  const viewerIsOwner = !!viewerUserId && viewerUserId === group.created_by;
  const viewerCanModeratePending = membershipStatus === 'active';
  const factions = groupData.factions ?? [];
  const rulesets = groupData.rulesets ?? [];

  const membersModerationBusy =
    approveMember.isPending || rejectMember.isPending || removeMember.isPending;
  const membersModerationError =
    approveMember.error?.message ??
    rejectMember.error?.message ??
    removeMember.error?.message ??
    null;

  const handleRemoveMember = (memberUserId: string) => {
    if (!window.confirm('Remove this member from the group?')) {
      return;
    }
    removeMember.mutate({ groupId, userId: memberUserId });
  };

  const activeMembers = members.filter((member) => member.status === 'active');
  const pendingMembers = members.filter((member) => member.status === 'pending');
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
              {viewerIsOwner ? (
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
        {!profile.isPending && !viewerUserId && (
          <p>
            <Link to="/auth/login">Log in</Link> to request membership.
          </p>
        )}
        {canRequestMembership && (
          <FormTooltip content="Request membership">
            <UIButton
              type="button"
              iconOnly
              aria-label="Request membership"
              disabled={requestMembership.isPending}
              onClick={() => requestMembership.mutate(groupId)}
            >
              <UserPlus size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
        )}
        {requestMembership.isError && <p role="alert">{requestMembership.error?.message}</p>}
      </Card>

      <Card>
        <h3>Members</h3>
        {memberRows.length === 0 ? (
          <p>No members yet.</p>
        ) : (
          <ul>
            {memberRows.map((entry) => {
              const memberProfile = profileByUserId.get(entry.user_id);
              const isPending = entry.status === 'pending';
              const isOwnerRow = entry.user_id === group.created_by;

              return (
                <li key={entry.id}>
                  <div className={pageStyles.memberRow}>
                    <div className={pageStyles.memberRowMain}>
                      {memberProfile?.slug ? (
                        <ProfileLink
                          slug={memberProfile.slug}
                          username={memberProfile.username}
                          avatar_url={memberProfile.avatar_url}
                        />
                      ) : (
                        <span>{memberProfile?.username ?? entry.user_id}</span>
                      )}
                      {isPending ? (
                        <>
                          <span className={pageStyles.pendingMeta}>(pending)</span>
                          <span className={pageStyles.pendingMeta}>
                            {formatRelativeDate(entry.requested_at)}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {isPending && viewerCanModeratePending ? (
                      <ButtonGroup>
                        <FormTooltip content="Approve">
                          <UIButton
                            type="button"
                            variant="confirm"
                            iconOnly
                            aria-label="Approve membership"
                            disabled={membersModerationBusy}
                            onClick={() => approveMember.mutate({ groupId, userId: entry.user_id })}
                          >
                            <Check size={16} aria-hidden />
                          </UIButton>
                        </FormTooltip>
                        <FormTooltip content="Decline">
                          <UIButton
                            type="button"
                            variant="critical"
                            iconOnly
                            aria-label="Decline membership"
                            disabled={membersModerationBusy}
                            onClick={() => rejectMember.mutate({ groupId, userId: entry.user_id })}
                          >
                            <X size={16} aria-hidden />
                          </UIButton>
                        </FormTooltip>
                      </ButtonGroup>
                    ) : null}
                    {!isPending && viewerIsOwner && !isOwnerRow ? (
                      <ButtonGroup>
                        <FormTooltip content="Remove member">
                          <UIButton
                            type="button"
                            variant="critical"
                            iconOnly
                            aria-label="Remove member"
                            disabled={membersModerationBusy}
                            onClick={() => handleRemoveMember(entry.user_id)}
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

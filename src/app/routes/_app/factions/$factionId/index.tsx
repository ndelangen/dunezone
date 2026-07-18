import { FormTooltip } from '@app/components/form/FormTooltip';
import { ButtonGroup, Toolbar } from '@app/components/generic/layout';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';
import { factionAssetPublishingCopy } from '@app/factions/assetPublishingStatus';
import { loadFaction, useFaction } from '@db/factions';
import { useRequestGroupMembership } from '@db/members';
import { useCurrentProfile } from '@db/profiles';
import { loadRulesetsByFaction, useRulesetsByFaction } from '@db/rulesets';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, Download, Eye, Pencil, UserPlus } from 'lucide-react';

export const Route = createFileRoute('/_app/factions/$factionId/')({
  loader: async ({ params }) => {
    const faction = await loadFaction(params.factionId);
    const rulesets = await loadRulesetsByFaction(faction.faction._id);
    return { faction, rulesets };
  },
  component: FactionDetailPage,
});

function canEditFaction(
  profileId: string | undefined,
  ownerId: string | undefined,
  groupId: string | null | undefined,
  memberships: { group_id: string }[] | undefined
) {
  if (!profileId) return false;
  if (profileId === ownerId) return true;
  if (!groupId) return false;
  return (memberships ?? []).some((m) => m.group_id === groupId);
}

function FactionDetailPage() {
  const { factionId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const factionSeed = loaderData.faction;

  const { faction, memberships, groupAccess, owner, assetPublishing } = useFaction(factionId, {
    initialData: factionSeed,
  });
  const rulesets = useRulesetsByFaction(factionSeed.faction._id, {
    initialData: loaderData.rulesets,
  });
  const factionRow = faction;
  const profile = useCurrentProfile();
  const requestMembership = useRequestGroupMembership();

  if (!factionRow) {
    return (
      <PageLayout header={<h1>Faction</h1>}>
        <p>Loading faction…</p>
      </PageLayout>
    );
  }

  const canEdit = canEditFaction(profile.data?._id, owner?._id, factionRow.group_id, memberships);
  const factionGroupId = factionRow.group_id;

  const profileUserId = profile.data?.user_id;
  const assignedGroup = groupAccess?.group;
  const groupMembersList = groupAccess?.members ?? [];
  const viewerMembership = groupMembersList.find(
    (entry) => entry.membership.user_id === profileUserId
  )?.membership;
  const membershipStatus =
    viewerMembership && viewerMembership.status !== 'removed' ? viewerMembership.status : 'none';
  const canRequestMembership = !!profileUserId && !!assignedGroup && membershipStatus === 'none';

  const header = (
    <div>
      <h1>{factionRow.data.name}</h1>
      <p>Owner: {owner ? <ProfileLink {...owner} /> : <span>Loading owner...</span>}</p>
    </div>
  );

  return (
    <PageLayout
      header={header}
      toolbar={
        <Toolbar>
          <Toolbar.Left>
            <ButtonGroup>
              <FormTooltip content="Back to factions">
                <UIButton variant="nav" to="/factions" aria-label="Back to factions">
                  <ArrowLeft size={16} aria-hidden />
                </UIButton>
              </FormTooltip>
              {canEdit ? (
                <FormTooltip content="Edit faction">
                  <UIButton
                    variant="secondary"
                    to="/factions/$factionId/edit"
                    params={{ factionId }}
                    aria-label="Edit faction"
                  >
                    <Pencil size={16} aria-hidden />
                  </UIButton>
                </FormTooltip>
              ) : null}
            </ButtonGroup>
          </Toolbar.Left>
          <Toolbar.Right>
            <ButtonGroup>
              <FormTooltip content="Preview faction sheet">
                <UIButton
                  variant="confirm"
                  to="/preview/sheet/$factionSlug"
                  params={{ factionSlug: factionId }}
                  search={{ mode: 'db' }}
                  target="_blank"
                  aria-label="Preview faction sheet"
                >
                  <Eye size={16} aria-hidden />
                </UIButton>
              </FormTooltip>
              {assetPublishing.publicationHref ? (
                <FormTooltip content="Open published PDF">
                  <UIButton
                    variant="secondary"
                    href={assetPublishing.publicationHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open published PDF"
                  >
                    <Download size={16} aria-hidden />
                  </UIButton>
                </FormTooltip>
              ) : null}
            </ButtonGroup>
          </Toolbar.Right>
        </Toolbar>
      }
    >
      <p>
        <Link
          to="/preview/sheet/$factionSlug"
          params={{ factionSlug: factionId }}
          search={{ mode: 'db' }}
        >
          Preview faction sheet
        </Link>{' '}
        (opens without site chrome; use the browser print dialog for PDF)
      </p>

      <section>
        <h3>Public assets</h3>
        <p>{factionAssetPublishingCopy(assetPublishing.status)}</p>
        <p>
          {assetPublishing.publicationHref ? (
            <a href={assetPublishing.publicationHref} target="_blank" rel="noopener noreferrer">
              Open published faction sheet (PDF)
            </a>
          ) : (
            'The published PDF has not been rendered yet.'
          )}
        </p>
      </section>

      <section>
        <h3>Group</h3>
        {factionGroupId == null ? (
          <p>This faction is not assigned to a group.</p>
        ) : !assignedGroup ? (
          <p>Group details unavailable.</p>
        ) : (
          <>
            <p>
              Group:{' '}
              {assignedGroup.slug ? (
                <Link to="/groups/$groupSlug" params={{ groupSlug: assignedGroup.slug }}>
                  {assignedGroup.name}
                </Link>
              ) : (
                <strong>{assignedGroup.name}</strong>
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
            {membershipStatus === 'pending' && (
              <p>Your membership request is waiting for approval.</p>
            )}
            {!profile.isPending && !profileUserId && (
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
                  onClick={() => requestMembership.mutate(factionGroupId)}
                >
                  <UserPlus size={16} aria-hidden />
                </UIButton>
              </FormTooltip>
            )}
            {requestMembership.isError && <p>{requestMembership.error?.message}</p>}
          </>
        )}
      </section>

      {rulesets.data && rulesets.data.length > 0 ? (
        <section>
          <h3>In rulesets</h3>
          <ul>
            {rulesets.data.map((ruleset) => (
              <li key={ruleset.id}>
                <Link to="/rulesets/$rulesetSlug" params={{ rulesetSlug: ruleset.slug }}>
                  {ruleset.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageLayout>
  );
}

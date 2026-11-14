import { isRouteNoticeCode } from '@shared/routeNotices';
import type { RouteNoticeCode } from '@shared/routeNotices';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Notice } from '@ui/block/Notice';
import { PageState } from '@ui/block/PageState';

import { isFactionNotFound, loadFaction, useFaction, useFactionVariantContext } from '@db/factions';
import { redirectFromFormerAddress, redirectToOwnFactionAddress } from '@app/routes/formerAddress';
import { pageHead } from '@app/routes/pageTitle';
import { resolveRouteNotice } from '@app/routes/routeNotices';
import { RouteLoadError, RouteNotFound } from '@app/routes/routeStates';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';

import { useFactionEditRights } from '../useFactionEditRights';
import { FactionEditForm } from './FactionEditForm';

export const Route = createFileRoute('/_app/factions/$factionId/edit')({
  validateSearch: (params: Record<string, unknown>): { notice?: RouteNoticeCode } => {
    if (isRouteNoticeCode(params?.notice)) {
      return { notice: params.notice };
    }
    return {};
  },
  loader: async ({ params, location }) => {
    try {
      const page = await loadFaction(params.factionId);
      redirectToOwnFactionAddress(params.factionId, page.faction.slug, location, '/edit');
      return page;
    } catch (error) {
      /* A rename moves the faction, and an old edit link follows it there, as the faction page's own link does. */
      if (isFactionNotFound(error)) {
        await redirectFromFormerAddress({ kind: 'faction', slug: params.factionId }, location, '/edit');
      }
      throw error;
    }
  },
  errorComponent: FactionEditError,
  head: ({ loaderData }) => pageHead(loaderData ? `Edit ${loaderData.faction.data.name}` : 'Edit faction'),
  component: FactionEditPage,
});

/**
 * The frame for a load that failed, which on this route is most often a slug that names no faction: the query throws rather than returning nothing, so the component's own absent branch never runs.
 * Without this the reader met the router's unstyled default and, in development, a stack trace.
 */
function FactionEditError({ error }: ErrorComponentProps) {
  const back = <PageMessage.Back to="/factions">Back to factions</PageMessage.Back>;
  if (isFactionNotFound(error)) {
    return <RouteNotFound title="Edit faction" back={back} noun="faction" renamed />;
  }
  return (
    <RouteLoadError size="compact" title="Edit faction" back={back} what="Faction could not be loaded" error={error} />
  );
}

function FactionEditPage() {
  const { factionId } = Route.useParams();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const page = useFaction(factionId, { initialData: loaderData }).data ?? loaderData;
  const editRights = useFactionEditRights(page);
  const { resolved: viewerResolved, viewerAccess, rights, canOpenEditor } = editRights;
  const { faction } = page;
  /* The context answers only the variant's editors, and names a parent only for a variant that has one. */
  const variantContext = useFactionVariantContext((faction ?? loaderData.faction)._id);
  const backToFaction = (
    <PageMessage.Back to="/factions/$factionId" params={{ factionId }}>
      Back to faction
    </PageMessage.Back>
  );

  if (!viewerResolved) {
    return (
      <RoutePending size="compact" title={`Edit ${faction.data.name}`} back={backToFaction} loading="Loading faction">
        Checking what you can edit.
      </RoutePending>
    );
  }

  if (viewerAccess.viewer.kind === 'anonymous') {
    /* The name stays conditional here, as it was in the old header: this guard runs before the one
       below that answers whether there is a faction at all, so the title cannot assume one. */
    return (
      <PageMessage size="compact" title={faction ? `Edit ${faction.data.name}` : 'Edit faction'} back={backToFaction}>
        <LoginGate action="edit factions" />
      </PageMessage>
    );
  }

  if (!faction) {
    return (
      <RoutePending size="compact" title="Edit faction" back={backToFaction} loading="Loading faction">
        The faction is still loading.
      </RoutePending>
    );
  }

  if (!canOpenEditor) {
    return (
      <PageMessage size="compact" title={`Edit ${faction.data.name}`} back={backToFaction}>
        <PageState kind="absent" title="You cannot edit this faction">
          {faction.group_id
            ? 'Only the faction owner or an active member of its group can edit this faction.'
            : 'Only the faction owner can edit this faction.'}
        </PageState>
      </PageMessage>
    );
  }

  /* The editor of a variant with a parent waits for that parent, so no inherited field ever shows as the variant's own. */
  if (faction.parent_id !== undefined && rights.variant && variantContext === undefined) {
    return (
      <RoutePending size="compact" title={`Edit ${faction.data.name}`} back={backToFaction} loading="Loading faction">
        Loading the parent variant.
      </RoutePending>
    );
  }

  const routeNotice = resolveRouteNotice(search.notice);
  const dismissRouteNotice = () =>
    navigate({
      to: '.',
      search: (previous) => ({ ...previous, notice: undefined }),
      replace: true,
    });

  return (
    <FactionEditForm
      factionId={factionId}
      page={page}
      editRights={editRights}
      variantContext={variantContext}
      routeNotice={
        routeNotice ? (
          <Notice tone={routeNotice.tone} title={routeNotice.title} live onDismiss={dismissRouteNotice}>
            {routeNotice.message}
          </Notice>
        ) : null
      }
    />
  );
}

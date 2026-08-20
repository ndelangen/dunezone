import { isAssetType } from '@shared/assets/types';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { loadAssetPage } from '@app/db/assets';

import { NoEditorYet } from '../../../-assetEditorStates';
import { DeckEditPage } from './-deckEdit';
import { TokenEditPage } from './-tokenEdit';
import { TreacheryEditPage } from './-treacheryEdit';

/**
 * Editing any Asset, one route for every type.
 * The loader reads by the type in the URL rather than a literal, so a new type needs a branch below and no new route.
 */
export const Route = createFileRoute('/_app/assets/$type/$slug/edit/')({
  loader: async ({ params }) => {
    if (!isAssetType(params.type)) {
      throw notFound();
    }
    return await loadAssetPage(params.type, params.slug);
  },
  component: EditAssetPage,
});

function EditAssetPage() {
  const { type, slug } = Route.useParams();
  const loaderData = Route.useLoaderData();

  switch (type) {
    case 'card-treachery':
      return <TreacheryEditPage slug={slug} loaderData={loaderData} />;
    case 'token-round':
    case 'token-gear':
    case 'token-square':
      return <TokenEditPage type={type} slug={slug} loaderData={loaderData} />;
    case 'deck':
      return <DeckEditPage slug={slug} loaderData={loaderData} />;
    default:
      return <NoEditorYet type={type} />;
  }
}

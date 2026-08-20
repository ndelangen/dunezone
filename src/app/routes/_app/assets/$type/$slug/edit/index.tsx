import { isAssetType } from '@shared/assets/types';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { loadAssetForEdit } from '@app/db/assets';

import { NoEditorYet } from '../../../-assetEditorStates';
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
    return await loadAssetForEdit(params.type, params.slug);
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
    default:
      return <NoEditorYet type={type} />;
  }
}

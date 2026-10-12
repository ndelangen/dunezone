import { isAssetType } from '@shared/assets/types';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { loadAssetPage } from '@app/db/assets';
import { pageHead } from '@app/routes/pageTitle';

import { NoEditorYet } from '../../../assetEditorStates';
import { customCardEditing, stormCardEditing } from '../../../layeredCardEditing';
import { BoardEditPage } from './boardEdit';
import { BundleEditPage } from './bundleEdit';
import { DeckEditPage } from './deckEdit';
import { LayeredEditPage } from './layeredEdit';
import { LeaderSkillEditPage } from './leaderSkillEdit';
import { NexusEditPage } from './nexusEdit';
import { RectangleEditPage } from './rectangleEdit';
import { SpiceEditPage } from './spiceEdit';
import { StrongholdEditPage } from './strongholdEdit';
import { TokenEditPage } from './tokenEdit';
import { TreacheryEditPage } from './treacheryEdit';

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
  head: ({ match, loaderData }) => pageHead(loaderData ? `Edit ${loaderData.asset.name}` : 'Edit asset', { match }),
  component: EditAssetPage,
});

function EditAssetPage() {
  const { type, slug } = Route.useParams();
  const loaderData = Route.useLoaderData();

  switch (type) {
    case 'board':
      return <BoardEditPage slug={slug} loaderData={loaderData} />;
    case 'card-treachery':
      return <TreacheryEditPage slug={slug} loaderData={loaderData} />;
    case 'card-leaderability':
      return <LeaderSkillEditPage slug={slug} loaderData={loaderData} />;
    case 'card-nexus':
      return <NexusEditPage slug={slug} loaderData={loaderData} />;
    case 'card-custom':
      return <LayeredEditPage config={customCardEditing} slug={slug} loaderData={loaderData} />;
    case 'card-storm':
      return <LayeredEditPage config={stormCardEditing} slug={slug} loaderData={loaderData} />;
    case 'card-stronghold':
      return <StrongholdEditPage slug={slug} loaderData={loaderData} />;
    case 'card-spice':
      return <SpiceEditPage slug={slug} loaderData={loaderData} />;
    case 'token-disc':
    case 'token-tech':
    case 'token-plate':
      return <TokenEditPage type={type} slug={slug} loaderData={loaderData} />;
    /* The rectangle is a token by category and its own editor by face: a free composition rather than a symbol in a slot. */
    case 'token-enhance':
      return <RectangleEditPage type={type} slug={slug} loaderData={loaderData} />;
    case 'deck':
      return <DeckEditPage slug={slug} loaderData={loaderData} />;
    case 'bundle':
      return <BundleEditPage slug={slug} loaderData={loaderData} />;
    default:
      return <NoEditorYet type={type} />;
  }
}

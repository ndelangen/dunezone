import { isAssetType } from '@shared/assets/types';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { NoEditorYet } from '../../-assetEditorStates';
import { BundleCreatePage } from './-bundleCreate';
import { DeckCreatePage } from './-deckCreate';
import { RectangleCreatePage } from './-rectangleCreate';
import { TokenCreatePage } from './-tokenCreate';
import { TreacheryCreatePage } from './-treacheryCreate';

/**
 * Creating any Asset, one route for every type.
 *
 * The static `create` segment outscores the sibling `$slug` at the same depth, so this keeps working once the detail page lands at `/assets/$type/$slug`.
 * That is the whole reason it is a param route rather than one literal per type: without it, `/assets/deck/create` would resolve to a detail page for an asset slugged "create".
 */
export const Route = createFileRoute('/_app/assets/$type/create/')({
  loader: ({ params }) => {
    if (!isAssetType(params.type)) {
      throw notFound();
    }
    return null;
  },
  component: CreateAssetPage,
});

function CreateAssetPage() {
  const { type } = Route.useParams();

  /* One branch per type with a landed editor. Everything else says so rather than pretending the type is unknown. */
  switch (type) {
    case 'card-treachery':
      return <TreacheryCreatePage />;
    /* One editor for all three shapes: shape is the type, and only the proof's clip differs. */
    case 'token-round':
    case 'token-gear':
    case 'token-square':
      return <TokenCreatePage type={type} />;
    /* The rectangle is a token by category and its own editor by face: a free composition rather than a symbol in a slot. */
    case 'token-rectangle':
      return <RectangleCreatePage />;
    case 'deck':
      return <DeckCreatePage />;
    case 'bundle':
      return <BundleCreatePage />;
    default:
      return <NoEditorYet type={type} />;
  }
}

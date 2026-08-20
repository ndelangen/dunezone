import { isAssetType } from '@shared/assets/types';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { NoEditorYet } from '../../-assetEditorStates';
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
    default:
      return <NoEditorYet type={type} />;
  }
}

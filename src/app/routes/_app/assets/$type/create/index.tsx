import { isAssetType } from '@shared/assets/types';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { pageHead } from '@app/routes/pageTitle';

import { NoEditorYet } from '../../assetEditorStates';
import { CardTypeCreatePage } from '../cardSession';
import {
  customCardSession,
  homeworldCardSession,
  leaderSkillCardSession,
  leaderTokenSession,
  nexusCardSession,
  spiceCardSession,
  stormCardSession,
  strongholdCardSession,
  treacheryCardSession,
} from '../cardSessionConfigs';
import { BoardCreatePage } from './boardCreate';
import { BundleCreatePage } from './bundleCreate';
import { DeckCreatePage } from './deckCreate';
import { RectangleCreatePage } from './rectangleCreate';
import { TokenCreatePage } from './tokenCreate';

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
  head: ({ match }) => pageHead('New asset', { match }),
  component: CreateAssetPage,
});

function CreateAssetPage() {
  const { type } = Route.useParams();

  /* One branch per type with a landed editor. Everything else says so rather than pretending the type is unknown. */
  switch (type) {
    case 'board':
      return <BoardCreatePage />;
    case 'card-treachery':
      return <CardTypeCreatePage key={type} config={treacheryCardSession} />;
    case 'card-leaderability':
      return <CardTypeCreatePage key={type} config={leaderSkillCardSession} />;
    case 'card-homeworld':
      return <CardTypeCreatePage key={type} config={homeworldCardSession} />;
    case 'card-nexus':
      return <CardTypeCreatePage key={type} config={nexusCardSession} />;
    case 'card-custom':
      return <CardTypeCreatePage key={type} config={customCardSession} />;
    case 'card-storm':
      return <CardTypeCreatePage key={type} config={stormCardSession} />;
    case 'card-stronghold':
      return <CardTypeCreatePage key={type} config={strongholdCardSession} />;
    case 'card-spice':
      return <CardTypeCreatePage key={type} config={spiceCardSession} />;
    /* One editor for all three shapes: shape is the type, and only the proof's clip differs. */
    case 'token-disc':
    case 'token-tech':
    case 'token-pointer':
    case 'token-plate':
      return <TokenCreatePage type={type} />;
    /* The rectangle is a token by category and its own editor by face: a free composition rather than a symbol in a slot. */
    case 'token-leader':
      return <CardTypeCreatePage key={type} config={leaderTokenSession} />;
    case 'token-enhance':
      return <RectangleCreatePage />;
    case 'deck':
      return <DeckCreatePage />;
    case 'bundle':
      return <BundleCreatePage />;
    default:
      return <NoEditorYet type={type} />;
  }
}

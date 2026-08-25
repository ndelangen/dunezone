import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Assets',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const Catalogue = meta.story({ args: { path: '/assets', routeKey: 'assets' } });
export const TreacheryCards = meta.story({
  args: { path: '/assets/card-treachery', routeKey: 'assetType' },
});

export const TreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun', routeKey: 'assetDetail' },
});
export const Deck = meta.story({ args: { path: '/assets/deck/house-treachery', routeKey: 'assetDetail' } });
export const DiscToken = meta.story({ args: { path: '/assets/token-disc/karama', routeKey: 'assetDetail' } });
export const EnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach', routeKey: 'assetDetail' },
});
export const Bundle = meta.story({ args: { path: '/assets/bundle/atreides-tokens', routeKey: 'assetDetail' } });

export const CreateTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/create', routeKey: 'assetCreate' },
});
export const CreateDeck = meta.story({ args: { path: '/assets/deck/create', routeKey: 'assetCreate' } });
export const CreateDiscToken = meta.story({ args: { path: '/assets/token-disc/create', routeKey: 'assetCreate' } });
export const CreateEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/create', routeKey: 'assetCreate' },
});
export const CreateBundle = meta.story({ args: { path: '/assets/bundle/create', routeKey: 'assetCreate' } });

export const EditTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun/edit', routeKey: 'assetEdit' },
});
export const EditDeck = meta.story({ args: { path: '/assets/deck/house-treachery/edit', routeKey: 'assetEdit' } });
export const EditDiscToken = meta.story({ args: { path: '/assets/token-disc/karama/edit', routeKey: 'assetEdit' } });
export const EditEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach/edit', routeKey: 'assetEdit' },
});
export const EditBundle = meta.story({
  args: { path: '/assets/bundle/atreides-tokens/edit', routeKey: 'assetEdit' },
});

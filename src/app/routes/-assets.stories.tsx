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

export const Catalogue = meta.story({ args: { path: '/assets' } });
export const TreacheryCards = meta.story({
  args: { path: '/assets/card-treachery' },
});

export const TreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun' },
});
export const Deck = meta.story({ args: { path: '/assets/deck/house-treachery' } });
export const DiscToken = meta.story({ args: { path: '/assets/token-disc/karama' } });
export const EnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach' },
});
export const Bundle = meta.story({ args: { path: '/assets/bundle/atreides-tokens' } });

export const CreateTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/create' },
});
export const CreateDeck = meta.story({ args: { path: '/assets/deck/create' } });
export const CreateDiscToken = meta.story({ args: { path: '/assets/token-disc/create' } });
export const CreateEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/create' },
});
export const CreateBundle = meta.story({ args: { path: '/assets/bundle/create' } });

export const EditTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun/edit' },
});
export const EditDeck = meta.story({ args: { path: '/assets/deck/house-treachery/edit' } });
export const EditDiscToken = meta.story({ args: { path: '/assets/token-disc/karama/edit' } });
export const EditEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach/edit' },
});
export const EditBundle = meta.story({
  args: { path: '/assets/bundle/atreides-tokens/edit' },
});

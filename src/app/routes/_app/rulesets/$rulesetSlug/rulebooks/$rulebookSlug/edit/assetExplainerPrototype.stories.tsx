import preview from '@sb/preview';

import { AssetExplainerPrototype } from './assetExplainerPrototype';

/* Two authoring interactions share one local draft in the existing editor composition. */
const meta = preview.meta({
  title: 'Rulebooks/AssetExplainer prototype',
  parameters: { layout: 'fullscreen' },
  globals: { colorScheme: 'dark', motion: 'reduce' },
});

export const Authoring = meta.story({ render: () => <AssetExplainerPrototype /> });

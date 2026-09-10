import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookResolvedAssetsById } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookRenderPageV1 } from '@shared/rulebooks/renderDocument';

import ernocSeedImage from './fixtures/card-guides/ernoc-seed.jpg?url';
import suppliesImage from './fixtures/card-guides/supplies.jpg?url';
import trishulaImage from './fixtures/card-guides/trishula.jpg?url';

type CardEntry = Extract<RulebookBlockDraft, { kind: 'card-entry' }>;
type CardGroup = Extract<RulebookBlockDraft, { kind: 'card-group' }>;

/**
 * Distinct published Cards from the public catalogue, captured on 10 September 2026.
 * Storybook serves these image snapshots locally to keep its examples independent of production.
 */
export const cardGuideAssets = {
  ns78nmym3qpth6sm9wsfj3ka9s8cw350: {
    assetId: 'ns78nmym3qpth6sm9wsfj3ka9s8cw350',
    name: 'Supplies!',
    type: 'card-treachery',
    imageUrl: suppliesImage,
  },
  ns7be7a1qgbfs50asvxc2cs7eh8cxwpp: {
    assetId: 'ns7be7a1qgbfs50asvxc2cs7eh8cxwpp',
    name: 'Ernoc Seed!',
    type: 'card-treachery',
    imageUrl: ernocSeedImage,
  },
  ns7cgwf2xm2ppj3c5jtpnnehf98cxcbq: {
    assetId: 'ns7cgwf2xm2ppj3c5jtpnnehf98cxcbq',
    name: 'Trishula!',
    type: 'card-treachery',
    imageUrl: trishulaImage,
  },
} satisfies RulebookResolvedAssetsById;

export function cardEntryFixture(): CardEntry {
  return {
    id: 'CARD',
    kind: 'card-entry',
    anchor: 'supplies-card',
    source: { kind: 'asset', assetId: 'ns78nmym3qpth6sm9wsfj3ka9s8cw350' },
    quantity: 1,
    text: 'Decide whether to use Supplies! before The Voice step. Keep the related cards together so their return at the end of the Battle Phase is easy to track.',
  };
}

export function cardGroupFixture(variant: CardGroup['variant'] = 'compact'): CardGroup {
  return {
    id: 'CRDS',
    kind: 'card-group',
    anchor: 'supplies-cards',
    title: 'The Supplies! cache',
    text: 'Supplies! opens a temporary choice of weapons and defenses. These two weapons illustrate how the related cards are used and returned.',
    variant,
    featuredItemId: 'SUPL',
    itemOrder: ['SUPL', 'SEED', 'TRSH'],
    itemsById: {
      SUPL: {
        id: 'SUPL',
        source: { kind: 'asset', assetId: 'ns78nmym3qpth6sm9wsfj3ka9s8cw350' },
        quantity: 1,
        text: 'Play before The Voice step to receive the Supplies! cards for this Battle Phase.',
      },
      SEED: {
        id: 'SEED',
        source: { kind: 'asset', assetId: 'ns7be7a1qgbfs50asvxc2cs7eh8cxwpp' },
        quantity: 1,
        text: 'A poison weapon. Check whether the opposing Leader has a poison defense.',
      },
      TRSH: {
        id: 'TRSH',
        source: { kind: 'asset', assetId: 'ns7cgwf2xm2ppj3c5jtpnnehf98cxcbq' },
        quantity: 1,
        text: 'A projectile weapon. Return it to the cache when it is lost or the Battle Phase ends.',
      },
    },
  };
}

export function cardGuidePage(blocks: Array<CardEntry | CardGroup>): RulebookRenderPageV1 {
  return {
    id: 'GUID',
    anchor: 'treachery-card-guide',
    title: 'Treachery cards',
    layoutId: 'single-column',
    showHeading: true,
    controlValues: {},
    regions: [
      {
        key: 'content',
        blocks: blocks.map((block) => {
          const rendered = projectRulebookDraftRenderBlock(block, cardGuideAssets);
          if (rendered.kind !== 'card-entry' && rendered.kind !== 'card-group') {
            throw new Error('Expected a Card guide fixture');
          }
          return rendered;
        }),
      },
    ],
  };
}

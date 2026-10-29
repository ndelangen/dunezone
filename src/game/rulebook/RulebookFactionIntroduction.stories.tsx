import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import {
  factionIntroductionFixture,
  FactionIntroductionStory,
  expectResponsiveFaction,
} from './RulebookFactionIntroduction.stories.fixture';
import { LiveReferenceStory, expectContainedReferences } from './RulebookLiveReferences.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Faction introduction/Rendered',
  component: FactionIntroductionStory,
  args: { width: 1000, narrow: false, block: factionIntroductionFixture() },
  parameters: { layout: 'centered' },
});

export const Wide = meta.story({ play: expectResponsiveFaction });
export const Narrow = meta.story({ args: { narrow: true }, play: expectResponsiveFaction });
export const ScaledPreview = meta.story({ args: { width: 600 }, play: expectResponsiveFaction });

const unavailableTokenBlock = factionIntroductionFixture();
export const UnavailableToken = meta.story({
  args: {
    block: {
      ...unavailableTokenBlock,
      faction:
        unavailableTokenBlock.faction.status === 'ready'
          ? { ...unavailableTokenBlock.faction, tokenImageUrl: undefined }
          : unavailableTokenBlock.faction,
    },
  },
  /* The layout holds with the token gone, and its slot names the gap. */
  play: async (context) => {
    await expectResponsiveFaction(context);
    await expect(within(context.canvasElement).getByRole('img', { name: 'Faction token unavailable' })).toBeVisible();
  },
});

export const Flipped = meta.story({
  args: { block: { ...factionIntroductionFixture(), flipped: true } },
  play: expectResponsiveFaction,
});

export const SquareFactionIntroduction = meta.story({
  render: () => <LiveReferenceStory index={2} size="square" />,
  play: expectContainedReferences,
});

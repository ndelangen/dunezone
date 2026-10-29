import { testingPreview } from '@sb/preview';
import { expect } from 'storybook/test';

import {
  factionIntroductionFixture,
  FactionIntroductionStory,
  expectResponsiveFaction,
} from './RulebookFactionIntroduction.stories.fixture';

const meta = testingPreview.meta({
  title: 'Blocks/Faction introduction/Rendered',
  component: FactionIntroductionStory,
  args: { width: 1000, narrow: false, block: factionIntroductionFixture() },
  parameters: { layout: 'centered' },
});
export const FlippedNarrow = meta.story({
  args: { narrow: true, block: { ...factionIntroductionFixture(), flipped: true } },
  play: expectResponsiveFaction,
});
export const ShortIntroduction = meta.story({
  args: { block: { ...factionIntroductionFixture(), text: 'The Atreides use knowledge to choose their battles.' } },
  play: async (context) => {
    await expectResponsiveFaction(context);
    const body = context.canvasElement.querySelector('.rulebookFactionBody')!.getBoundingClientRect();
    /* The printed reference's short row is about 22% as tall as it is wide. */
    await expect(body.height / body.width).toBeGreaterThan(0.2);
    await expect(body.height / body.width).toBeLessThan(0.23);
  },
});

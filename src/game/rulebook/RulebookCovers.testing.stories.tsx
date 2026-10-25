import { testingPreview } from '@sb/preview';
import { getRulebookCoverPreset } from '@shared/rulebooks/coverPresets';
import { rulebookDesignCatalogue, rulebookSizeCatalogue } from '@shared/rulebooks/settings';

import { CoverExample, expectCoverBounds } from './RulebookCovers.stories.fixture';

const meta = testingPreview.meta({
  title: 'Page/Cover/Rendered',
  component: CoverExample,
  args: { size: 'a4' as const, design: 'illustrated' as const },
  argTypes: {
    size: { control: 'radio', options: rulebookSizeCatalogue.map(({ id }) => id) },
    design: { control: 'radio', options: rulebookDesignCatalogue.map(({ id }) => id) },
  },
  parameters: { layout: 'fullscreen' },
});
export const DreamrulesRainbow = meta.story({
  args: {
    backgroundImageUrl: getRulebookCoverPreset('dreamrules-rainbow').imageUrl,
    title: 'dream rulebook',
    showSubtitle: false,
  },
  play: expectCoverBounds,
});

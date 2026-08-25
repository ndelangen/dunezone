import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Preview',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const FactionSheet = meta.story({
  args: { path: '/preview/sheet/house-atreides?mode=db', routeKey: 'factionSheet' },
  globals: { viewport: { value: 'page' } },
});

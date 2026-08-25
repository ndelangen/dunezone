import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Factions',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const Catalogue = meta.story({ args: { path: '/factions', routeKey: 'factions' } });
export const Detail = meta.story({ args: { path: '/factions/house-atreides', routeKey: 'factionDetail' } });
export const Create = meta.story({ args: { path: '/factions/create', routeKey: 'factionCreate' } });
export const Edit = meta.story({ args: { path: '/factions/house-atreides/edit', routeKey: 'factionEdit' } });

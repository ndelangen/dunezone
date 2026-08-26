import preview from '@sb/preview';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Factions',
  ...pageStoryMeta,
});

export const Catalogue = meta.story({ args: { path: '/factions' } });
export const Detail = meta.story({ args: { path: '/factions/house-atreides' } });
export const Create = meta.story({ args: { path: '/factions/create' } });
export const Edit = meta.story({ args: { path: '/factions/house-atreides/edit' } });

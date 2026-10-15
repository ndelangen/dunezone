import preview from '@sb/preview';

import { pageStoryMeta } from '../../../../storybookConfig';

/* The token create page as it is served, which is the layout the editor's own stories reproduce. */
const meta = preview.meta({ ...pageStoryMeta, title: 'Assets/Token editor' });

/** A disc token's blank page: the shape every other token editor is adapted from. */
export const Disc = meta.story({ args: { path: '/assets/token-disc/create' } });

/** A pointer token's blank page: the same workbench, every proof cut to the teardrop. */
export const Pointer = meta.story({ args: { path: '/assets/token-pointer/create' } });

import { db } from '@db/storybook';

export const pageStoryArgs = { path: '/' };
export const pageStoryParameters = {
  controls: { disable: true },
  layout: 'fullscreen',
  database: db((baseline) => baseline),
};
export const pageStoryGlobals = { viewport: { value: 'appDesktop' } };

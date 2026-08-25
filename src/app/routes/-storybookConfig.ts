import { db } from '@db/storybook';

export const pageStoryArgs = { path: '/', routeKey: 'home' as const };
export const pageStoryParameters = {
  controls: { disable: true },
  layout: 'fullscreen',
  database: db((baseline) => baseline),
};
export const pageStoryGlobals = { viewport: { value: 'appDesktop' } };

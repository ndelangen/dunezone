import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Site',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const NotFound = meta.story({ args: { path: '/a-page-that-does-not-exist', routeKey: 'notFound' } });
export const Icons = meta.story({ args: { path: '/__icons', routeKey: 'icons' } });
export const PublicationJobs = meta.story({ args: { path: '/__jobs', routeKey: 'publicationJobs' } });
export const FuturePlans = meta.story({ args: { path: '/future-plans', routeKey: 'futurePlans' } });
export const Privacy = meta.story({ args: { path: '/privacy', routeKey: 'privacy' } });

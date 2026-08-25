import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Profiles',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const Directory = meta.story({ args: { path: '/profiles', routeKey: 'profiles' } });
export const Detail = meta.story({
  args: { path: '/profiles/storybook-viewer', routeKey: 'profileDetail' },
});
export const Settings = meta.story({
  args: { path: '/profiles/storybook-viewer/edit', routeKey: 'profileEdit' },
});
export const DeleteAccount = meta.story({
  args: { path: '/profiles/storybook-viewer/delete', routeKey: 'profileDelete' },
});

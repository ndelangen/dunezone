import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Auth',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const Login = meta.story({
  args: { path: '/auth/login' },
  parameters: { identity: null },
});
export const OAuthError = meta.story({
  args: { path: '/auth/error?error=oauth_failed' },
  parameters: { identity: null },
});

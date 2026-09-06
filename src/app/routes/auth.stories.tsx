import preview from '@sb/preview';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Auth',
  ...pageStoryMeta,
});

export const Login = meta.story({
  args: { path: '/auth/login' },
  parameters: { identity: null },
});
export const OAuthError = meta.story({
  args: { path: '/auth/error?error=oauth_failed' },
  parameters: { identity: null },
});

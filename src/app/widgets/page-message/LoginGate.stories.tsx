import preview from '@sb/preview';

import { LoginGate } from './LoginGate';

const meta = preview.meta({
  component: LoginGate,
  parameters: { layout: 'padded' },
  args: { action: 'create a faction' },
});

/** The offer a signed-out reader gets. The words after "Log in to" are the page's, so the sentence names the thing they came to do rather than signing in for its own sake. */
export const Gated = meta.story({});

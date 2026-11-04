import preview from '@sb/preview';
import { expect, fn } from 'storybook/test';

import { ClearChatAction } from './ClearChatAction';

/* The eraser a chat window carries in its title bar while the chat has messages to clear. */
const meta = preview.meta({
  title: 'Play/Panels/Chat/Clear chat',
  component: ClearChatAction,
  args: { onClear: fn() },
});

/** At rest: held, it clears the chat for the viewer only. */
export const AtRest = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Clear chat' })).toBeVisible();
  },
});

import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor } from 'storybook/test';

import { conversationMessages } from '../../game.stories.fixture';
import { conversationPanelMeta, pendingMessage, savedPage } from './ConversationPanel.stories.fixture';

const meta = testingPreview.meta({ ...conversationPanelMeta, title: 'Play/Panels/Chat' });

/** Enter sends the message and empties the composer. */
export const Sends = meta.story({
  play: async ({ args, canvas }) => {
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, 'Hold the line{Enter}');
    await expect(args.onSubmit).toHaveBeenCalledWith('Hold the line');
    await expect(composer).toHaveValue('');
  },
});

/** Earlier messages loads the page before the oldest one shown. */
export const LoadsEarlierMessages = meta.story({
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Earlier messages' }));
    await expect(args.onLoad).toHaveBeenCalledWith(6);
  },
});

/** Retry sends a failed message again. */
export const RetriesAFailedSend = meta.story({
  args: { pending: [pendingMessage({ state: 'failed', error: 'The message could not be saved.' })] },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await expect(args.onRetry).toHaveBeenCalledWith('pending-one');
  },
});

/** An unread newest message, once seen, marks the conversation read through it. */
export const MarksRead = meta.story({
  args: { page: savedPage(conversationMessages().slice(-3)), unread: true },
  play: async ({ args }) => {
    await waitFor(() => expect(args.onRead).toHaveBeenCalledWith(55));
  },
});

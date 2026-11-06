import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { conversationMessages } from '../../game.stories.fixture';
import {
  conversationPanelMeta,
  pendingMessage,
  savedPage,
  tableChatArgs,
  tableChatNamingArgs,
} from './ConversationPanel.stories.fixture';

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

/** Shift+Enter keeps a line break in the draft; Enter sends both lines together. */
export const MultilineMessage = meta.story({
  play: async ({ args, canvas }) => {
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, 'First line');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.type(composer, 'Second line');
    await expect(composer).toHaveValue('First line\nSecond line');
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    await expect(args.onSubmit).toHaveBeenCalledWith('First line\nSecond line');
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

/** Escape in the composer hands the keyboard back to the table: the composer lets go of the focus. */
export const EscapeLeavesTheComposer = meta.story({
  play: async ({ canvas }) => {
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.click(composer);
    await userEvent.keyboard('{Escape}');
    await expect(composer).not.toHaveFocus();
  },
});

/* The suggestions open in a portal, beside the window rather than inside it. */
const suggestions = () => within(document.body);

/** Tab writes the highlighted name with one space after it; the arrows move the highlight first, and a second space typed straight after is not written. */
export const TabCompletesAMention = meta.story({
  args: tableChatArgs(),
  play: async ({ args, canvas }) => {
    const second = args.mentions!.filter((mention) => !mention.own)[1]!;
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, 'Ask @');
    const [first] = await suggestions().findAllByRole('option');
    await expect(first).toHaveAttribute('data-combobox-selected');
    await userEvent.keyboard('{ArrowDown}{Tab}');
    await expect(composer).toHaveValue(`Ask @${second.label} `);
    await expect(composer).toHaveFocus();
    await userEvent.keyboard(' now');
    await expect(composer).toHaveValue(`Ask @${second.label} now`);
  },
});

/** A click on a suggestion writes it, as Tab does. */
export const ClickCompletesAMention = meta.story({
  args: tableChatArgs(),
  play: async ({ args, canvas }) => {
    const target = args.mentions!.filter((mention) => !mention.own).at(-1)!;
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, `@${target.label.slice(0, 3)}`);
    const [option] = await suggestions().findAllByRole('option');
    await expect(option).toHaveTextContent(new RegExp(`^${target.label}`));
    await userEvent.click(option!);
    await expect(composer).toHaveValue(`@${target.label} `);
    await waitFor(() => expect(suggestions().queryByRole('listbox')).toBeNull());
  },
});

/** What matches nobody stays plain text, and the suggestions go. */
export const UnmatchedStaysText = meta.story({
  args: tableChatArgs(),
  play: async ({ canvas }) => {
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, '@');
    await suggestions().findAllByRole('option');
    await userEvent.type(composer, 'zzz');
    await waitFor(() => expect(suggestions().queryByRole('option')).toBeNull());
    await userEvent.keyboard('{Tab}');
    await expect(composer).toHaveValue('@zzz');
  },
});

/** A player's name finds their faction, and the faction's name is what gets written. */
export const PlayerNameCompletesTheirFaction = meta.story({
  args: tableChatArgs(),
  play: async ({ args, canvas }) => {
    const seat = args.mentions!.find((mention) => !mention.own && mention.detail)!;
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, `@${seat.detail!.slice(0, 3).toLowerCase()}`);
    await suggestions().findAllByRole('option');
    await userEvent.keyboard('{Tab}');
    await expect(composer).toHaveValue(`@${seat.label} `);
  },
});

/** While the suggestions are open, Enter takes the highlighted name instead of sending; Escape closes them, and a second Escape leaves the composer. */
export const EnterCompletesAndEscapeCloses = meta.story({
  args: tableChatArgs(),
  play: async ({ args, canvas }) => {
    const first = args.mentions!.filter((mention) => !mention.own)[0]!;
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, '@');
    await suggestions().findAllByRole('option');
    await userEvent.keyboard('{Enter}');
    await expect(composer).toHaveValue(`@${first.label} `);
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.type(composer, '@');
    await suggestions().findAllByRole('option');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(suggestions().queryByRole('option')).toBeNull());
    await expect(composer).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(composer).not.toHaveFocus();
  },
});

/** A completed @ suggests nothing more, but once the message is sent, the next message's @ suggests again. */
export const SuggestsAgainAfterSending = meta.story({
  args: tableChatArgs(),
  play: async ({ canvas }) => {
    const composer = canvas.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, '@');
    await suggestions().findAllByRole('option');
    await userEvent.keyboard('{Tab}hello{Enter}');
    await expect(composer).toHaveValue('');
    await userEvent.type(composer, '@');
    await expect(await suggestions().findAllByRole('option')).not.toHaveLength(0);
  },
});

/** A named seat is reachable from the keyboard: focusing it opens its card. */
export const NamedSeatOpensOnFocus = meta.story({
  args: tableChatNamingArgs(),
  play: async ({ canvasElement }) => {
    const named = canvasElement.querySelector<HTMLElement>('[data-mention]')!;
    for (let step = 0; step < 40 && document.activeElement !== named; step += 1) {
      await userEvent.tab();
    }
    await expect(named).toHaveFocus();
    await expect(await suggestions().findByRole('button', { name: 'Info' })).toBeVisible();
  },
});

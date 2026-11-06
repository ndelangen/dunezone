import { testingPreview } from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { tableChatArgs } from './ConversationPanel.stories.fixture';
import { MentionCard } from './MentionText';

const other = () => tableChatArgs().mentions!.find((mention) => !mention.own && mention.detail)!;

const meta = testingPreview.meta({
  title: 'Play/Panels/Chat/Mention card',
  component: MentionCard,
  args: {
    seats: [other()],
    children: <span>{`@${other().label}`}</span>,
    initiallyOpened: true,
    onInfo: fn(),
    onChat: fn(),
  },
});

/** Info brings up the seat's faction information; Chat opens the chat with its player. */
export const OpensInfoAndChat = meta.story({
  play: async ({ args }) => {
    const card = within(document.body);
    await userEvent.click(await card.findByRole('button', { name: 'Info' }));
    await expect(args.onInfo).toHaveBeenCalledWith(args.seats[0]!.id);
    await userEvent.click(card.getByRole('button', { name: 'Chat' }));
    await expect(args.onChat).toHaveBeenCalledWith(args.seats[0]!.id);
  },
});

/** A seat's line is a stop for Tab inside its card, named in full however short the card cuts it (its tooltip shows the same words). */
export const SeatLineShowsInFull = meta.story({
  args: { seats: [{ ...other(), detail: 'A player whose display name runs on and on well past any sensible length' }] },
  play: async ({ args }) => {
    const card = within(document.body);
    await userEvent.click(await card.findByRole('button', { name: 'Info' }));
    await userEvent.tab({ shift: true });
    const line = document.querySelector<HTMLElement>('[data-seat-line]')!;
    await expect(line).toHaveFocus();
    await expect(line).toHaveAccessibleName(`${args.seats[0]!.detail} is playing ${args.seats[0]!.label}`);
  },
});

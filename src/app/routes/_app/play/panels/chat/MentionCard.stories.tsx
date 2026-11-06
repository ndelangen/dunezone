import preview from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import { tableChatArgs } from './ConversationPanel.stories.fixture';
import { MentionCard } from './MentionText';

/* A seat named in a table chat message: the underlined name, and the card hovering it shows, open here from the start. */
const seats = () => tableChatArgs().mentions!;
const other = () => seats().find((mention) => !mention.own && mention.detail)!;

const meta = preview.meta({
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

const card = () => within(document.body);

/** Another player's seat: their avatar and name, their faction's token and name, and Info and Chat. */
export const AnotherSeat = meta.story({
  play: async ({ args }) => {
    await expect(await card().findByText(args.seats[0]!.detail!)).toBeVisible();
    await expect(card().getByRole('button', { name: 'Info' })).toBeVisible();
    await expect(card().getByRole('button', { name: 'Chat' })).toBeVisible();
  },
});

/** The viewer's own seat: there is nobody to chat with, so only Info. */
export const OwnSeat = meta.story({
  args: { seats: [seats().find((mention) => mention.own)!] },
  play: async () => {
    await expect(await card().findByRole('button', { name: 'Info' })).toBeVisible();
    await expect(card().queryByRole('button', { name: 'Chat' })).toBeNull();
  },
});

/** Two seats whose factions share a name: the name cannot tell them apart, so the card shows both. */
export const SharedFactionName = meta.story({
  args: {
    seats: [
      other(),
      {
        ...seats().find((mention) => !mention.own && mention.detail && mention.id !== other().id)!,
        label: other().label,
      },
    ],
  },
  play: async ({ args }) => {
    await expect(await card().findByText(args.seats[1]!.detail!)).toBeVisible();
  },
});

/** Names longer than the card has room for: they end in an ellipsis on the one line, and Info and Chat stay in reach. */
export const LongNames = meta.story({
  args: {
    seats: [
      {
        ...other(),
        detail: 'A player whose display name runs on and on well past any sensible length',
        label: 'The Exceedingly Long-Named Faction of the Deep Desert',
      },
    ],
  },
  play: async () => {
    const chat = await card().findByRole('button', { name: 'Chat' });
    await expect(chat.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
  },
});

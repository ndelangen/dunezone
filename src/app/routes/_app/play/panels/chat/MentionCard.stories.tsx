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
    mention: other(),
    written: `@${other().label}`,
    initiallyOpened: true,
    onInfo: fn(),
    onChat: fn(),
  },
});

const card = () => within(document.body);

/** Another player's seat: their avatar and name, their faction's token and name, and Info and Chat. */
export const AnotherSeat = meta.story({
  play: async ({ args }) => {
    await expect(await card().findByText(args.mention.detail!)).toBeVisible();
    await expect(card().getByRole('button', { name: 'Info' })).toBeVisible();
    await expect(card().getByRole('button', { name: 'Chat' })).toBeVisible();
  },
});

/** The viewer's own seat: there is nobody to chat with, so only Info. */
export const OwnSeat = meta.story({
  args: { mention: seats().find((mention) => mention.own)! },
  play: async () => {
    await expect(await card().findByRole('button', { name: 'Info' })).toBeVisible();
    await expect(card().queryByRole('button', { name: 'Chat' })).toBeNull();
  },
});

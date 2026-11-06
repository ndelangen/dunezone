import preview from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import { tableChatArgs } from '../ConversationPanel.stories.fixture';
import { MentionCard } from '../MentionText';
import { SeatCardBold } from './SeatCardBold';
import { SeatCardInline } from './SeatCardInline';
import { SeatCardLabeled } from './SeatCardLabeled';
import { SeatCardToolbar } from './SeatCardToolbar';

/* The four layouts for a seat's card, each open over the @ that names the seat, to compare. */
const other = () => tableChatArgs().mentions!.find((mention) => !mention.own && mention.detail)!;

const meta = preview.meta({
  title: 'Play/Panels/Chat/Seat card options',
  component: MentionCard,
  args: {
    mention: other(),
    children: <span style={{ textDecoration: 'underline' }}>{`@${other().label}`}</span>,
    initiallyOpened: true,
    onInfo: fn(),
    onChat: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ paddingTop: 220, paddingLeft: 24 }}>
        <Story />
      </div>
    ),
  ],
});

const card = () => within(document.body);

/** A: one line, Info and Chat as quiet icons at its end behind a rule. */
export const AInline = meta.story({
  args: { card: SeatCardInline },
  play: async () => {
    await expect(await card().findByRole('button', { name: 'Chat' })).toBeVisible();
  },
});

/** B: the line, then a toolbar of icon actions under a rule, as Faction info has. */
export const BToolbar = meta.story({
  args: { card: SeatCardToolbar },
  play: async () => {
    await expect(await card().findByRole('button', { name: 'Chat' })).toBeVisible();
  },
});

/** C: the line, then labelled Info and Chat actions. */
export const CLabeled = meta.story({
  args: { card: SeatCardLabeled },
  play: async () => {
    await expect(await card().findByRole('button', { name: 'Chat' })).toBeVisible();
  },
});

/** D: one line, names bold with "is playing" dimmed, and labelled Info and Chat at its end. */
export const DBold = meta.story({
  args: { card: SeatCardBold },
  play: async () => {
    await expect(await card().findByRole('button', { name: 'Chat' })).toBeVisible();
  },
});

import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { voiceParameters } from '../../../discord.stories.fixture';
import { openCompass } from '../controls.stories.fixture';
import { gameMeta, install, session } from '../game.stories.fixture';
import { productTransport } from '../product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Compass controls',
  globals: { motion: 'reduce' },
  beforeEach: [
    install(() => productTransport('seat-2')),
    () => {
      const previous = localStorage.getItem('dunezone-compass:slots');
      localStorage.removeItem('dunezone-compass:slots');
      return () => {
        if (previous === null) {
          localStorage.removeItem('dunezone-compass:slots');
        } else {
          localStorage.setItem('dunezone-compass:slots', previous);
        }
      };
    },
  ],
});

async function chatBar(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const chats = await page.findByRole('navigation', { name: 'Chats' }, { timeout: 30_000 });
  const launcher = page.getByRole('button', { name: /^Controls/ });
  const own = page.getByRole('button', { name: /^Hand & spice, you are playing as/ });
  const buttons = within(chats).getAllByRole('button');
  await expect(buttons).toHaveLength(6);
  return { chats, launcher, own, buttons };
}

/** A centered bar uses both halves of the table before wrapping any chat tokens. */
export const ChatBarUsesTableWidth = meta.story({
  globals: { viewport: { value: 'contentColumn' } },
  play: async ({ canvasElement }) => {
    const { chats, launcher, own, buttons } = await chatBar(canvasElement);
    await waitFor(async () => {
      const chat = chats.getBoundingClientRect();
      const control = launcher.getBoundingClientRect();
      await expect(chat.left).toBeGreaterThanOrEqual(control.right);
      await expect(Math.abs(chat.top - control.top)).toBeLessThan(2);
      await expect(own.getBoundingClientRect().right).toBeLessThanOrEqual(control.left);
      const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
      await expect(new Set(tops).size).toBe(1);
    });
  },
});

/** When the whole bar cannot fit, chats take a second row without shrinking or leaving the table. */
export const ChatBarWrapsOnNarrowTables = meta.story({
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const { chats, launcher, own, buttons } = await chatBar(canvasElement);
    const bar = chats.closest('[data-compass-bar]')!;
    const table = chats.closest('[data-compass-controls]')!;
    await waitFor(async () => {
      const chat = chats.getBoundingClientRect();
      const control = launcher.getBoundingClientRect();
      const bounds = bar.getBoundingClientRect();
      const tableBounds = table.getBoundingClientRect();
      await expect(chat.top).toBeGreaterThanOrEqual(control.bottom);
      await expect(bounds.left).toBeGreaterThanOrEqual(tableBounds.left + 12);
      await expect(bounds.right).toBeLessThanOrEqual(tableBounds.right - 12);
      await expect(own.getBoundingClientRect().width).toBeCloseTo(own.getBoundingClientRect().height, 0);
      const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
      await expect(new Set(tops).size).toBe(1);
      for (const button of buttons) {
        const bounds = button.getBoundingClientRect();
        await expect(bounds.width).toBeCloseTo(bounds.height, 0);
      }
    });
  },
});

/** A faction's name typed while Space is still held from opening the compass keeps every letter, and Enter opens its Faction info. */
export const SearchOpensFactionInfo = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chatBar(canvasElement);
    await userEvent.keyboard('[Space>]atreides[/Space]');
    /* The search answers on a render after the keys, so its line is awaited before Enter picks it. */
    await waitFor(async () => {
      await expect(page.getByRole('textbox', { name: 'Search controls' })).toHaveValue('atreides');
      const first = page.getAllByRole('option')[0];
      await expect(first).toHaveTextContent(/Atreides/);
      await expect(first).toHaveTextContent(/Faction info/);
    });
    await userEvent.keyboard('{Enter}');
    await waitFor(async () => {
      const header = canvasElement.ownerDocument.querySelector('[data-faction-info-seat]');
      await expect(header).toHaveTextContent(/Atreides/);
    });
  },
});

/** An opened chat is ready to type in; Escape hands the keys back to the table and keeps the chat open, and a second Escape closes it. */
export const OpenedChatTakesTheKeys = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const { buttons } = await chatBar(canvasElement);
    await userEvent.click(buttons[0]!);
    const chat = await waitFor(() => document.querySelector<HTMLElement>('[data-window="table-chat"]')!);
    const composer = await within(chat).findByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(composer).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await expect(composer).not.toHaveFocus();
    await expect(chat).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(chat).not.toBeInTheDocument());
  },
});

/** Choosing a recipient in the compass sends one explicit request without creating a chat message. */
export const NudgeSendsDiscordRequest = meta.story({
  parameters: voiceParameters(),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: /^Controls/ }, { timeout: 30_000 });
    const target = session.transport.snapshot.roster!.seats.find((seat) => seat.id === 'seat-1')!;
    const compass = await openCompass(page);
    await userEvent.type(compass.getByRole('textbox', { name: 'Search controls' }), `nudge ${target.faction!.name}`);
    await userEvent.click(await compass.findByText(`Nudge ${target.faction!.name}`, { exact: true }));
    await waitFor(() =>
      expect(session.transport.messages.filter((message) => message.type === 'nudge')).toEqual([
        { type: 'nudge', requestId: expect.any(String), toSeat: target.id },
      ])
    );
    await expect(session.transport.messages.filter((message) => message.type === 'conversation-send')).toEqual([]);
    await expect(page.queryByRole('dialog', { name: 'Controls compass' })).toBeNull();
  },
});

async function expectNoNudge(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByRole('button', { name: /^Controls/ }, { timeout: 30_000 });
  const compass = await openCompass(page);
  await userEvent.type(compass.getByRole('textbox', { name: 'Search controls' }), 'nudge');
  await waitFor(() => expect(compass.queryAllByRole('option')).toHaveLength(0));
  await expect(session.transport.messages.filter((message) => message.type === 'nudge')).toEqual([]);
}

/** A game without Discord voice offers no Discord nudge command. */
export const NudgeUnavailableWithoutVoice = meta.story({
  play: async ({ canvasElement }) => expectNoNudge(canvasElement),
});

/** A spectator can join voice but cannot nudge a seated player. */
export const NudgeUnavailableForSpectators = meta.story({
  parameters: voiceParameters(),
  beforeEach: install(() => productTransport('neutral')),
  play: async ({ canvasElement }) => expectNoNudge(canvasElement),
});

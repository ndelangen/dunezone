import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import type { StoredSnapshot } from '../../../../../../workers/game/state';
import { gameMeta, install } from '../game.stories.fixture';
import { chapter, journeySteps, journeyViewers } from '../journey.stories.fixture';
import { sandboxTransport } from '../sandbox.stories.fixture';
import { HandWindowHarness } from './HandWindow.stories.fixture';

/*
 * The Hand & spice window on its own, in a bottom-left slot, with the Private side-table window bottom right.
 * It runs on the game Worker's own table in the browser, started from the recorded journey (captured from production),
 * so every action really happens: withdrawn spice leaves the reserve, a piece set aside lands on the side-table, the plan fills.
 * Right-click a piece for its actions. The seat control views the same table as another faction.
 */
const meta = preview.meta({
  title: 'Play/Windows/Hand and spice',
  component: HandWindowHarness,
  decorators: gameMeta.decorators,
  globals: { motion: 'on' },
  argTypes: { seat: { control: 'select', options: journeyViewers().filter((seat) => seat !== 'neutral') } },
  parameters: { layout: 'fullscreen', playDebugger: true, chromatic: { disableSnapshot: true } },
});

/* Treachery cards from the production catalogue, beside the recording's one Snooper, so the hand holds a real mix. */
const TREACHERY = [
  ['crysknife', 'Crysknife'],
  ['chaumas', 'Chaumas'],
  ['shield', 'Shield'],
  ['cheap-hero', 'Cheap Hero'],
] as const;

/* Atreides draws them as Treachery cards are drawn: copies of its Snooper with each card's own face. */
function withTreachery(stored: StoredSnapshot): StoredSnapshot {
  const hand = stored.factionInventories['house-atreides'] ?? [];
  const snooper = hand.find((piece) => piece.items[0]?.artwork?.name === 'Snooper');
  if (!snooper) {
    return stored;
  }
  const drawn = TREACHERY.map(([file, name]) => ({
    ...snooper,
    id: `story-treachery-${file}`,
    items: snooper.items.map((item) => ({
      ...item,
      id: `story-treachery-${file}-item`,
      artwork: { ...item.artwork!, name, front: item.artwork!.front!.replace('snooper.jpg', `${file}.jpg`) },
    })),
  }));
  return { ...stored, factionInventories: { ...stored.factionInventories, 'house-atreides': [...hand, ...drawn] } };
}

/* The live table from the recorded journey: Atreides mid-game with leaders, Treachery, Traitor and Alliance cards, or earlier at Shipment. */
/* The seat Atreides holds at that step, found by its faction, so a re-recorded journey that reseats the factions keeps the same hand. */
function atreidesSeat(start: number) {
  const views = journeySteps()[start]!.views;
  return Object.keys(views).find((seat) => views[seat]!.snapshot.bank?.factionId === 'house-atreides') ?? 'seat-1';
}

const at =
  (title: string) =>
  ({ args }: { args: { seat?: string } }) => {
    const start = chapter(title) - 1;
    return install(() => sandboxTransport({ start, seat: args.seat ?? atreidesSeat(start), prepare: withTreachery }))();
  };

/** Atreides mid-game: right-click a piece to play it in front of you or set it on the side-table, and withdraw spice. */
export const FullHand = meta.story({
  beforeEach: at('Battle plan'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* A right-click on a card sets it on the side-table, where the side-table window shows it. */
    const crysknife = await page.findByRole('button', { name: 'Drag Crysknife from hand' }, { timeout: 30_000 });
    await userEvent.pointer({ keys: '[MouseRight]', target: crysknife });
    await userEvent.click(await page.findByRole('menuitem', { name: 'Move to private side-table' }));
    await expect(
      page.findByRole('button', { name: 'Move Crysknife on private side-table' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Drag Crysknife from hand' })).toBeNull();
    /* The hand knows nothing of battles: a leader's menu offers the same two actions as a card's. */
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: page.getByRole('button', { name: 'Drag Lady Jessica from hand' }),
    });
    await expect(page.findAllByRole('menuitem')).resolves.toHaveLength(2);
    await userEvent.keyboard('{Escape}');
    /* Stepping the amount up and withdrawing takes it out of the reserve. */
    const before = Number(page.getByLabelText('Spice reserve balance').textContent);
    await userEvent.click(page.getByRole('button', { name: 'More: Spice to withdraw' }));
    await userEvent.click(page.getByRole('button', { name: 'Withdraw spice' }));
    await waitFor(() => expect(page.getByLabelText('Spice reserve balance')).toHaveTextContent(String(before - 2)));
    /* The window is left as a player would see it, with no focus ring. */
    (canvasElement.ownerDocument.activeElement as HTMLElement | null)?.blur();
  },
});

/** Earlier, at Shipment, with a smaller hand. */
export const AtShipment = meta.story({ beforeEach: at('Shipment') });

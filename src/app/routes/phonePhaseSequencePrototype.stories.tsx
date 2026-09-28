/*
 * PROTOTYPE, #1398. Throwaway, on prototype/1398-phone-phase-sequence, which never merges.
 *
 * The faction edit route on its Phases chapter, with each way the phase sequence can sit in the phone thumbnail.
 * The faction row is Bene Gesserit as copied from the public catalogue on 2026-09-21 (`_app/play/product.stories.fixture/factions.json`).
 * No public faction declared a phase on 2026-09-28, so its four phases are staged from its own advantages: Prediction, Charity, Spiritual Advisors and The Voice.
 * The Storybook viewer owns the row so the edit page opens.
 * Pick a story, set a phone viewport, then flip the floating bar at the bottom, or set `?variant=a|b|c` on the route.
 * The variants differ only below a 38rem stage, where the preview column narrows towards the 7rem thumbnail.
 */
import preview from '@sb/preview';
import { FactionInputSchema } from '@shared/factions/schema';
import { within, userEvent } from 'storybook/test';

import type { StorybookDatabase } from '@db/storybook';
import { db, ref } from '@db/storybook';

import capturedFactions from './_app/play/product.stories.fixture/factions.json';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Prototype 1398 phone phase sequence',
  ...pageStoryMeta,
});

const beneGesserit = capturedFactions.find((entry) => entry.slug === 'bene-gesserit');
if (!beneGesserit) {
  throw new Error('The product factions have no Bene Gesserit.');
}

/* Each phase's instructions are the faction's own advantage text, cut to the part the phase asks of the player. */
const STAGED_PHASES = [
  {
    id: 'bg-prediction',
    type: 'prediction',
    title: 'Prediction',
    symbol: '/vector/icon/eye.svg',
    before: 'traitors',
    priority: 10,
    allPlayersMustBeReady: false,
    instructions:
      'Secretly choose a turn number and a faction. If that faction wins the game on that turn, you win instead.',
  },
  {
    id: 'bg-charity',
    type: 'instruction',
    title: 'Charity',
    symbol: '/vector/icon/spice.svg',
    before: 'choam-charity',
    priority: 10,
    allPlayersMustBeReady: false,
    instructions: 'You always receive CHOAM charity.',
  },
  {
    id: 'bg-spiritual-advisors',
    type: 'instruction',
    title: 'Spiritual Advisors',
    symbol: '/vector/icon/flip.svg',
    before: 'shipment-and-movement',
    priority: 10,
    allPlayersMustBeReady: false,
    instructions:
      'You may flip any number of groups of advisors to fighters. Groups with no other faction present become fighters.',
  },
  {
    id: 'bg-the-voice',
    type: 'instruction',
    title: 'The Voice',
    symbol: '/vector/icon/lightning.svg',
    before: 'battle',
    priority: 10,
    allPlayersMustBeReady: false,
    instructions: 'In each of your battles you may force your opponent to play or not play a Treachery Card.',
  },
];

const withPhases = db((baseline: StorybookDatabase) => {
  baseline.factions.push({
    $key: 'faction:bene-gesserit',
    owner_id: ref('storybook-viewer'),
    data: FactionInputSchema.parse({ ...beneGesserit.data, extraPhases: STAGED_PHASES }),
    slug: beneGesserit.slug,
    created_at: beneGesserit.updated_at,
    updated_at: beneGesserit.updated_at,
    is_deleted: false,
    group_id: null,
  });
});

/* The section tabs fold into a picker on a phone, so the chapter is chosen through whichever the width shows. */
async function openPhases({ canvasElement }: { canvasElement: HTMLElement }) {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 30_000 });
  const tab = page.queryByRole('tab', { name: /Phases/ });
  if (tab) {
    await userEvent.click(tab);
  } else {
    await userEvent.click(page.getByRole('combobox', { name: 'Faction editor sections' }));
    await userEvent.click(await page.findByRole('option', { name: /Phases/ }));
  }
  await page.findByRole('region', { name: 'Faction phases live preview' }, { timeout: 10_000 });
}

export const PhasesA = meta.story({
  args: { path: '/factions/bene-gesserit/edit' },
  parameters: { database: withPhases },
  play: openPhases,
});
export const PhasesB = meta.story({
  args: { path: '/factions/bene-gesserit/edit?variant=b' },
  parameters: { database: withPhases },
  play: openPhases,
});
export const PhasesC = meta.story({
  args: { path: '/factions/bene-gesserit/edit?variant=c' },
  parameters: { database: withPhases },
  play: openPhases,
});

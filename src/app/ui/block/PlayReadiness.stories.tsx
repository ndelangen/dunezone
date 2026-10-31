import preview from '@sb/preview';
import { Surface } from '@ui/surface';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { PlayReadinessCheck } from '@db/play';

import { PlayReadiness } from './PlayReadiness';

/* The production verdicts of 2026-10-31, read through the game's own capture code. */
const GF9_FACTIONS = [
  'Harkonnen',
  'Emperor',
  'Spacing Guild',
  'Fremen',
  'Bene Gesserit',
  'Ixians',
  'Tleilaxu',
  'Richese',
  'CHOAM',
  'Ecaz',
  'Moritani',
];
const KISS_FACTIONS = [
  'House Atreides (KISS)',
  'House Harkonnen (KISS)',
  'Bene Tleilax (KISS)',
  'Fremen',
  'Emperor',
  'Spacing Guild',
];
const ready = (names: string[]) => names.map((name) => ({ kind: 'faction' as const, id: name, name, problems: [] }));
/* Typed once here, so each story's check keeps its literal status. */
const checked = (check: PlayReadinessCheck) => check;

const meta = preview.meta({
  component: PlayReadiness,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Surface padding="lg">
        <Story />
      </Surface>
    ),
  ],
  args: {
    onRecheck: fn(),
    check: checked({
      status: 'checked',
      entries: [
        {
          kind: 'ruleset',
          id: 'gf9',
          name: 'GF9',
          problems: [
            { subject: 'Treachery deck', reason: 'A ruleset needs a non-empty treachery deck.' },
            {
              subject: 'Custom token bundles: Homeworld Reserves',
              reason: 'Add playable members before requesting this asset.',
            },
          ],
        },
        {
          kind: 'faction',
          id: 'atreides',
          name: 'Atreides',
          problems: [
            {
              subject: 'Extra: kwisatz-haderach-reference',
              reason: 'This asset has no complete playable definition.',
            },
          ],
        },
        ...ready(GF9_FACTIONS),
      ],
    }),
  },
});

/** GF9 as production has it: the ruleset blocks a game, and one faction would be set aside. */
export const RulesetBlocked = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('A game cannot start with this ruleset yet.');
    await expect(canvas.getByText('Treachery deck: A ruleset needs a non-empty treachery deck.')).toBeVisible();
    await expect(canvas.getByText('11 factions ready')).toBeVisible();
  },
});

/** Only factions are left: a game starts, and the draft sets them aside. */
export const FactionsSetAside = meta.story({
  args: {
    check: checked({
      status: 'checked',
      entries: [
        { kind: 'ruleset', id: 'gf9', name: 'GF9', problems: [] },
        {
          kind: 'faction',
          id: 'atreides',
          name: 'Atreides',
          problems: [
            {
              subject: 'Extra: kwisatz-haderach-reference',
              reason: 'This asset has no complete playable definition.',
            },
          ],
        },
        ...ready(GF9_FACTIONS),
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('The draft sets aside the faction below');
  },
});

/** KISS as production has it: no decks at all, every faction ready. */
export const NoDecks = meta.story({
  args: {
    check: checked({
      status: 'checked',
      entries: [
        {
          kind: 'ruleset',
          id: 'kiss',
          name: 'KISS',
          problems: [
            { subject: 'Treachery deck', reason: 'A ruleset needs a non-empty treachery deck.' },
            { subject: 'Spice deck', reason: 'A ruleset needs a non-empty spice deck.' },
          ],
        },
        ...ready(KISS_FACTIONS),
      ],
    }),
  },
});

/** Everything a game captures is ready, as Dreamrules is. */
export const Ready = meta.story({
  args: {
    check: checked({
      status: 'checked',
      entries: [
        { kind: 'ruleset', id: 'dreamrules', name: 'Dreamrules', problems: [] },
        ...ready(['Bene Gesserit', 'House Atreides', 'House Harkonnen', 'Emperor', 'Spacing Guild', 'Fremen']),
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('A game can start with this ruleset');
  },
});

/** A ruleset linking more factions than the page checks says how far the check went, rather than vouching for them all. */
export const SomeFactionsUnchecked = meta.story({
  args: {
    checkedFactionLimit: 100,
    check: checked({
      status: 'checked',
      entries: [{ kind: 'ruleset', id: 'gf9', name: 'GF9', problems: [] }, ...ready(GF9_FACTIONS)],
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Only the first 100 linked factions were checked'
    );
  },
});

/** The catalogue is still being read. */
export const Checking = meta.story({ args: { check: checked({ status: 'checking' }) } });

/** The check itself failed, which says nothing about the ruleset. */
export const Failed = meta.story({
  args: { check: checked({ status: 'failed', reason: 'The connection to the server was lost.' }) },
});

/** Check again asks the page to read the catalogue once more. */
export const Recheck = meta.story({
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Check again' }));
    await expect(args.onRecheck).toHaveBeenCalledOnce();
  },
});

import { testingPreview } from '@sb/preview';
import { TouchSurface } from '@ui/surface/TouchSheet';
import { useState } from 'react';
import { expect, fn, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';
import { CardPreview } from '@app/widgets/treachery-tracker/CardArt';
import { DREAMRULES_DECK } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import { StorySetup } from './standaloneTracker.stories.fixture';

const meta = testingPreview.meta({
  title: 'Tools/Treachery tracker',
  parameters: { database: db(() => {}) },
  globals: { viewport: { value: 'appMobile' } },
});

/** Any faction on Dune Zone can sit at the table: Add a faction searches them all, and a faction can be removed again. */
export const AddAFaction = meta.story({
  render: () => <StorySetup deck={{ status: 'ready', defs: DREAMRULES_DECK }} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Emperor' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add a faction' }));
    await expect(await body.findByRole('button', { name: 'House Atreides is at the table' })).toBeDisabled();
    await userEvent.click(body.getByRole('button', { name: 'Add Ixians' }));
    await expect(canvas.getByText('Ixians')).toBeVisible();
    await expect(canvas.queryByText('Emperor')).toBeNull();
    await expect(canvas.getAllByRole('button', { name: /^Remove / })).toHaveLength(6);
  },
});

/** Two decks at once: ticking another deck adds its cards to the tracker's, and unticking every deck leaves nothing to start. */
export const PickTwoDecks = meta.story({
  render: () => <StorySetup />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Ixian Tech Cards' }));
    await expect(canvas.getByText(/^A Treachery deck of \d+ cards, 39 different\.$/)).toBeVisible();
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Dreamrules Treachery' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Ixian Tech Cards' }));
    await expect(canvas.getByRole('button', { name: 'Start tracking' })).toHaveAccessibleDescription(
      'Pick at least one Treachery deck.'
    );
  },
});

/** The game waits for every card picture, so no card shows before its face can. */
export const WaitsForThePictures = meta.story({
  args: { onStart: fn() },
  render: ({ onStart }) => <StorySetup pace={60_000} onStart={onStart} />,
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const start = canvas.getByRole('button', { name: 'Start tracking' });
    await expect(start).toHaveAccessibleDescription('The card pictures are still coming in.');
    await expect(canvas.getByText(/Fetching the cards · 0 of \d+$/)).toBeVisible();
    await userEvent.click(start);
    await expect(args.onStart).not.toHaveBeenCalled();
  },
});

/** Removing factions down to one: the tracker needs at least two at the table. */
export const TooFewFactions = meta.story({
  args: { onStart: fn() },
  render: ({ onStart }) => <StorySetup deck={{ status: 'ready', defs: DREAMRULES_DECK }} onStart={onStart} />,
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    for (const name of ['House Harkonnen', 'Emperor', 'Spacing Guild', 'Fremen', 'Bene Gesserit']) {
      await userEvent.click(canvas.getByRole('button', { name: `Remove ${name}` }));
    }
    const start = canvas.getByRole('button', { name: 'Start tracking' });
    await expect(start).toHaveAccessibleDescription('Seat at least two factions.');
    await userEvent.click(start);
    start.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onStart).not.toHaveBeenCalled();
  },
});

/* A card the player can tap to pick, counting the picks. */
function PickableCard() {
  const [picks, setPicks] = useState(0);
  const def = DREAMRULES_DECK.find((card) => card.name === 'Lasgun') ?? DREAMRULES_DECK[0]!;
  return (
    <TouchSurface>
      <CardPreview card={{ id: 'held', def, copy: 1 }}>
        <button type="button" onClick={() => setPicks((was) => was + 1)}>
          Picked {picks} times
        </button>
      </CardPreview>
    </TouchSurface>
  );
}

/** On a phone, holding a card shows the whole card until the thumb lifts, and picks nothing; a short tap still picks it. */
export const HoldToPeek = meta.story({
  render: () => <PickableCard />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const card = canvas.getByRole('button', { name: 'Picked 0 times' });
    await userEvent.pointer({ keys: '[MouseLeft>]', target: card });
    const whole = await body.findByRole('img', { name: 'Lasgun' });
    await expect(whole).toBeVisible();
    await userEvent.pointer({ keys: '[/MouseLeft]', target: card });
    await waitFor(() => expect(body.queryByRole('img', { name: 'Lasgun' })).toBeNull());
    await expect(card).toHaveTextContent('Picked 0 times');
    await userEvent.click(card);
    await expect(card).toHaveTextContent('Picked 1 times');
  },
});

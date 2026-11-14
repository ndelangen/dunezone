import { Box } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { Surface } from '@ui/surface/Surface';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';

import { CataloguePicker } from './CataloguePicker';
import { FactionPicker } from './FactionPicker';
import { withFactionVariants } from './factionVariants.stories.fixture';
import { LiveFactionSearch } from './LiveFactionSearch';

/*
 * How the faction pickers name a variant: after its Faction's name, dimmed, and only where the Faction has several.
 * Each story mounts one real picker over the same seeded factions, so its own query supplies the names.
 */

/* The pane a picker opens in: a popover's width beside the page, the screen's width on a phone. */
function Pane({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box maw={360}>
      <Surface padding="sm">{children}</Surface>
    </Box>
  );
}

const meta = testingPreview.meta({
  title: 'Faction variant names',
  parameters: { layout: 'padded', database: db(withFactionVariants) },
});

const LONG_VARIANT = /Tournament play with the Kwisatz Haderach/;

/** The tools' faction search: each variant of House Atreides and House Harkonnen is named, and the factions with one variant are not. */
export const FactionSearch = meta.story({
  render: () => (
    <Pane>
      <LiveFactionSearch seated={[]} onPick={fn()} />
    </Pane>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    /* The search reads a few factions at a time, so the rest are asked for. */
    await userEvent.click(await canvas.findByRole('button', { name: 'Load more' }));
    await expect(await canvas.findByRole('button', { name: 'Add Fremen' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: LONG_VARIANT })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Add House Atreides · Dreamrules' })).toBeInTheDocument();
  },
});

/* A table that seats what the search picks, as a tool's seating does. */
function SeatingSearch() {
  const [seated, setSeated] = useState<readonly string[]>([]);
  return <LiveFactionSearch seated={seated} onePerFaction onPick={(faction) => setSeated([...seated, faction.id])} />;
}

/** A tool seats one variant per Faction: once one variant of House Atreides is seated its siblings dim, say which variant is seated and cannot be picked, and the other Factions stay open. */
export const SeatedSibling = meta.story({
  render: () => (
    <Pane>
      <SeatingSearch />
    </Pane>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByRole('searchbox', { name: 'Search factions' }), 'house');
    await userEvent.click(await canvas.findByRole('button', { name: 'Load more' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Add House Atreides · Dreamrules' }));
    await expect(
      await canvas.findByRole('button', { name: 'House Atreides · Dreamrules is at the table' })
    ).toBeDisabled();
    /* The seats are part of what the search asks for, so seating one starts the list over. */
    await userEvent.click(await canvas.findByRole('button', { name: 'Load more' }));
    const sibling = await canvas.findByRole('button', {
      name: /^House Atreides · Tournament play.*: Seated as Dreamrules$/,
    });
    await expect(sibling).toBeDisabled();
    await expect(within(sibling).getByText('Seated as Dreamrules')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: /: Seated as Dreamrules$/ })).toHaveLength(2);
    await expect(canvas.getByRole('button', { name: 'Add House Harkonnen · Dreamrules' })).toBeEnabled();
  },
});

/** The faction editor's load picker: the variant follows the name in the list, and a search finds a faction by its variant. */
export const LoadPicker = meta.story({
  render: () => (
    <Pane>
      <FactionPicker
        commitOnSelect
        copy={{ errorTitle: 'That faction cannot be loaded', emptyMessage: 'No factions to load.' }}
        onPick={fn()}
        onUnusable={fn()}
      />
    </Pane>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(LONG_VARIANT)).toBeVisible();
    await expect(canvas.getByRole('option', { name: /^Fremen(?! ·)/ })).toBeVisible();
  },
});

/** The catalogue picker on its Factions type: a named variant wraps under its Faction's name and is never cut. */
export const Catalogue = meta.story({
  render: () => (
    <Pane>
      <CataloguePicker onPick={fn()} />
    </Pane>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(await canvas.findByRole('combobox', { name: 'Reference type' }), 'faction');
    await expect(await canvas.findByRole('option', { name: LONG_VARIANT })).toBeVisible();
  },
});

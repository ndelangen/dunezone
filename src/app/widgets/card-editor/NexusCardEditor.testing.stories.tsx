import { TextInput } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';
import { withFactionVariants } from '@app/pickers/factionVariants.stories.fixture';

import { INITIAL_NEXUS_DRAFT, INITIAL_NEXUS_MEMORY, NexusCardEditor } from './NexusCardEditor';
import type { NexusDraft } from './NexusCardEditor';

/* The page's part: it holds the draft the editor patches, and reads the Faction the draft links. */
function LiveEditor({ onPatch }: Readonly<{ onPatch: (update: Partial<NexusDraft>) => void }>) {
  const [draft, setDraft] = useState<NexusDraft>({ ...INITIAL_NEXUS_DRAFT, name: 'New nexus card' });
  return (
    <WorkbenchLayout>
      <NexusCardEditor
        nameField={<TextInput aria-label="Name" readOnly value={draft.name} />}
        draft={draft}
        patch={(update) => {
          onPatch(update);
          setDraft((current) => ({ ...current, ...update }));
        }}
        linkedFaction={draft.factionLink ? { ...draft.factionLink, variantCount: 3 } : undefined}
        memory={INITIAL_NEXUS_MEMORY}
        remember={fn()}
        chapter="faction"
        onChapterChange={fn()}
        onSettle={fn()}
      />
    </WorkbenchLayout>
  );
}

const meta = testingPreview.meta({
  title: 'Nexus Card Editor',
  parameters: { layout: 'padded', database: db(withFactionVariants) },
});

/** A search by a variant's name finds its Faction, and picking it links the Faction at once and closes the list. */
export const PickFaction = meta.story({
  args: { onPatch: fn() },
  render: (args) => <LiveEditor onPatch={args.onPatch} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    /* A new card links nothing: the field says so and offers no tool, since the list under it is already open. */
    await expect(canvas.getByText('No faction linked yet.')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /faction/ })).toBeNull();
    await userEvent.type(await canvas.findByRole('searchbox', { name: 'Search factions' }), 'Kwisatz');
    /* The search is its own read, so its one match is waited on before the rest are seen to be gone. */
    const atreides = await canvas.findByRole('option', { name: /House Atreides/ });
    await waitFor(() => expect(canvas.queryByRole('option', { name: /Harkonnen/ })).toBeNull());
    await userEvent.click(atreides);

    await expect(canvas.queryByRole('option')).toBeNull();
    await expect(canvas.getByRole('link', { name: 'House Atreides' })).toBeVisible();
    await expect(args.onPatch.mock.lastCall?.[0]).toMatchObject({
      faction: 'House Atreides',
      factionLink: { slug: 'house-atreides' },
    });

    /* Change faction opens the list again, with the linked Faction marked in it. */
    await userEvent.click(canvas.getByRole('button', { name: 'Change faction' }));
    await expect(canvas.findByRole('option', { name: /House Atreides/ })).resolves.toHaveAttribute(
      'data-combobox-active'
    );
  },
});

import { TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { CustomCardEditor, INITIAL_CUSTOM_CARD_DRAFT, INITIAL_CUSTOM_CARD_MEMORY } from './CustomCardEditor';
import type { CustomCardChapter, CustomCardDraft, CustomCardMemory } from './CustomCardEditor';
import { CUSTOM_CARD_PRESETS } from './customCardPresets';

function InteractiveEditor({
  preset,
  name = 'Custom card',
  layers,
}: {
  preset: string;
  name?: string;
  layers?: CustomCardDraft['layers'];
}) {
  const starting = CUSTOM_CARD_PRESETS.find((candidate) => candidate.key === preset)!;
  const [state, dispatch] = useReducer(
    (
      current: { draft: CustomCardDraft; memory: CustomCardMemory },
      event: { draft?: Partial<CustomCardDraft>; memory?: Partial<CustomCardMemory> }
    ) => ({ draft: { ...current.draft, ...event.draft }, memory: { ...current.memory, ...event.memory } }),
    {
      draft: {
        ...INITIAL_CUSTOM_CARD_DRAFT,
        name,
        subName: preset === 'treachery' ? 'Weapon - Projectile' : 'Reference',
        format: starting.format,
        layers: structuredClone(layers ?? starting.layers),
      },
      memory: INITIAL_CUSTOM_CARD_MEMORY,
    }
  );
  const [chapter, setChapter] = useState<CustomCardChapter>('head');
  return (
    <WorkbenchLayout>
      <CustomCardEditor
        nameField={
          <TextInput
            aria-label="Name"
            value={state.draft.name}
            onChange={(event) => dispatch({ draft: { name: event.currentTarget.value } })}
          />
        }
        draft={state.draft}
        patch={(draft) => dispatch({ draft })}
        memory={state.memory}
        remember={(memory) => dispatch({ memory })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
      />
    </WorkbenchLayout>
  );
}
const meta = preview.meta({
  parameters: { layout: 'padded' },
  globals: { colorScheme: 'dark' },
  title: 'Custom Card Editor',
  component: InteractiveEditor,
  args: { preset: 'treachery' },
});
export const Treachery = meta.story({});
export const FullText = meta.story({
  args: { preset: 'full-text', name: 'Battle reference', layers: [publishingCustomCard.layers[0]] },
});
export const Layered = meta.story({
  args: { preset: 'full-text', name: publishingCustomCard.name, layers: publishingCustomCard.layers },
});
export const Blank = meta.story({ args: { preset: 'blank-plain' } });
export const LongTitle = meta.story({ args: { name: 'A very long custom card title that must stay inside the Head' } });

export const LayerTabs = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: '2. Text' }));
    const position = canvas.getByRole('textbox', { name: 'Horizontal position' });
    await userEvent.tripleClick(position);
    await userEvent.keyboard('210');
    await userEvent.tab();
    await userEvent.click(canvas.getByRole('button', { name: 'Move backward' }));
    await expect(canvas.getByRole('tab', { name: '1. Text' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('textbox', { name: 'Horizontal position' })).toHaveValue('210');
    await userEvent.click(canvas.getByRole('button', { name: 'Duplicate layer' }));
    await expect(canvas.getByRole('tab', { name: '2. Text' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Fit box to text body' }));
    await expect(canvas.getByRole('textbox', { name: 'Horizontal position' })).toHaveValue('89');
    await expect(canvas.getByRole('textbox', { name: 'Vertical position' })).toHaveValue('704');
    await userEvent.click(canvas.getByRole('tab', { name: '1. Text' }));
    await expect(canvas.getByRole('textbox', { name: 'Horizontal position' })).toHaveValue('210');
    await userEvent.click(canvas.getByRole('tab', { name: 'Layers' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add decal' }));
    await expect(canvas.getByRole('tab', { name: '4. Decal' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Centre vertically' }));
    await expect(canvas.getByRole('textbox', { name: 'Vertical position' })).toHaveValue('631.5');
    await userEvent.click(canvas.getByRole('button', { name: 'Centre in decal window' }));
    await expect(canvas.getByRole('textbox', { name: 'Vertical position' })).toHaveValue('470');
  },
});

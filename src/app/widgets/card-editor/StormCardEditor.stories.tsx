import { Button, TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { StormCardEditor, INITIAL_STORM_CARD_MEMORY } from './StormCardEditor';
import type { StormCardChapter, StormCardDraft, StormCardMemory } from './StormCardEditor';

function InteractiveEditor({ sectors = 1 }: { sectors?: number }) {
  const [state, dispatch] = useReducer(
    (
      current: { draft: StormCardDraft; memory: StormCardMemory },
      event: { draft?: Partial<StormCardDraft>; memory?: Partial<StormCardMemory> }
    ) => ({ draft: { ...current.draft, ...event.draft }, memory: { ...current.memory, ...event.memory } }),
    { draft: standardStormCard(sectors), memory: INITIAL_STORM_CARD_MEMORY }
  );
  const [chapter, setChapter] = useState<StormCardChapter>('head');
  return (
    <WorkbenchLayout>
      <StormCardEditor
        draft={state.draft}
        patch={(draft) => dispatch({ draft })}
        memory={state.memory}
        remember={(memory) => dispatch({ memory })}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
        tokens={{}}
        tokenPicker={(_onPick, onCancel) => <Button onClick={onCancel}>Cancel</Button>}
        nameField={
          <TextInput
            aria-label="Name"
            value={state.draft.name}
            onChange={(event) => dispatch({ draft: { name: event.currentTarget.value } })}
          />
        }
      />
    </WorkbenchLayout>
  );
}
const meta = preview.meta({
  title: 'Storm Card Editor',
  component: InteractiveEditor,
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'padded' },
});
export const One = meta.story({});
export const Six = meta.story({ args: { sectors: 6 } });
export const MovementAndLayers = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Storm movement' }));
    await userEvent.click(await page.findByRole('option', { name: /^6 sectors$/ }));
    await expect(canvas.getByText('Move the storm 6 sectors counterclockwise.')).toBeVisible();
    await expect(canvas.getByText('6 Sectors', { exact: true })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Name' })).toHaveValue('1 Sector');
    await expect(canvas.queryByRole('tab', { name: 'Format' })).toBeNull();
    await expect(canvas.queryByRole('tab', { name: 'Symbol' })).toBeNull();
    await userEvent.click(canvas.getByRole('tab', { name: '2. Text' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Duplicate layer' }));
    await expect(canvas.getByRole('tab', { name: '3. Text' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(canvas.getByRole('tab', { name: /^Storm$/ }));
    await expect(canvas.getByText('Move the storm 6 sectors counterclockwise.')).toBeVisible();
  },
});

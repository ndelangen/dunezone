import { Button, TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import {
  publishingCustomCardTokens,
  publishingCustomCardTokenLayers,
} from '@shared/assets/fixtures/publishingCustomCardTokens';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
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
        tokens={{
          ...publishingCustomCardTokens,
          'sample-token': { type: 'token-disc', name: 'Karama token', face: publishingTokenFace },
        }}
        tokenPicker={(onPick, onCancel) => (
          <>
            <Button onClick={() => onPick('sample-token')}>Pick Karama token</Button>
            <Button onClick={onCancel}>Cancel</Button>
          </>
        )}
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

export const ResizedHeadIcon = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Symbol' }));
    const scale = canvas.getByRole('textbox', { name: 'Icon scale' });
    await userEvent.tripleClick(scale);
    await userEvent.keyboard('1.5');
    await userEvent.tab();
    await expect(scale).toHaveValue('1.5');
    const cardIcon = Array.from(canvasElement.querySelectorAll<HTMLImageElement>('img')).find(
      (image) => image.src.endsWith('/vector/icon/karama.svg') && getComputedStyle(image).mixBlendMode === 'overlay'
    );
    await expect(cardIcon).toBeDefined();
    await expect(cardIcon!.style.width).toBe('127.5px');
    await userEvent.click(canvas.getByRole('tab', { name: 'Format' }));
    await expect(canvas.queryByRole('textbox', { name: 'Name' })).toBeNull();
    await expect(canvas.getByRole('radiogroup', { name: 'Card format' })).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: 'Symbol' }));
    await expect(canvas.getByRole('textbox', { name: 'Icon scale' })).toHaveValue('1.5');
  },
});

export const TokenLayer = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Layers' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add token' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Pick Karama token' }));
    await expect(canvas.getByRole('tab', { name: '3. Token' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByText('Karama token')).toBeVisible();
    await userEvent.tripleClick(canvas.getByRole('textbox', { name: 'Token scale' }));
    await userEvent.keyboard('1.5');
    await userEvent.tab();
    const scaleSlider = canvas.getByRole('slider', { name: 'Token scale' });
    await expect(scaleSlider).toHaveAttribute('aria-valuenow', '1.5');
    scaleSlider.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('textbox', { name: 'Token scale' })).toHaveValue('1.55');
    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.click(canvas.getByRole('button', { name: 'Centre in window' }));
    await expect(canvas.getByRole('textbox', { name: 'Vertical position' })).toHaveValue('470');
    await userEvent.click(canvas.getByRole('button', { name: 'Move backward' }));
    await expect(canvas.getByRole('tab', { name: '2. Token' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('textbox', { name: 'Token scale' })).toHaveValue('1.5');
    canvas.getByRole('slider', { name: 'Opacity for layer 2' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(canvas.getByRole('textbox', { name: 'Opacity for layer 2' })).toHaveValue('0.95');
    canvas.getByRole('slider', { name: 'Rotation for layer 2' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('textbox', { name: 'Rotation for layer 2' })).toHaveValue('1');
  },
});

export const TokenShapes = meta.story({
  args: { preset: 'full-text', name: 'Linked token reference', layers: publishingCustomCardTokenLayers },
});

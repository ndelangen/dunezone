import { Box, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import type { RulebookBlockDraft, RulebookBlockKind, RulebookPageDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderPage } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookResolvedAssetsById } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { RulebookPageRenderer } from '@game/rulebook/RulebookRenderer';

import { rulebookBlockEditors } from './-rulebookBlockEditors';
import type { RulebookBlockEditorValue } from './-rulebookBlockEditors';

const textOnChange = fn();
const repeatedTextOnChange = fn();
const ruleGroupOnChange = fn();
const assetFigureOnChange = fn();

const previewAssets = {
  'storm-marker': {
    assetId: 'storm-marker',
    name: 'Storm marker',
    type: 'token-disc',
    imageUrl: '/page/storm.svg',
  },
} satisfies RulebookResolvedAssetsById;

const blockTitles = {
  text: 'Text Block',
  'repeated-text': 'Repeated Text Block',
  'rule-group': 'Rule Group Block',
  'asset-figure': 'Asset Figure Block',
} satisfies Record<RulebookBlockKind, string>;

function previewPage(block: RulebookBlockDraft, regionKey: 'examples' | 'rules'): RulebookPageDraft {
  return {
    id: 'DEMO',
    anchor: 'block-preview',
    title: blockTitles[block.kind],
    layoutId: 'rules-page',
    controlValues: {
      guidance: {
        eyebrow: 'Block preview',
        introduction: 'Edit the Block and inspect its place on the Page.',
      },
    },
    blockOrderByRegion: {
      rules: regionKey === 'rules' ? [block.id] : [],
      examples: regionKey === 'examples' ? [block.id] : [],
    },
    blocksById: { [block.id]: block },
  };
}

function createBlockEditorStory<Kind extends keyof typeof rulebookBlockEditors>(
  Editor: ComponentType<{
    value: RulebookBlockEditorValue<Kind>;
    onChange: (nextValue: RulebookBlockEditorValue<Kind>) => void;
  }>,
  reportChange: (nextValue: RulebookBlockEditorValue<Kind>) => void,
  createBlock: (value: RulebookBlockEditorValue<Kind>) => RulebookBlockDraft,
  regionKey: 'examples' | 'rules'
) {
  return function BlockEditorStory({ initialValue }: { initialValue: RulebookBlockEditorValue<Kind> }) {
    const [value, setValue] = useState(initialValue);
    const page = projectRulebookDraftRenderPage(previewPage(createBlock(value), regionKey), previewAssets);
    return (
      <Box p="lg">
        <DocumentEditorLayout ratio={210 / 297} fit="height">
          <DocumentEditorLayout.Sidebar>
            <Stack gap="md">
              <Text fw={700}>Editor</Text>
              <Editor
                value={value}
                onChange={(nextValue) => {
                  reportChange(nextValue);
                  setValue(nextValue);
                }}
              />
            </Stack>
          </DocumentEditorLayout.Sidebar>
          <DocumentEditorLayout.Preview>
            <RulebookPageRenderer page={page} />
          </DocumentEditorLayout.Preview>
        </DocumentEditorLayout>
      </Box>
    );
  };
}

const TextBlockStory = createBlockEditorStory(
  rulebookBlockEditors.text,
  textOnChange,
  (value) => ({ id: 'DEMO', kind: 'text', ...value }),
  'rules'
);
const RepeatedTextBlockStory = createBlockEditorStory(
  rulebookBlockEditors['repeated-text'],
  repeatedTextOnChange,
  (value) => ({ id: 'DEMO', kind: 'repeated-text', ...value }),
  'examples'
);
const RuleGroupBlockStory = createBlockEditorStory(
  rulebookBlockEditors['rule-group'],
  ruleGroupOnChange,
  (value) => ({ id: 'DEMO', kind: 'rule-group', ...value }),
  'rules'
);
const AssetFigureBlockStory = createBlockEditorStory(
  rulebookBlockEditors['asset-figure'],
  assetFigureOnChange,
  (value) => ({ id: 'DEMO', kind: 'asset-figure', ...value }),
  'examples'
);

type StoryCanvas = ReturnType<typeof within>;

function latestRepeatedTextValue() {
  const value = repeatedTextOnChange.mock.calls.at(-1)?.[0] as RulebookBlockEditorValue<'repeated-text'> | undefined;
  expect(value).toBeDefined();
  return value as RulebookBlockEditorValue<'repeated-text'>;
}

async function verifyRepeatedTextEditing(canvas: StoryCanvas) {
  const firstItem = canvas.getByRole('textbox', { name: 'Item 1' });
  const firstReorder = canvas.getByRole('button', { name: 'Reorder item 1' });
  const firstRemove = canvas.getByRole('button', { name: 'Remove item 1' });
  await expect(firstItem).toHaveAccessibleDescription('Write one entry in this repeated list.');
  await userEvent.type(firstItem, ' Then reveal it.');
  await userEvent.tab();
  await expect(firstReorder).toHaveFocus();
  await userEvent.tab();
  await expect(firstRemove).toHaveFocus();
  await expect(repeatedTextOnChange).toHaveBeenLastCalledWith({
    itemOrder: ['ABCD', 'EFGH'],
    itemsById: {
      ABCD: { id: 'ABCD', text: 'Choose a force. Then reveal it.' },
      EFGH: { id: 'EFGH', text: 'Move into an adjacent territory.' },
    },
  });
}

async function addRepeatedTextItem(canvas: StoryCanvas) {
  await userEvent.click(canvas.getByRole('button', { name: 'Add item' }));
  const afterAdd = latestRepeatedTextValue();
  expect(afterAdd.itemOrder).toHaveLength(3);
  const addedItemId = afterAdd.itemOrder[2];
  expect(afterAdd.itemsById[addedItemId]?.text).toBe('');
  return addedItemId;
}

async function removeRepeatedTextItem(canvas: StoryCanvas, addedItemId: string) {
  await userEvent.click(canvas.getByRole('button', { name: 'Remove item 3' }));
  const afterRemove = latestRepeatedTextValue();
  expect(afterRemove.itemOrder).toEqual(['ABCD', 'EFGH']);
  expect(afterRemove.itemsById[addedItemId]).toBeUndefined();
}

async function verifyRepeatedTextItemLifecycle(canvas: StoryCanvas) {
  const addedItemId = await addRepeatedTextItem(canvas);
  await removeRepeatedTextItem(canvas, addedItemId);
}

async function verifyRepeatedTextReorder(canvas: StoryCanvas) {
  const firstReorder = canvas.getByRole('button', { name: 'Reorder item 1' });
  await userEvent.click(firstReorder);
  await userEvent.keyboard('[Space][ArrowDown][Space]');
  await waitFor(() => {
    expect(latestRepeatedTextValue().itemOrder[1]).toBe('ABCD');
  });
  firstReorder.blur();
  await userEvent.unhover(firstReorder);
  const addItem = canvas.getByRole('button', { name: 'Add item' });
  await userEvent.hover(addItem);
  await userEvent.unhover(addItem);
}

const meta = preview.meta({
  title: 'Editors',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const TextBlock = meta.story({
  render: () => <TextBlockStory initialValue={{ text: 'Keep one hand on the shield wall.' }} />,
  play: async ({ canvasElement }) => {
    textOnChange.mockClear();
    const canvas = within(canvasElement);
    const content = canvas.getByRole('textbox', { name: 'Content' });
    await expect(content).toHaveAccessibleDescription('Write the text shown by this Block.');
    await userEvent.type(content, ' Stay alert.');
    await expect(textOnChange).toHaveBeenLastCalledWith({
      text: 'Keep one hand on the shield wall. Stay alert.',
    });
    const previewBlock = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-id="DEMO"]');
    expect(previewBlock).not.toBeNull();
    await expect(within(previewBlock!).getByText('Keep one hand on the shield wall. Stay alert.')).toBeVisible();
  },
});

export const RepeatedTextBlock = meta.story({
  render: () => (
    <RepeatedTextBlockStory
      initialValue={{
        itemOrder: ['ABCD', 'EFGH'],
        itemsById: {
          ABCD: { id: 'ABCD', text: 'Choose a force.' },
          EFGH: { id: 'EFGH', text: 'Move into an adjacent territory.' },
        },
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    repeatedTextOnChange.mockClear();
    const canvas = within(canvasElement);
    await verifyRepeatedTextEditing(canvas);
    const previewBlock = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-id="DEMO"]');
    expect(previewBlock).not.toBeNull();
    await expect(within(previewBlock!).getByText('Choose a force. Then reveal it.')).toBeVisible();
    await verifyRepeatedTextItemLifecycle(canvas);
    await verifyRepeatedTextReorder(canvas);
  },
});

export const RuleGroupBlock = meta.story({
  render: () => (
    <RuleGroupBlockStory
      initialValue={{
        title: 'Movement sequence',
        text: 'Choose a force, then choose a destination.',
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    ruleGroupOnChange.mockClear();
    const canvas = within(canvasElement);
    const title = canvas.getByRole('textbox', { name: 'Title' });
    await expect(title).toHaveAccessibleDescription('Name this group of related rules.');
    await userEvent.clear(title);
    await userEvent.type(title, 'Advanced movement');
    await expect(ruleGroupOnChange).toHaveBeenLastCalledWith({
      title: 'Advanced movement',
      text: 'Choose a force, then choose a destination.',
    });
    const previewBlock = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-id="DEMO"]');
    expect(previewBlock).not.toBeNull();
    await expect(within(previewBlock!).getByRole('heading', { name: 'Advanced movement' })).toBeVisible();
  },
});

export const AssetFigureBlock = meta.story({
  render: () => (
    <AssetFigureBlockStory
      initialValue={{
        assetId: 'storm-marker',
        text: 'The storm marker moves one sector counter-clockwise each round.',
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    assetFigureOnChange.mockClear();
    const canvas = within(canvasElement);
    const asset = canvas.getByRole('textbox', { name: 'Asset' });
    await expect(asset).toHaveAccessibleDescription('Enter the ID of the Asset this figure should show.');
    await userEvent.clear(asset);
    await userEvent.type(asset, 'storm-marker');
    await expect(assetFigureOnChange).toHaveBeenLastCalledWith({
      assetId: 'storm-marker',
      text: 'The storm marker moves one sector counter-clockwise each round.',
    });
    const previewBlock = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-id="DEMO"]');
    expect(previewBlock).not.toBeNull();
    await expect(within(previewBlock!).getByRole('img', { name: 'Storm marker' })).toBeVisible();
  },
});

export const InvalidFormattedText = meta.story({
  render: () => <TextBlockStory initialValue={{ text: 'An *unfinished instruction' }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Content' })).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText(/Suggestion:/)).toBeVisible();
  },
});

export const EmptyRepeatedTextBlock = meta.story({
  render: () => <RepeatedTextBlockStory initialValue={{ itemOrder: [], itemsById: {} }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('This Block has no items yet.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Add item' })).toBeEnabled();
  },
});

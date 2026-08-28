import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { rulebookBlockEditors } from './-rulebookBlockEditors';
import type { RulebookBlockEditorValue } from './-rulebookBlockEditors';

const textOnChange = fn();
const repeatedTextOnChange = fn();
const ruleGroupOnChange = fn();
const assetFigureOnChange = fn();

function EditorFrame({ children }: { children: ReactNode }) {
  return <Box w="min(35rem, calc(100vw - 2rem))">{children}</Box>;
}

function TextBlockStory({ initialValue }: { initialValue: RulebookBlockEditorValue<'text'> }) {
  const [value, setValue] = useState(initialValue);
  const Editor = rulebookBlockEditors.text;
  return (
    <EditorFrame>
      <Editor
        value={value}
        onChange={(nextValue) => {
          textOnChange(nextValue);
          setValue(nextValue);
        }}
      />
    </EditorFrame>
  );
}

function RepeatedTextBlockStory({ initialValue }: { initialValue: RulebookBlockEditorValue<'repeated-text'> }) {
  const [value, setValue] = useState(initialValue);
  const Editor = rulebookBlockEditors['repeated-text'];
  return (
    <EditorFrame>
      <Editor
        value={value}
        onChange={(nextValue) => {
          repeatedTextOnChange(nextValue);
          setValue(nextValue);
        }}
      />
    </EditorFrame>
  );
}

function RuleGroupBlockStory({ initialValue }: { initialValue: RulebookBlockEditorValue<'rule-group'> }) {
  const [value, setValue] = useState(initialValue);
  const Editor = rulebookBlockEditors['rule-group'];
  return (
    <EditorFrame>
      <Editor
        value={value}
        onChange={(nextValue) => {
          ruleGroupOnChange(nextValue);
          setValue(nextValue);
        }}
      />
    </EditorFrame>
  );
}

function AssetFigureBlockStory({ initialValue }: { initialValue: RulebookBlockEditorValue<'asset-figure'> }) {
  const [value, setValue] = useState(initialValue);
  const Editor = rulebookBlockEditors['asset-figure'];
  return (
    <EditorFrame>
      <Editor
        value={value}
        onChange={(nextValue) => {
          assetFigureOnChange(nextValue);
          setValue(nextValue);
        }}
      />
    </EditorFrame>
  );
}

const meta = preview.meta({
  title: 'Rulebooks/Block edit counterparts',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'centered' },
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

    await userEvent.click(canvas.getByRole('button', { name: 'Add item' }));
    const afterAdd = repeatedTextOnChange.mock.calls.at(-1)?.[0] as
      | RulebookBlockEditorValue<'repeated-text'>
      | undefined;
    expect(afterAdd?.itemOrder).toHaveLength(3);
    expect(afterAdd && afterAdd.itemsById[afterAdd.itemOrder[2]]?.text).toBe('');

    const addedItemId = afterAdd?.itemOrder[2];
    await userEvent.click(canvas.getByRole('button', { name: 'Remove item 3' }));
    const afterRemove = repeatedTextOnChange.mock.calls.at(-1)?.[0] as
      | RulebookBlockEditorValue<'repeated-text'>
      | undefined;
    expect(afterRemove?.itemOrder).toHaveLength(2);
    expect(afterRemove?.itemOrder).toEqual(['ABCD', 'EFGH']);
    expect(addedItemId && afterRemove?.itemsById[addedItemId]).toBeUndefined();

    await userEvent.click(firstReorder);
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await waitFor(() => {
      const afterReorder = repeatedTextOnChange.mock.calls.at(-1)?.[0] as
        | RulebookBlockEditorValue<'repeated-text'>
        | undefined;
      expect(afterReorder?.itemOrder[1]).toBe('ABCD');
    });
    firstReorder.blur();
    await userEvent.unhover(firstReorder);
    const addItem = canvas.getByRole('button', { name: 'Add item' });
    await userEvent.hover(addItem);
    await userEvent.unhover(addItem);
  },
});

export const RuleGroupBlock = meta.story({
  render: () => (
    <RuleGroupBlockStory
      initialValue={{ title: 'Movement sequence', text: 'Choose a force, then choose a destination.' }}
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
  },
});

export const AssetFigureBlock = meta.story({
  render: () => (
    <AssetFigureBlockStory initialValue={{ text: 'The storm marker moves one sector counter-clockwise each round.' }} />
  ),
  play: async ({ canvasElement }) => {
    assetFigureOnChange.mockClear();
    const canvas = within(canvasElement);
    const asset = canvas.getByRole('textbox', { name: 'Asset' });
    await expect(asset).toHaveAccessibleDescription('Enter the ID of the Asset this figure should show.');
    await userEvent.type(asset, 'storm-marker');
    await expect(assetFigureOnChange).toHaveBeenLastCalledWith({
      assetId: 'storm-marker',
      text: 'The storm marker moves one sector counter-clockwise each round.',
    });
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

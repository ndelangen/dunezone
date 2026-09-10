import { Box, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookResolvedAssetsById } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';

import { rulebookBlockEditors } from './rulebookBlockEditors';
import type { RulebookBlockEditorValue } from './rulebookBlockEditors';

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

function createBlockEditorStory<Kind extends keyof typeof rulebookBlockEditors>(
  Editor: ComponentType<{
    value: RulebookBlockEditorValue<Kind>;
    onChange: (nextValue: RulebookBlockEditorValue<Kind>) => void;
  }>,
  reportChange: (nextValue: RulebookBlockEditorValue<Kind>) => void,
  createBlock: (value: RulebookBlockEditorValue<Kind>) => RulebookBlockDraft
) {
  return function BlockEditorStory({ initialValue }: { initialValue: RulebookBlockEditorValue<Kind> }) {
    const [value, setValue] = useState(initialValue);
    const block = projectRulebookDraftRenderBlock(createBlock(value), previewAssets);
    return (
      <Box p="lg">
        <DocumentEditorLayout ratio={4 / 3} fit="width">
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
            <RulebookBlockCanvas block={block} />
          </DocumentEditorLayout.Preview>
        </DocumentEditorLayout>
      </Box>
    );
  };
}

const TextBlockStory = createBlockEditorStory(rulebookBlockEditors.text, textOnChange, (value) => ({
  id: 'DEMO',
  kind: 'text',
  ...value,
}));
const RepeatedTextBlockStory = createBlockEditorStory(
  rulebookBlockEditors['repeated-text'],
  repeatedTextOnChange,
  (value) => ({ id: 'DEMO', kind: 'repeated-text', ...value })
);
const RuleGroupBlockStory = createBlockEditorStory(rulebookBlockEditors['rule-group'], ruleGroupOnChange, (value) => ({
  id: 'DEMO',
  kind: 'rule-group',
  ...value,
}));
const AssetFigureBlockStory = createBlockEditorStory(
  rulebookBlockEditors['asset-figure'],
  assetFigureOnChange,
  (value) => ({ id: 'DEMO', kind: 'asset-figure', ...value })
);

type StoryCanvas = ReturnType<typeof within>;

function expectBlockOnlyPreview(canvasElement: HTMLElement) {
  const blockCanvas = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-canvas]');
  expect(blockCanvas).not.toBeNull();
  expect(canvasElement.querySelector('[data-rulebook-page]')).toBeNull();

  const bounds = blockCanvas!.getBoundingClientRect();
  expect(bounds.width / bounds.height).toBeCloseTo(4 / 3, 1);
}

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
  title: 'Blocks',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const TextBlock = meta.story({
  render: () => <TextBlockStory initialValue={{ text: 'Keep one hand on the shield wall.' }} />,
  play: async ({ canvasElement }) => {
    expectBlockOnlyPreview(canvasElement);
    textOnChange.mockClear();
    const canvas = within(canvasElement);
    const content = canvas.getByRole('textbox', { name: 'Content' });
    await expect(canvas.getByRole('group', { name: 'Content' })).toHaveAccessibleDescription(
      'Write the text shown by this Block.'
    );
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
    expectBlockOnlyPreview(canvasElement);
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
    expectBlockOnlyPreview(canvasElement);
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
    expectBlockOnlyPreview(canvasElement);
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
    expectBlockOnlyPreview(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Content' })).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText(/Suggestion:/)).toBeVisible();
  },
});

export const EmptyRepeatedTextBlock = meta.story({
  render: () => <RepeatedTextBlockStory initialValue={{ itemOrder: [], itemsById: {} }} />,
  play: async ({ canvasElement }) => {
    expectBlockOnlyPreview(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.getByText('This Block has no items yet.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Add item' })).toBeEnabled();
  },
});

const sectionHeadingChange = fn();
const listChange = fn();
const calloutChange = fn();
const questionAnswerChange = fn();
const SectionHeadingStory = createBlockEditorStory(
  rulebookBlockEditors['section-heading'],
  sectionHeadingChange,
  (value) => ({ id: 'DEMO', kind: 'section-heading', ...value })
);
const ListStory = createBlockEditorStory(rulebookBlockEditors.list, listChange, (value) => ({
  id: 'DEMO',
  kind: 'list',
  ...value,
}));
const CalloutStory = createBlockEditorStory(rulebookBlockEditors.callout, calloutChange, (value) => ({
  id: 'DEMO',
  kind: 'callout',
  ...value,
}));
const QuestionAnswerStory = createBlockEditorStory(
  rulebookBlockEditors['question-answer'],
  questionAnswerChange,
  (value) => ({ id: 'DEMO', kind: 'question-answer', ...value })
);

export const SectionHeading = meta.story({
  render: () => <SectionHeadingStory initialValue={{ title: 'Shipment and movement' }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Title' }), ' phase');
    expect(sectionHeadingChange).toHaveBeenLastCalledWith({ title: 'Shipment and movement phase' });
  },
});

export const NamedText = meta.story({
  render: () => (
    <TextBlockStory
      initialValue={{ name: 'Ornithopters', text: 'Control Arrakeen or Carthag to move up to three territories.' }}
    />
  ),
});

export const NumberedList = meta.story({
  render: () => (
    <ListStory
      initialValue={{
        style: 'numbered',
        itemOrder: ['AAAA', 'BBBB'],
        itemsById: {
          AAAA: { id: 'AAAA', name: 'Ship forces', text: 'Pay spice to bring reserves to Dune.' },
          BBBB: { id: 'BBBB', name: 'Move forces', text: 'Choose one group to move.' },
        },
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    listChange.mockClear();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Item 1 name' }), ' first');
    await userEvent.click(canvas.getByRole('button', { name: 'Reorder item 1' }));
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await waitFor(() => expect(listChange.mock.lastCall?.[0].itemOrder).toEqual(['BBBB', 'AAAA']));
    expect(listChange.mock.lastCall?.[0].itemsById.AAAA.name).toBe('Ship forces first');
    await userEvent.click(canvas.getByRole('button', { name: 'Add item' }));
    expect(listChange.mock.lastCall?.[0].itemOrder).toHaveLength(3);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last item' }));
    expect(listChange.mock.lastCall?.[0].itemOrder).toEqual(['BBBB', 'AAAA']);
  },
});

export const EmptyBulletedList = meta.story({
  render: () => <ListStory initialValue={{ style: 'bulleted', itemOrder: [], itemsById: {} }} />,
});
export const NoteCallout = meta.story({
  render: () => (
    <CalloutStory
      initialValue={{ variant: 'note', title: 'Occupancy limit', text: 'Two factions can occupy the same stronghold.' }}
    />
  ),
});
export const ExampleCallout = meta.story({
  render: () => (
    <CalloutStory
      initialValue={{
        variant: 'example',
        title: 'A shipment',
        text: 'Shipping three forces to a stronghold costs three spice.',
      }}
    />
  ),
});
export const QuotationCallout = meta.story({
  render: () => (
    <CalloutStory
      initialValue={{ variant: 'quotation', text: 'The spice must flow.', attribution: 'The Spacing Guild' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Attribution' }));
    expect(calloutChange.mock.lastCall?.[0].attribution).toBeUndefined();
  },
});
export const QuestionAndAnswer = meta.story({
  render: () => (
    <QuestionAnswerStory
      initialValue={{
        topic: 'Movement',
        question: 'Can a force cross the storm?',
        answer: 'It cannot move into or through the storm.',
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Answer' }), ' Faction abilities can change this.');
    expect(questionAnswerChange.mock.lastCall?.[0].answer).toContain('Faction abilities can change this.');
  },
});

const ReferencedIllustrationStory = createBlockEditorStory(
  rulebookBlockEditors['referenced-illustration'],
  fn(),
  (value) => ({ id: 'DEMO', kind: 'referenced-illustration', ...value })
);
const IllustratedInventoryStory = createBlockEditorStory(
  rulebookBlockEditors['illustrated-inventory'],
  fn(),
  (value) => ({ id: 'DEMO', kind: 'illustrated-inventory', ...value })
);
const FactionIntroductionStory = createBlockEditorStory(
  rulebookBlockEditors['faction-introduction'],
  fn(),
  (value) => ({ id: 'DEMO', kind: 'faction-introduction', ...value })
);

export const ReferencedIllustration = meta.story({
  render: () => (
    <ReferencedIllustrationStory
      initialValue={{ source: { kind: 'board', boardId: 'arrakis' }, caption: 'The northern hemisphere of Arrakis.' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Arrakis board' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Clear source' }));
    await expect(canvas.getByRole('textbox', { name: 'Caption' })).toHaveValue('The northern hemisphere of Arrakis.');
    await expect(canvas.getByRole('button', { name: 'Choose source' })).toBeVisible();
  },
});

export const IllustratedInventory = meta.story({
  render: () => (
    <IllustratedInventoryStory
      initialValue={{
        title: 'Game components',
        introduction: 'These pieces are used throughout the game.',
        itemOrder: ['MAPA', 'WORM'],
        itemsById: {
          MAPA: {
            id: 'MAPA',
            source: { kind: 'board', boardId: 'arrakis' },
            quantity: 1,
            text: 'Place forces on the territories.',
          },
          WORM: {
            id: 'WORM',
            source: { kind: 'stock', artworkId: '/vector/generic/plus.svg' },
            quantity: 6,
            text: 'An explanation stays with its source.',
          },
        },
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue('Place forces on the territories.');
    const handle = canvas.getByRole('button', { name: 'Reorder entry 1' });
    handle.focus();
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '2. Arrakis board' })).toHaveAttribute('aria-pressed', 'true')
    );
    await expect(canvas.getByRole('textbox', { name: 'Quantity' })).toHaveValue('1');
    await userEvent.click(canvas.getByRole('button', { name: 'Add entry' }));
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue('');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last entry' }));
    await expect(canvas.getAllByRole('button', { name: /Reorder entry/ })).toHaveLength(2);
  },
});

export const UnavailableFactionIntroduction = meta.story({
  render: () => (
    <FactionIntroductionStory
      initialValue={{ factionId: 'unavailable-faction', text: 'These warriors know the desert and its dangers.' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Unavailable faction' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Clear faction' }));
    await expect(canvas.getByRole('textbox', { name: 'Introduction' })).toHaveValue(
      'These warriors know the desert and its dangers.'
    );
  },
});

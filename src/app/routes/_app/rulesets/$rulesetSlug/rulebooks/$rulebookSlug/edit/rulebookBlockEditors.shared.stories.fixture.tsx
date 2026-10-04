import { Box, Stack, Text } from '@mantine/core';
import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookResolvedAssetsById } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { expect, fn } from 'storybook/test';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';

import { rulebookBlockEditors } from './rulebookBlockEditors';
import type { RulebookBlockEditorValue } from './rulebookBlockEditors';

export const textOnChange = fn();

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

export const TextBlockStory = createBlockEditorStory(rulebookBlockEditors.text, textOnChange, (value) => ({
  id: 'DEMO',
  kind: 'text',
  ...value,
}));

export function expectBlockOnlyPreview(canvasElement: HTMLElement) {
  const blockCanvas = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-canvas]');
  expect(blockCanvas).not.toBeNull();
  expect(canvasElement.querySelector('[data-rulebook-page]')).toBeNull();

  const bounds = blockCanvas!.getBoundingClientRect();
  expect(bounds.width / bounds.height).toBeCloseTo(4 / 3, 1);
}

export const sectionHeadingChange = fn();

export const listChange = fn();

export const calloutChange = fn();

export const questionAnswerChange = fn();

export const SectionHeadingStory = createBlockEditorStory(
  rulebookBlockEditors['section-heading'],
  sectionHeadingChange,
  (value) => ({ id: 'DEMO', kind: 'section-heading', ...value })
);

export const ListStory = createBlockEditorStory(rulebookBlockEditors.list, listChange, (value) => ({
  id: 'DEMO',
  kind: 'list',
  ...value,
}));

export const CalloutStory = createBlockEditorStory(rulebookBlockEditors.callout, calloutChange, (value) => ({
  id: 'DEMO',
  kind: 'callout',
  ...value,
}));

export const QuestionAnswerStory = createBlockEditorStory(
  rulebookBlockEditors['question-answer'],
  questionAnswerChange,
  (value) => ({ id: 'DEMO', kind: 'question-answer', ...value })
);

export const ReferencedIllustrationStory = createBlockEditorStory(
  rulebookBlockEditors['referenced-illustration'],
  fn(),
  (value) => ({ id: 'DEMO', kind: 'referenced-illustration', ...value })
);

export const IllustratedInventoryStory = createBlockEditorStory(
  rulebookBlockEditors['illustrated-inventory'],
  fn(),
  (value) => ({ id: 'DEMO', kind: 'illustrated-inventory', ...value })
);

export const FactionIntroductionStory = createBlockEditorStory(
  rulebookBlockEditors['faction-introduction'],
  fn(),
  (value) => ({ id: 'DEMO', kind: 'faction-introduction', ...value })
);

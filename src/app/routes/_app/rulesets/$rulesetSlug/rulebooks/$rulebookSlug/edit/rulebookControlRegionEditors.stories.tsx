import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { rulebookControlRegionEditors } from './rulebookControlRegionEditors';
import type { RulebookControlRegionEditorValue } from './rulebookControlRegionEditors';

const chapterLabelOnChange = fn();
const pageGuidanceOnChange = fn();

function createControlRegionEditorStory<Value>(
  Editor: ComponentType<{ value: Value; onChange: (nextValue: Value) => void }>,
  reportChange: (nextValue: Value) => void
) {
  return function ControlRegionEditorStory({ initialValue }: { initialValue: Value }) {
    const [value, setValue] = useState(initialValue);
    return (
      <Box w="min(35rem, calc(100vw - 2rem))">
        <Editor
          value={value}
          onChange={(nextValue) => {
            reportChange(nextValue);
            setValue(nextValue);
          }}
        />
      </Box>
    );
  };
}

const ChapterLabelStory = createControlRegionEditorStory(
  rulebookControlRegionEditors['chapter-opener']['chapter-label'],
  chapterLabelOnChange
);
const PageGuidanceStory = createControlRegionEditorStory<RulebookControlRegionEditorValue<'rules-page', 'guidance'>>(
  rulebookControlRegionEditors['rules-page'].guidance,
  pageGuidanceOnChange
);

const meta = preview.meta({
  title: 'Rulebooks/Control-region edit counterparts',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'centered' },
});

export const ChapterLabel = meta.story({
  render: () => <ChapterLabelStory initialValue="Chapter one" />,
  play: async ({ canvasElement }) => {
    chapterLabelOnChange.mockClear();
    const canvas = within(canvasElement);
    const chapterLabel = canvas.getByRole('textbox', { name: 'Chapter label' });
    await expect(chapterLabel).toHaveAccessibleDescription('Name the chapter or section introduced by this Page.');
    await userEvent.clear(chapterLabel);
    await userEvent.type(chapterLabel, 'The desert awakens');
    await expect(chapterLabelOnChange).toHaveBeenLastCalledWith('The desert awakens');
  },
});

export const PageGuidance = meta.story({
  render: () => (
    <PageGuidanceStory
      initialValue={{
        eyebrow: 'Rules page',
        introduction: 'Resolve movement before starting combat.',
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    pageGuidanceOnChange.mockClear();
    const canvas = within(canvasElement);
    const eyebrow = canvas.getByRole('textbox', { name: 'Eyebrow' });
    const introduction = canvas.getByRole('textbox', { name: 'Introduction' });
    await expect(eyebrow).toHaveAccessibleDescription("Add the short label shown above this Page's introduction.");
    await expect(introduction).toHaveAccessibleDescription('Introduce the rules collected on this Page.');
    await userEvent.clear(eyebrow);
    await userEvent.type(eyebrow, 'Sequence');
    await expect(pageGuidanceOnChange).toHaveBeenLastCalledWith({
      eyebrow: 'Sequence',
      introduction: 'Resolve movement before starting combat.',
    });
    await userEvent.tab();
    await expect(introduction).toHaveFocus();
    await userEvent.type(introduction, ' Then collect spice.');
    await expect(pageGuidanceOnChange).toHaveBeenLastCalledWith({
      eyebrow: 'Sequence',
      introduction: 'Resolve movement before starting combat. Then collect spice.',
    });
  },
});

export const InvalidIntroduction = meta.story({
  render: () => (
    <PageGuidanceStory
      initialValue={{
        eyebrow: 'Rules page',
        introduction: 'An *unfinished introduction',
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Introduction' })).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText(/Suggestion:/)).toBeVisible();
  },
});

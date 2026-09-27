import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { CoverEdit, CoverFooterEdit } from './rulebookControlRegionEditors';

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

const meta = preview.meta({
  title: 'Rulebooks/Control-region edit counterparts',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'centered' },
});

const coverChange = fn();
const CoverStory = createControlRegionEditorStory(CoverEdit, coverChange);
export const Cover = meta.story({
  render: () => (
    <CoverStory
      initialValue={{
        backgroundImageUrl: '',
        showDuneLogo: true,
        showSubtitle: true,
        subtitle: 'Dreamrules',
        supportingText: 'Rules for an evening on Arrakis.',
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Subtitle' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Subtitle' }), 'Advanced rules');
    expect(coverChange.mock.lastCall?.[0]).toEqual({
      backgroundImageUrl: '',
      showDuneLogo: true,
      showSubtitle: true,
      subtitle: 'Advanced rules',
      supportingText: 'Rules for an evening on Arrakis.',
    });
    await userEvent.click(canvas.getByRole('switch', { name: 'Show subtitle' }));
    expect(canvas.queryByRole('textbox', { name: 'Subtitle' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Show subtitle' }));
    expect(canvas.getByRole('textbox', { name: 'Subtitle' })).toHaveValue('Advanced rules');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Background image URL' }), 'http://example.com/image.jpg');
    expect(canvas.getByRole('textbox', { name: 'Background image URL' })).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Background image URL' }));
    expect(canvas.getByRole('textbox', { name: 'Background image URL' })).not.toHaveAttribute('aria-invalid', 'true');
  },
});

export const CoverPresets = meta.story({
  render: () => (
    <CoverStory initialValue={{ backgroundImageUrl: '', showDuneLogo: true, subtitle: '', supportingText: '' }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole('switch', { name: 'Show cover footer' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: 'Preset' }));
    expect(canvas.queryByRole('textbox', { name: 'Background image URL' })).not.toBeInTheDocument();
    const page = within(canvasElement.ownerDocument.body);
    const preset = canvas.getByRole('combobox', { name: 'Cover preset' });
    expect(preset).toHaveValue('Sandworm');
    await userEvent.click(preset);
    const option = await page.findByRole('option', { name: 'Spice harvester' });
    await userEvent.hover(within(option).getByText('Spice harvester'));
    const preview = await page.findByRole('dialog');
    expect(preview.querySelector('img')).toHaveAttribute('src', '/image/rulebook-cover/spice-harvester-small.jpg');
    expect(preset).toHaveValue('Sandworm');
    await userEvent.click(option);
    expect(preset).toHaveValue('Spice harvester');
    expect(coverChange.mock.lastCall?.[0]).toMatchObject({
      backgroundSource: { kind: 'preset', presetId: 'spice-harvester' },
      backgroundImageUrl: '',
    });
    await userEvent.click(canvas.getByRole('radio', { name: 'Image URL' }));
    expect(canvas.queryByRole('combobox', { name: 'Cover preset' })).not.toBeInTheDocument();
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Background image URL' }),
      'https://example.com/cover.jpg'
    );
    expect(coverChange.mock.lastCall?.[0]).toMatchObject({
      backgroundSource: { kind: 'url' },
      backgroundImageUrl: 'https://example.com/cover.jpg',
    });
    await userEvent.click(canvas.getByRole('radio', { name: 'Preset' }));
    expect(coverChange.mock.lastCall?.[0].backgroundImageUrl).toBe('');
  },
});

const coverFooterChange = fn();
const CoverFooterStory = createControlRegionEditorStory(CoverFooterEdit, coverFooterChange);

export const CoverFooter = meta.story({
  render: () => <CoverFooterStory initialValue={{ enabled: false, title: '', label: '' }} />,
  play: async ({ canvasElement }) => {
    coverFooterChange.mockClear();
    const canvas = within(canvasElement);
    expect(canvas.queryByRole('textbox', { name: 'Background image URL' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('textbox', { name: 'Subtitle' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('textbox', { name: 'Footer title' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Show cover footer' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Footer title' }), 'CHOAM &\nRICHESE');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Footer label' }), 'House expansion');
    await userEvent.click(canvas.getByRole('switch', { name: 'Show cover footer' }));
    expect(canvas.queryByRole('textbox', { name: 'Footer title' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Show cover footer' }));
    expect(canvas.getByRole('textbox', { name: 'Footer title' })).toHaveValue('CHOAM &\nRICHESE');
    expect(canvas.getByRole('textbox', { name: 'Footer label' })).toHaveValue('House expansion');
    expect(coverFooterChange).toHaveBeenLastCalledWith({
      enabled: true,
      title: 'CHOAM &\nRICHESE',
      label: 'House expansion',
    });
  },
});

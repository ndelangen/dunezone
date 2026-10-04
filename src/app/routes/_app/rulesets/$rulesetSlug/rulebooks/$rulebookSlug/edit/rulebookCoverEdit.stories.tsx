import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import {
  coverChange,
  CoverStory,
  coverFooterChange,
  CoverFooterStory,
} from './rulebookControlRegionEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Page/Cover/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'centered' },
});

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
    const option = await page.findByRole('option', { name: 'Dreamrules rainbow' });
    await userEvent.hover(within(option).getByText('Dreamrules rainbow'));
    const preview = await waitForFrame(() => page.getByRole('dialog', { name: 'Artwork preview' }));
    expect(preview.querySelector('img')).toHaveAttribute('src', '/image/rulebook-cover/dreamrules-rainbow-small.jpg');
    await userEvent.keyboard('{Escape}');
    expect(preset).toHaveValue('Sandworm');
    await userEvent.click(preset);
    await userEvent.click(await page.findByRole('option', { name: 'Dreamrules rainbow' }));
    expect(preset).toHaveValue('Dreamrules rainbow');
    expect(coverChange.mock.lastCall?.[0]).toMatchObject({
      backgroundSource: { kind: 'preset', presetId: 'dreamrules-rainbow' },
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

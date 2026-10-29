import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import {
  coverChange,
  CoverStory,
  coverFooterChange,
  CoverFooterStory,
} from './rulebookControlRegionEditors.shared.stories.fixture';

const meta = testingPreview.meta({
  title: 'Page/Cover/Editing',
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
    await expect(coverChange.mock.lastCall?.[0]).toEqual({
      backgroundImageUrl: '',
      showDuneLogo: true,
      showSubtitle: true,
      subtitle: 'Advanced rules',
      supportingText: 'Rules for an evening on Arrakis.',
    });
    await userEvent.click(canvas.getByRole('switch', { name: 'Show subtitle' }));
    await expect(canvas.queryByRole('textbox', { name: 'Subtitle' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Show subtitle' }));
    await expect(canvas.getByRole('textbox', { name: 'Subtitle' })).toHaveValue('Advanced rules');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Background image URL' }), 'http://example.com/image.jpg');
    await expect(canvas.getByRole('textbox', { name: 'Background image URL' })).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Background image URL' }));
    await expect(canvas.getByRole('textbox', { name: 'Background image URL' })).not.toHaveAttribute(
      'aria-invalid',
      'true'
    );
  },
});

export const CoverPresets = meta.story({
  render: () => (
    <CoverStory initialValue={{ backgroundImageUrl: '', showDuneLogo: true, subtitle: '', supportingText: '' }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('switch', { name: 'Show cover footer' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: 'Preset' }));
    await expect(canvas.queryByRole('textbox', { name: 'Background image URL' })).not.toBeInTheDocument();
    const page = within(canvasElement.ownerDocument.body);
    const preset = canvas.getByRole('combobox', { name: 'Cover preset' });
    await expect(preset).toHaveValue('Shai-Hulud');
    await userEvent.click(preset);
    await userEvent.click(await page.findByRole('option', { name: 'Dreamrules rainbow' }));
    await expect(preset).toHaveValue('Dreamrules rainbow');
    await expect(coverChange.mock.lastCall?.[0]).toMatchObject({
      backgroundSource: { kind: 'preset', presetId: 'dreamrules-rainbow' },
      backgroundImageUrl: '',
    });
    await userEvent.click(canvas.getByRole('radio', { name: 'Image URL' }));
    await expect(canvas.queryByRole('combobox', { name: 'Cover preset' })).not.toBeInTheDocument();
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Background image URL' }),
      'https://example.com/cover.jpg'
    );
    await expect(coverChange.mock.lastCall?.[0]).toMatchObject({
      backgroundSource: { kind: 'url' },
      backgroundImageUrl: 'https://example.com/cover.jpg',
    });
    await userEvent.click(canvas.getByRole('radio', { name: 'Preset' }));
    await expect(coverChange.mock.lastCall?.[0].backgroundImageUrl).toBe('');
  },
});

export const CoverFooter = meta.story({
  render: () => <CoverFooterStory initialValue={{ enabled: false, title: '', label: '' }} />,
  play: async ({ canvasElement }) => {
    coverFooterChange.mockClear();
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('textbox', { name: 'Background image URL' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('textbox', { name: 'Subtitle' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('textbox', { name: 'Footer title' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Show cover footer' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Footer title' }), 'CHOAM &\nRICHESE');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Footer label' }), 'House expansion');
    await userEvent.click(canvas.getByRole('switch', { name: 'Show cover footer' }));
    await expect(canvas.queryByRole('textbox', { name: 'Footer title' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Show cover footer' }));
    await expect(canvas.getByRole('textbox', { name: 'Footer title' })).toHaveValue('CHOAM &\nRICHESE');
    await expect(canvas.getByRole('textbox', { name: 'Footer label' })).toHaveValue('House expansion');
    await expect(coverFooterChange).toHaveBeenLastCalledWith({
      enabled: true,
      title: 'CHOAM &\nRICHESE',
      label: 'House expansion',
    });
  },
});

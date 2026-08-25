import preview from '@sb/preview';
import { userEvent, within } from 'storybook/test';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Profiles',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const Directory = meta.story({ args: { path: '/profiles' } });
export const Detail = meta.story({
  args: { path: '/profiles/storybook-viewer' },
});
export const Settings = meta.story({
  args: { path: '/profiles/storybook-viewer/edit' },
});
export const DeleteAccount = meta.story({
  args: { path: '/profiles/storybook-viewer/delete' },
});

export const DeleteAccountReplacementPicker = meta.story({
  args: { path: '/profiles/storybook-viewer/delete' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose a replacement owner' }, { timeout: 30_000 }));
    await page.findByText('No other active profiles are available.', {}, { timeout: 30_000 });
  },
});

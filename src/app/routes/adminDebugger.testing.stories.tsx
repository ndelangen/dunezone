import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { openReport } from './adminDebugger.stories.fixture';
import { withoutAdmins } from './adminPages.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Admin/Game debugger',
  ...pageStoryMeta,
  args: { path: '/admin/game-debugger' },
});

export const InspectReport = meta.story({
  play: async ({ canvasElement }) => {
    const page = await openReport(canvasElement);
    await userEvent.click(page.getByRole('tab', { name: /^Table$/ }));
    await expect(page.findByRole('img', { name: 'Game table' }, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'Server / browser' }));
    await expect(page.getByText('.revision')).toBeVisible();
    await expect(page.getByRole('cell', { name: /^14$/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /^13$/ })).toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'Game and Audit events' }));
    await expect(page.getByText('Earlier events were not included in this report.')).toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'Browser logs' }));
    await expect(page.getByText('Connection interrupted before revision 14 arrived.', { exact: false })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Close report' }));
    await expect(page.queryByRole('tab', { name: 'State' })).toBeNull();
  },
});

export const RejectInvalidFile = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Bug report file' }, { timeout: 30_000 });
    await userEvent.upload(
      canvasElement.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(['{"server":{"format":"unknown"}}'], 'invalid.json', { type: 'application/json' })
    );
    await expect(page.findByRole('alert')).resolves.toHaveTextContent('not a supported Dune Zone bug report');
    await expect(page.queryByRole('tab', { name: 'State' })).toBeNull();
  },
});

export const NotAuthorized = meta.story({
  parameters: withoutAdmins,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Admin access required' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Bug report file' })).toBeNull();
  },
});

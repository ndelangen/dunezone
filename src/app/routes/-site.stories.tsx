import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Site',
  ...pageStoryMeta,
});

/**
 * The most-reached message in the application, and the last one to wear the shared frame.
 * The assertions distinguish the frame from what stood here before, which was a bare paragraph and a raw link under a title with no pane.
 */
export const NotFound = meta.story({
  args: { path: '/a-page-that-does-not-exist' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Page not found' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByRole('heading', { name: 'This page does not exist' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const back = await page.findByRole('link', { name: 'Go back home' }, { timeout: 30_000 });
    expect(back.closest('main')).toBeNull();
  },
});
export const Icons = meta.story({ args: { path: '/__icons' } });
export const PublicationJobs = meta.story({ args: { path: '/__jobs' } });

/** The job queue reached by a reader the server does not recognise, which is a login gate rather than an alert inside a dashboard header. */
export const PublicationJobsSignedOut = meta.story({
  args: { path: '/__jobs' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    /* The dashboard's own header, with its briefcase and its description, is what the frame replaces. */
    await expect(
      page.queryByText(
        'Inspect the durable work queue and control whether the next scheduled run may pick up pending work.'
      )
    ).toBeNull();
  },
});
export const FuturePlans = meta.story({ args: { path: '/future-plans' } });
export const Privacy = meta.story({ args: { path: '/privacy' } });

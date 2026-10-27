import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { GAME_LOG } from '../../game.stories.fixture';
import { BUG_REPORT_ENTRY, logPage, logPanelMeta } from './LogPanel.stories.fixture';

const meta = testingPreview.meta({ ...logPanelMeta, title: 'Play/Panels/Log' });

/** Newest first, each entry with its kind and when it happened; the newest page has no way further forward. */
export const NewestFirst = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'SpiceRidwan collected 3 spice from the table into the Fremen spice reserve.Setup, Prediction',
      'SpiceTwaffle withdrew 4 spice from the House Atreides spice reserve to the table.Setup, Prediction',
      'PredictionBene Gesserit revealed its prediction: House Atreides, turn 6.Setup, Prediction',
      'PredictionBene Gesserit locked its prediction.Setup, Prediction',
    ]);
    await expect(canvas.queryByRole('button', { name: 'Earlier entries' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Latest entries' })).toBeNull();
  },
});

/** An older page reads further back or returns to the newest. */
export const PagesThroughTheLog = meta.story({
  args: { page: logPage(GAME_LOG, { more: true, latest: false }) },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Earlier entries' }));
    await expect(args.onEarlier).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Latest entries' }));
    await expect(args.onLatest).toHaveBeenCalledOnce();
  },
});

/** A bug report links to the issue it filed. */
export const BugReportLinksItsIssue = meta.story({
  args: { page: logPage([BUG_REPORT_ENTRY]) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Bug report')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Open GitHub issue' })).toHaveAttribute(
      'href',
      BUG_REPORT_ENTRY.issueUrl
    );
  },
});

/** Before the first page arrives. */
export const Loading = meta.story({
  args: { page: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Loading the log...')).toBeVisible();
  },
});

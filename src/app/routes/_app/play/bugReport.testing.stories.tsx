import { testingPreview } from '@sb/preview';
import { expect, mocked, userEvent, within } from 'storybook/test';

import { sendPlayBugReport } from '@db/playBugReports';

import { gameMeta, install } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Bug reports',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/*
 * The status poll holds its answer until the story has seen the creating stage, so a slow frame cannot let the poll
 * reach complete before the brief "Creating the GitHub issue..." is read.
 */
let releaseStatus = () => {};

export const Send = meta.story({
  beforeEach: [
    install(() => productTransport()),
    () => {
      const seen = new Promise<void>((resolve) => {
        releaseStatus = resolve;
      });
      mocked(sendPlayBugReport).mockImplementation(async (_gameId, request) => {
        if (request.operation === 'send') {
          return { requestId: request.requestId, stage: 'creating' };
        }
        await seen;
        return {
          requestId: request.requestId,
          stage: 'complete',
          issueUrl: 'https://github.com/ndelangen/dunezone/issues/1',
        };
      });
    },
  ],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Report a bug');
    const send = page.getByRole('button', { name: 'Send report' });
    await expect(send).toBeDisabled();
    await userEvent.type(
      page.getByRole('textbox', { name: 'What went wrong?' }),
      'Dragging a troop from Arrakeen leaves it behind.'
    );
    await expect(send).toBeDisabled();
    await userEvent.click(page.getByRole('checkbox'));
    await expect(send).toBeEnabled();
    await userEvent.click(send);
    await expect(page.findByText('Creating the GitHub issue...')).resolves.toBeVisible();
    releaseStatus();
    await expect(page.findByRole('link', { name: 'Open GitHub issue' }, { timeout: 8000 })).resolves.toHaveAttribute(
      'href',
      'https://github.com/ndelangen/dunezone/issues/1'
    );
    const call = mocked(sendPlayBugReport).mock.calls.find(([, request]) => request.operation === 'send');
    await expect(call?.[1]).toMatchObject({
      operation: 'send',
      description: 'Dragging a troop from Arrakeen leaves it behind.',
      browser: { logs: expect.any(Array), snapshot: expect.any(Object) },
    });
  },
});

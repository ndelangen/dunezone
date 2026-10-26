import { homepageSnapshot } from '@shared/homepage/setup';
import { expect, userEvent, within } from 'storybook/test';

/** Public homepage game data in the report envelope, with a deliberately older browser revision. */
export function reportFile() {
  const snapshot = homepageSnapshot('https://dune.zone');
  return new File(
    [
      JSON.stringify({
        server: {
          format: 'dunezone-game-report-v1',
          capturedAt: '2026-10-26T12:00:00.000Z',
          gameId: 'example-game',
          gitSha: 'example-release',
          versionId: 'example-worker',
          state: { ...snapshot, revision: 14 },
          captures: { ruleset: { board: snapshot.board } },
          activity: {},
          conversations: { messages: [{ id: 'message-1', text: '-redacted message, original length: 12-' }] },
          events: {
            game: {
              entries: [{ sequence: 8, context: 'Turn 1', text: 'The table moved to Bidding.', at: 1_793_015_999_000 }],
              more: true,
            },
            audit: { entries: [], more: false },
          },
        },
        browser: {
          snapshot: { snapshot: { ...snapshot, revision: 13 } },
          conversations: {},
          diagnostics: { clientRevision: 13, connection: 'reconnecting' },
          logs: [
            {
              at: '1400ms after navigation',
              level: 'error',
              text: 'Connection interrupted before revision 14 arrived.',
            },
          ],
          droppedLogs: 3,
        },
      }),
    ],
    'example-report.json',
    { type: 'application/json' }
  );
}

export async function openReport(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByRole('button', { name: 'Bug report file' }, { timeout: 30_000 });
  const input = canvasElement.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]')!;
  await userEvent.upload(input, reportFile());
  await expect(page.findByText('Game example-game')).resolves.toBeVisible();
  return page;
}

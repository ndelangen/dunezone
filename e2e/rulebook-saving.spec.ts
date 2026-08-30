import type { Page, WebSocketRoute } from '@playwright/test';

import { expect, test } from './coverage';
import { seedRulebookEditor } from './rulebook-fixture';

test.use({
  storageState: '.playwright/user-a-rulebook-save.json',
  viewport: { width: 1280, height: 1000 },
  colorScheme: 'dark',
});
test.afterEach(async ({ context }) => {
  await context.storageState({ path: '.playwright/user-a-rulebook-save.json' });
});

type SaveControl = {
  saves: number;
  pauseUpdates: boolean;
  failNext: boolean;
  holdNext: boolean;
  releaseSave: () => void;
  releaseUpdates: () => void;
};

function forwardSave(message: string | Buffer, ws: WebSocketRoute, server: WebSocketRoute, control: SaveControl) {
  const value = JSON.parse(String(message));
  if (value.type !== 'Mutation' || value.udfPath !== 'rulebooks:save') {
    server.send(message);
    return;
  }
  control.saves += 1;
  if (control.failNext) {
    control.failNext = false;
    ws.send(
      JSON.stringify({
        type: 'MutationResponse',
        requestId: value.requestId,
        success: false,
        result: 'Injected Save failure',
        logLines: [],
      })
    );
    return;
  }
  control.releaseUpdates();
  if (control.holdNext) {
    control.holdNext = false;
    control.releaseSave = () => server.send(message);
    return;
  }
  server.send(message);
}

/** Delay transport delivery, not application state, to make the Save races repeatable. */
async function saveTransport(page: Page) {
  const control: SaveControl = {
    saves: 0,
    pauseUpdates: false,
    failNext: false,
    holdNext: false,
    releaseSave: () => {},
    releaseUpdates: () => {},
  };
  await page.routeWebSocket(
    (url) => url.pathname.endsWith('/sync'),
    (ws) => {
      const server = ws.connectToServer();
      const queued: Array<string | Buffer> = [];
      control.releaseUpdates = () => {
        control.pauseUpdates = false;
        for (const message of queued.splice(0)) {
          ws.send(message);
        }
      };
      server.onMessage((message) => {
        const value = JSON.parse(String(message));
        const isQueryUpdate = value.type === 'Transition' || value.type === 'TransitionChunk';
        if (control.pauseUpdates && isQueryUpdate) {
          queued.push(message);
        } else {
          ws.send(message);
        }
      });
      ws.onMessage((message) => forwardSave(message, ws, server, control));
    }
  );
  return control;
}

test('two authors rebase, save, reload, and keep edits made during Save', async ({ page, newUserPage }, testInfo) => {
  const fixture = await seedRulebookEditor();
  const transport = await saveTransport(page);
  const other = await newUserPage({ storageState: '.playwright/user-b-rulebook-save.json' });
  try {
    const collaborator = other.page;
    await page.goto(`${fixture.path}#RULE/details`);
    await collaborator.goto(`${fixture.path}#RULE/details`);
    await expect(page.getByText('Revision 1', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: testInfo.outputPath('saved-editor.png'), fullPage: false });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Local movement');
    await expect(collaborator.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Movement');
    await expect(collaborator.getByText('Revision 1', { exact: true })).toBeVisible();
    await collaborator.getByRole('textbox', { name: 'Anchor', exact: true }).fill('saved-movement');
    expect(transport.saves).toBe(0);
    await collaborator.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Anchor', exact: true })).toHaveValue('saved-movement');
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Local movement');
    transport.holdNext = true;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => transport.saves).toBe(1);
    await expect(page.getByText('Saving', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Written during Save');
    transport.releaseSave();
    await expect(page.getByText('Revision 3', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Written during Save');
    await expect(page.getByText('Local changes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Written during Save');
    await expect(page.getByRole('textbox', { name: 'Anchor', exact: true })).toHaveValue('saved-movement');
    await expect(page.getByText('Revision 4', { exact: true })).toBeVisible();
  } finally {
    await other.page.context().storageState({ path: '.playwright/user-b-rulebook-save.json' });
    await other.close();
  }
});

test('incompatible saves require an explicit review while local editing stays available', async ({
  page,
  newUserPage,
}, testInfo) => {
  const fixture = await seedRulebookEditor();
  const other = await newUserPage({ storageState: '.playwright/user-b-rulebook-save.json' });
  try {
    const collaborator = other.page;
    await page.goto(`${fixture.path}#RULE/details`);
    await collaborator.goto(`${fixture.path}#RULE/details`);
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('My movement');
    await collaborator.getByRole('textbox', { name: 'Title', exact: true }).fill('Their movement');
    await collaborator.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review differences', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review differences', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Your draft', exact: true })).toContainText('My movement');
    await expect(page.getByRole('region', { name: 'Latest saved version', exact: true })).toContainText(
      'Their movement'
    );
    await page.screenshot({ path: testInfo.outputPath('review-differences.png'), fullPage: false });
    await page.setViewportSize({ width: 320, height: 700 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
      .toBe(true);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await collaborator.getByRole('textbox', { name: 'Title', exact: true }).fill('Their latest movement');
    await collaborator.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Latest saved version', exact: true })).toContainText(
      'Their latest movement'
    );
    await expect(page.getByRole('region', { name: 'Your draft', exact: true })).toContainText('My movement');
    await page.getByRole('button', { name: 'Back to editing' }).click();
    await page.getByRole('textbox', { name: 'Anchor', exact: true }).fill('reviewed-movement');
    await page.getByRole('button', { name: 'Review differences', exact: true }).click();
    await page.getByRole('button', { name: 'Keep your version' }).click();
    await expect(page.getByText('All differences are reviewed.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Back to editing' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('My movement');
    await expect(page.getByRole('textbox', { name: 'Anchor', exact: true })).toHaveValue('reviewed-movement');
  } finally {
    await other.page.context().storageState({ path: '.playwright/user-b-rulebook-save.json' });
    await other.close();
  }
});

test('a stale Save response and an injected failed Save both preserve work for retry', async ({
  page,
  newUserPage,
}) => {
  const fixture = await seedRulebookEditor();
  const transport = await saveTransport(page);
  const other = await newUserPage({ storageState: '.playwright/user-b-rulebook-save.json' });
  try {
    const collaborator = other.page;
    await page.goto(`${fixture.path}#RULE/details`);
    await collaborator.goto(`${fixture.path}#RULE/details`);
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A stale local draft');
    transport.pauseUpdates = true;
    await collaborator.getByRole('textbox', { name: 'Anchor', exact: true }).fill('remote-anchor');
    await collaborator.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(collaborator.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Another editor saved first.' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('A stale local draft');
    await expect(page.getByRole('textbox', { name: 'Anchor', exact: true })).toHaveValue('remote-anchor');
    transport.failNext = true;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Save failed.', { exact: false })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('A stale local draft');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('A stale local draft');
    await expect(page.getByText('Revision 3', { exact: true })).toBeVisible();
  } finally {
    await other.page.context().storageState({ path: '.playwright/user-b-rulebook-save.json' });
    await other.close();
  }
});

test('Asset references participate in review and can be cleared and saved', async ({ page, newUserPage }) => {
  const fixture = await seedRulebookEditor();
  const other = await newUserPage({ storageState: '.playwright/user-b-rulebook-save.json' });
  try {
    await page.goto(`${fixture.path}#RULE/ASST`);
    await other.page.goto(`${fixture.path}#RULE/ASST`);
    await page.getByRole('textbox', { name: 'Asset', exact: true }).fill('local-asset');
    await other.page.getByRole('textbox', { name: 'Asset', exact: true }).fill('saved-asset');
    await other.page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Review differences', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Your draft', exact: true })).toContainText('local-asset');
    await expect(page.getByRole('region', { name: 'Latest saved version', exact: true })).toContainText('saved-asset');
    await page.getByRole('button', { name: 'Keep saved version' }).click();
    await page.getByRole('button', { name: 'Back to editing' }).click();
    await expect(page.getByRole('textbox', { name: 'Asset', exact: true })).toHaveValue('saved-asset');
    await page.getByRole('textbox', { name: 'Asset', exact: true }).fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Asset', exact: true })).toHaveValue('');
    await expect(page.getByText('Revision 3', { exact: true })).toBeVisible();
  } finally {
    await other.page.context().storageState({ path: '.playwright/user-b-rulebook-save.json' });
    await other.close();
  }
});

test('a signed-in non-member cannot open the draft editor', async ({ newUserPage }) => {
  const fixture = await seedRulebookEditor(false);
  const other = await newUserPage({ storageState: '.playwright/user-b-rulebook-save.json' });
  try {
    await other.page.goto(fixture.path);
    await expect(other.page.getByRole('heading', { name: 'You cannot edit this Rulebook' })).toBeVisible();
    await expect(other.page.getByRole('textbox', { name: 'Title', exact: true })).toHaveCount(0);
  } finally {
    await other.page.context().storageState({ path: '.playwright/user-b-rulebook-save.json' });
    await other.close();
  }
});

test('missing and signed-out Rulebooks never expose the draft editor', async ({ browser }) => {
  const fixture = await seedRulebookEditor();
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await page.goto(fixture.path);
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveCount(0);
    await page.goto(fixture.path.replace('/starter/', '/missing/'));
    await expect(page.getByRole('heading', { name: 'Rulebook not found' })).toBeVisible();
  } finally {
    await context.close();
  }
});

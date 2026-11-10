import type { Locator, Page, WebSocketRoute } from '@playwright/test';

import { seedBiddingCatalogue, startBiddingBrowserRuntime } from './bidding.fixture';
import { expect, longSpecTimeoutMs, test } from './coverage';

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 10_000 });

const tablet = (page: Page) => page.getByTestId('tablet-screen');
const near = (page: Page) => tablet(page).locator('footer[aria-label="Near-side table controls"]');
const phone = (page: Page) => page.getByTestId('phone-screen');

/** Forward real relay traffic, with a controllable outage that leaves WebRTC online. */
async function relayOutage(page: Page) {
  let offline = false;
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/__play\/bidding\/[^/]+\/socket$/, async (socket) => {
    if (offline) {
      await socket.close();
      return;
    }
    sockets.push(socket, socket.connectToServer());
  });
  return {
    async disconnect() {
      offline = true;
      await Promise.all(sockets.splice(0).map((socket) => socket.close()));
    },
    reconnect() {
      offline = false;
    },
  };
}

async function fillNumber(scope: Page | Locator, name: string, value: number) {
  const input = scope.getByRole('textbox', { name, exact: true });
  await input.fill(String(value));
  await input.press('Tab');
  await expect(input).toHaveValue(String(value));
}

async function choose(page: Page, name: string, option: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function closeDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function setHandSwitch(page: Page, label: 'Full' | 'Always pass', checked: boolean) {
  const input = phone(page).getByRole('switch', { name: `Atreides ${label}`, exact: true });
  if ((await input.isChecked()) !== checked) {
    await input.press('Space');
  }
  await expect(input).toBeChecked({ checked });
}

async function tableMenu(page: Page, item: string | RegExp) {
  await near(page).getByRole('button', { name: 'Table controls', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: typeof item === 'string' }).click();
}

async function tableCode(page: Page) {
  await tableMenu(page, /^Join code/);
  const code = (await page.getByRole('dialog').getByLabel('Table code', { exact: true }).innerText()).trim();
  expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  await closeDialog(page);
  return code;
}

async function remoteMenu(page: Page, item: string) {
  await phone(page).getByRole('button', { name: 'Remote settings', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function join(page: Page, origin: string, code: string, viaJoinLink = false) {
  await page.goto(`${origin}/tools/bidding${viaJoinLink ? `?join=${code}` : ''}`);
  if (!viaJoinLink) {
    await page.getByRole('textbox', { name: 'Table code', exact: true }).fill(code);
    await page.getByRole('button', { name: 'Join table', exact: true }).click();
  }
  await phone(page).getByRole('button', { name: 'Atreides', exact: true }).click();
  await expect(phone(page).getByRole('textbox', { name: 'Atreides hand count', exact: true })).toBeVisible();
}

test('the tablet completes a phase with phones and listening unused', async ({ newUserPage, baseURL }, info) => {
  if (!baseURL) {
    throw new Error('The bidding journey needs the E2E application URL.');
  }
  const fixture = await seedBiddingCatalogue();
  const runtime = await startBiddingBrowserRuntime(baseURL);
  const central = await newUserPage({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1024, height: 768 },
    reducedMotion: 'reduce',
  });
  const page = central.page;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${runtime.origin}/tools/bidding`);
    await choose(page, 'Ruleset', fixture.rulesetName);
    await page.getByRole('button', { name: 'New table', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Table connection' })).toHaveText('Phone relay connected');
    for (const name of fixture.names.slice(2)) {
      await tablet(page)
        .getByRole('button', { name: `Remove ${name}`, exact: true })
        .click();
    }
    await choose(page, 'Bid timer', 'Off');
    await expect(near(page).getByRole('button', { name: 'Toggle listening', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await tableMenu(page, 'Hand controls');
    await page.getByRole('dialog').getByRole('button', { name: 'Edit Atreides hand', exact: true }).click();
    await fillNumber(page.getByRole('dialog'), 'Atreides hand count', 2);
    await fillNumber(page.getByRole('dialog'), 'Atreides hand limit', 5);
    await closeDialog(page);
    await fillNumber(page, 'Cards this phase', 1);
    await tablet(page).getByRole('button', { name: 'Choose Atreides as first bidder', exact: true }).click();
    await tablet(page).getByRole('button', { name: 'Start new bid', exact: true }).click();
    await near(page).getByRole('button', { name: 'Bid', exact: true }).click();
    await fillNumber(page.getByRole('dialog'), 'Tablet bid amount', 3);
    await page.getByRole('dialog').getByRole('button', { name: 'Bid 3', exact: true }).click();
    await closeDialog(page);
    await expect(tablet(page).getByRole('img', { name: 'Atreides has 3 spice', exact: true })).toBeVisible();
    await tablet(page)
      .locator('header[aria-label="Far-side table controls"]')
      .getByRole('button', { name: 'Pass', exact: true })
      .click();
    await expect(near(page).getByRole('button', { name: 'Next phase', exact: true })).toBeVisible();
    await expect(tablet(page).getByRole('button', { name: 'Atreides, 3 cards', exact: true })).toBeVisible();
    await expect(near(page).getByRole('button', { name: 'Toggle listening', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await tableMenu(page, 'Completed wins');
    await expect(page.getByRole('dialog')).toContainText('Card 1 · Atreides · 3 spice');
    await closeDialog(page);
    expect(errors).toEqual([]);
    const screenshot = info.outputPath('tablet-only-phase.png');
    await page.screenshot({ path: screenshot });
    await info.attach('tablet-only-phase', { path: screenshot, contentType: 'image/png' });
  } finally {
    try {
      await central.close();
    } finally {
      await runtime.close();
    }
  }
});

test('a physical table bids through a remote, restores and recovers into a new table', async ({
  newUserPage,
  baseURL,
}, info) => {
  test.setTimeout(longSpecTimeoutMs);
  if (!baseURL) {
    throw new Error('The bidding journey needs the E2E application URL.');
  }
  const fixture = await seedBiddingCatalogue();
  const runtime = await startBiddingBrowserRuntime(baseURL);
  const central = await newUserPage({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1024, height: 768 },
    reducedMotion: 'reduce',
  });
  const page = central.page;
  const remote = await newUserPage({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const secondRemote = await newUserPage({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const errors: string[] = [];
  for (const participant of [page, remote.page, secondRemote.page]) {
    participant.on('pageerror', (error) => errors.push(error.message));
  }
  let originalCode = '';
  let recoveredCode = '';
  try {
    const centralRelay = await relayOutage(page);
    const remoteRelay = await relayOutage(remote.page);
    await test.step('set up real catalogue factions and join through the QR link', async () => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(`${runtime.origin}/tools/bidding`);
      await choose(page, 'Ruleset', fixture.rulesetName);
      await page.getByRole('button', { name: 'New table', exact: true }).click();
      for (const name of fixture.names.slice(2)) {
        await tablet(page)
          .getByRole('button', { name: `Remove ${name}`, exact: true })
          .click();
      }
      await choose(page, 'Bid timer', 'Off');
      await fillNumber(page, 'Cards this phase', 2);
      originalCode = await tableCode(page);
      await join(remote.page, runtime.origin, originalCode, true);
      await expect(remote.page).toHaveURL(`${runtime.origin}/tools/bidding`);
      await expect(remote.page.getByRole('status', { name: 'Table connection' })).toHaveText('Direct to the table');
    });

    await test.step('edit hands, override Full and start with a chosen bidder', async () => {
      const full = phone(remote.page).getByRole('switch', { name: 'Atreides Full', exact: true });
      await fillNumber(phone(remote.page), 'Atreides hand count', 5);
      await expect(full).toBeChecked();
      await setHandSwitch(remote.page, 'Full', false);
      await expect(tablet(page).getByRole('button', { name: 'Atreides, 5 cards', exact: true })).toBeVisible();
      await phone(remote.page).getByRole('button', { name: 'Adjust hand limit', exact: true }).click();
      await fillNumber(remote.page.getByRole('dialog'), 'Atreides hand limit', 6);
      await closeDialog(remote.page);
      await expect(full).not.toBeChecked();
      await fillNumber(phone(remote.page), 'Atreides hand count', 3);
      await phone(remote.page).getByRole('button', { name: 'Adjust hand limit', exact: true }).click();
      await fillNumber(remote.page.getByRole('dialog'), 'Atreides hand limit', 4);
      await closeDialog(remote.page);
      await tablet(page).getByRole('button', { name: 'Choose Atreides as first bidder', exact: true }).click();
      await tablet(page).getByRole('button', { name: 'Start new bid', exact: true }).click();
      await expect(phone(remote.page).getByText('Your turn', { exact: true })).toBeVisible();
    });

    await test.step('mix phone and tablet actions, then restore the live bid paused', async () => {
      await centralRelay.disconnect();
      await remoteRelay.disconnect();
      await phone(remote.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(tablet(page).getByRole('img', { name: 'Atreides has 1 spice', exact: true })).toBeVisible();
      await near(page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(phone(remote.page).getByText('Your turn', { exact: true })).toBeVisible();
      await phone(remote.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(tablet(page).getByRole('img', { name: 'Atreides has 3 spice', exact: true })).toBeVisible();
      centralRelay.reconnect();
      remoteRelay.reconnect();
      await page.reload();
      await expect(near(page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      await expect(tablet(page).getByRole('img', { name: 'Atreides has 3 spice', exact: true })).toBeVisible();
      await expect(phone(remote.page).getByText('Table paused', { exact: true })).toBeVisible();
      await near(page).getByRole('button', { name: 'Resume', exact: true }).click();
      await near(page).getByRole('button', { name: 'Pass', exact: true }).click();
      await expect(phone(remote.page).getByRole('textbox', { name: 'Atreides hand count', exact: true })).toHaveValue(
        '4'
      );
      await expect(phone(remote.page).getByRole('switch', { name: 'Atreides Full', exact: true })).toBeChecked();
      await expect(
        phone(remote.page).getByRole('button', { name: 'Choose Harkonnen as first bidder', exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('reset only the current card and keep wins and hand settings', async () => {
      await setHandSwitch(remote.page, 'Full', false);
      await setHandSwitch(remote.page, 'Always pass', true);
      await near(page).getByRole('button', { name: 'Start new bid', exact: true }).click();
      await remoteMenu(remote.page, 'Reset this card');
      await expect(phone(remote.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeVisible();
      await expect(phone(remote.page).getByRole('textbox', { name: 'Atreides hand count', exact: true })).toHaveValue(
        '4'
      );
      await expect(phone(remote.page).getByRole('switch', { name: 'Atreides Full', exact: true })).not.toBeChecked();
      await expect(phone(remote.page).getByRole('switch', { name: 'Atreides Always pass', exact: true })).toBeChecked();
      await tableMenu(page, 'Completed wins');
      await expect(page.getByRole('dialog')).toContainText('Card 1 · Atreides · 3 spice');
      await closeDialog(page);
      await setHandSwitch(remote.page, 'Always pass', false);
      await phone(remote.page).getByRole('button', { name: 'Choose Harkonnen as first bidder', exact: true }).click();
      await phone(remote.page).getByRole('button', { name: 'Start new bid', exact: true }).click();
      await near(page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(tablet(page).getByRole('img', { name: 'Harkonnen has 1 spice', exact: true })).toBeVisible();
    });

    await test.step('promote the recovery copy, isolate the old table and rejoin a remote', async () => {
      await expect(phone(remote.page).getByText('Your turn', { exact: true })).toBeVisible();
      await remoteMenu(remote.page, 'Recovery copy');
      await expect(phone(remote.page)).toContainText('Harkonnen has 1');
      await expect(phone(remote.page)).toContainText('Card 1 · Atreides · 3 spice');
      await phone(remote.page).getByRole('button', { name: 'Use this phone as central', exact: true }).click();
      await expect(near(remote.page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      recoveredCode = await tableCode(remote.page);
      expect(recoveredCode).not.toBe(originalCode);
      await remote.page.reload();
      await expect(near(remote.page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      expect(await tableCode(remote.page)).toBe(recoveredCode);
      await expect(tablet(remote.page).getByRole('img', { name: 'Harkonnen has 1 spice', exact: true })).toBeVisible();
      await near(page).getByRole('button', { name: '+1', exact: true }).click();
      await near(page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(tablet(page).getByRole('img', { name: 'Harkonnen has 3 spice', exact: true })).toBeVisible();
      await expect(tablet(remote.page).getByRole('img', { name: 'Harkonnen has 1 spice', exact: true })).toBeVisible();

      /* This remote has no WebRTC support, so the same flow also proves the relay fallback. */
      await secondRemote.page.context().addInitScript(() => {
        Object.defineProperty(window, 'RTCPeerConnection', { value: undefined });
      });
      await join(secondRemote.page, runtime.origin, recoveredCode, true);
      await expect(secondRemote.page).toHaveURL(`${runtime.origin}/tools/bidding`);
      await expect(secondRemote.page.getByRole('status', { name: 'Table connection' })).toHaveText(
        'Connected through the relay'
      );
      await expect(phone(secondRemote.page).getByText('Table paused', { exact: true })).toBeVisible();
      await near(remote.page).getByRole('button', { name: 'Resume', exact: true }).click();
      await phone(secondRemote.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(tablet(remote.page).getByRole('img', { name: 'Atreides has 2 spice', exact: true })).toBeVisible();
      await near(remote.page).getByRole('button', { name: 'Pass', exact: true }).click();
      await expect(phone(secondRemote.page).getByText('Phase complete', { exact: true })).toBeVisible();
      await expect(
        phone(secondRemote.page).getByRole('textbox', { name: 'Atreides hand count', exact: true })
      ).toHaveValue('5');
    });

    await test.step('give a restored bidder a fresh timer and pass on expiry', async () => {
      await near(remote.page).getByRole('button', { name: 'Next phase', exact: true }).click();
      await choose(remote.page, 'Bid timer', '5 seconds');
      await fillNumber(remote.page, 'Cards this phase', 1);
      await tablet(remote.page).getByRole('button', { name: 'Choose Harkonnen as first bidder', exact: true }).click();
      await tablet(remote.page).getByRole('button', { name: 'Start new bid', exact: true }).click();
      await remote.page.reload();
      await expect(near(remote.page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      const resumedAt = Date.now();
      await near(remote.page).getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(tablet(remote.page).getByText('5s', { exact: true }).first()).toBeVisible();
      await expect(near(remote.page).getByRole('button', { name: 'Next phase', exact: true })).toBeVisible({
        timeout: 10_000,
      });
      expect(Date.now() - resumedAt).toBeGreaterThanOrEqual(4500);
      await expect(phone(secondRemote.page).getByText('Phase complete', { exact: true })).toBeVisible();
    });

    await test.step('leave and rejoin a phone without restoring its old join link', async () => {
      await remoteMenu(secondRemote.page, 'Leave table');
      await secondRemote.page
        .getByRole('dialog', { name: 'Leave table', exact: true })
        .getByRole('button', { name: 'Leave table', exact: true })
        .click();
      await expect(secondRemote.page).toHaveURL(`${runtime.origin}/tools/bidding`);
      await expect(secondRemote.page.getByRole('button', { name: 'New table', exact: true })).toBeVisible();
      await secondRemote.page.reload();
      await expect(secondRemote.page.getByRole('button', { name: 'New table', exact: true })).toBeVisible();
      await secondRemote.page.getByRole('textbox', { name: 'Table code', exact: true }).fill(recoveredCode);
      await secondRemote.page.getByRole('button', { name: 'Join table', exact: true }).click();
      await expect(
        phone(secondRemote.page).getByRole('textbox', { name: 'Atreides hand count', exact: true })
      ).toHaveValue('5');
      await fillNumber(phone(secondRemote.page), 'Atreides hand count', 6);
      await expect(
        tablet(remote.page).getByRole('button', { name: 'Atreides, 6 cards, Full', exact: true })
      ).toBeVisible();
    });

    await test.step('leave the promoted central and create a fresh table that survives reload', async () => {
      await tableMenu(remote.page, 'Leave table');
      await remote.page
        .getByRole('dialog', { name: 'Leave table', exact: true })
        .getByRole('button', { name: 'Leave table', exact: true })
        .click();
      await expect(remote.page).toHaveURL(`${runtime.origin}/tools/bidding`);
      await expect(remote.page.getByRole('button', { name: 'New table', exact: true })).toBeVisible();
      await remote.page.reload();
      await expect(remote.page.getByRole('button', { name: 'New table', exact: true })).toBeVisible();
      await choose(remote.page, 'Ruleset', fixture.rulesetName);
      await remote.page.getByRole('button', { name: 'New table', exact: true }).click();
      await expect(tablet(remote.page).locator('[data-seat-id]')).toHaveCount(6);
      await expect(tablet(remote.page).getByRole('button', { name: 'Atreides, 1 cards', exact: true })).toBeVisible();
      const freshCode = await tableCode(remote.page);
      expect(freshCode).not.toBe(recoveredCode);
      expect(freshCode).not.toBe(originalCode);
      await tableMenu(remote.page, 'Completed wins');
      await expect(remote.page.getByRole('dialog')).toContainText('No completed wins yet.');
      await closeDialog(remote.page);
      await remote.page.reload();
      await expect(near(remote.page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      expect(await tableCode(remote.page)).toBe(freshCode);
      await expect(tablet(remote.page).getByRole('button', { name: 'Atreides, 1 cards', exact: true })).toBeVisible();
      await near(remote.page).getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(tablet(remote.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeVisible();
    });
    expect(errors).toEqual([]);
    await info.attach('bidding-flow.json', {
      body: JSON.stringify({
        centralAndRemote: true,
        recoveryCreatesNewCode: originalCode !== recoveredCode,
        leaveAndNewTable: true,
        timerSeconds: 5,
        errors,
      }),
      contentType: 'application/json',
    });
  } finally {
    try {
      await central.close();
      await remote.close();
      await secondRemote.close();
    } finally {
      await runtime.close();
    }
  }
});

import type { Locator, Page, WebSocketRoute } from '@playwright/test';

import { seedBiddingCatalogue, startBiddingBrowserRuntime } from './bidding.fixture';
import { expect, longSpecTimeoutMs, test } from './coverage';

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 10_000 });

const tablet = (page: Page) => page.getByTestId('tablet-screen');
const setup = (page: Page) => page.getByTestId('setup-screen');
const near = (page: Page) => tablet(page).locator('footer[aria-label="Near-side table controls"]');
const far = (page: Page) => tablet(page).locator('header[aria-label="Far-side table controls"]');
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

/** Observe the real exit animation; waiting for hidden alone misses replaced drawer content. */
async function closeHandWithoutQr(page: Page) {
  const observed = page.evaluate(
    () =>
      new Promise<{ frames: number; qrSeen: boolean; handMissing: boolean }>((resolve, reject) => {
        let frames = 0;
        let qrSeen = false;
        let handMissing = false;
        const timeout = setTimeout(() => {
          document.removeEventListener('click', clicked, true);
          reject(new Error('Hand controls did not finish closing.'));
        }, 10_000);
        function clicked(event: MouseEvent) {
          if (!(event.target instanceof Element) || !event.target.closest('[aria-label="Close"]')) {
            return;
          }
          document.removeEventListener('click', clicked, true);
          const observer = new MutationObserver(() => {
            qrSeen ||= Boolean(document.querySelector('[role="dialog"] [aria-label="Scan to join this table"]'));
          });
          observer.observe(document.body, { childList: true, subtree: true });
          function frame() {
            const dialog = document.querySelector('[role="dialog"]');
            if (!dialog || !dialog.getClientRects().length || getComputedStyle(dialog).visibility === 'hidden') {
              clearTimeout(timeout);
              observer.disconnect();
              resolve({ frames, qrSeen, handMissing });
              return;
            }
            frames += 1;
            qrSeen ||= Boolean(dialog.querySelector('[aria-label="Scan to join this table"]'));
            handMissing ||= !dialog.querySelector('[aria-label="Edit Atreides hand"]');
            requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }
        document.addEventListener('click', clicked, true);
      })
  );
  await closeDialog(page);
  const result = await observed;
  expect(result.frames).toBeGreaterThan(0);
  expect(result.qrSeen).toBe(false);
  expect(result.handMissing).toBe(false);
  return result;
}

async function setHandSwitch(page: Page, label: 'Full' | 'Always pass', checked: boolean) {
  const input = phone(page).getByRole('switch', { name: `Atreides ${label}`, exact: true });
  if ((await input.isChecked()) !== checked) {
    await input.press('Space');
  }
  await expect(input).toBeChecked({ checked });
}

async function tableMenu(page: Page, item: string | RegExp) {
  if (await setup(page).isVisible()) {
    await setup(page)
      .getByRole('button', { name: item, exact: typeof item === 'string' })
      .click();
    return;
  }
  await near(page).getByRole('button', { name: 'Table controls', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: typeof item === 'string' }).click();
}

async function tableCode(page: Page) {
  const configuring = await setup(page).isVisible();
  if (!configuring) {
    await tableMenu(page, /^Join code/);
  }
  const scope = configuring ? setup(page) : page.getByRole('dialog');
  const code = (await scope.getByLabel('Table code', { exact: true }).innerText()).trim();
  expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  if (!configuring) {
    await closeDialog(page);
  }
  return code;
}

async function remoteMenu(page: Page, item: string) {
  await phone(page).getByRole('button', { name: 'Remote settings', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function join(page: Page, origin: string, code: string, viaJoinLink = false, faction = 'Atreides') {
  await page.goto(`${origin}/tools/bidding${viaJoinLink ? `?join=${code}` : ''}`);
  if (!viaJoinLink) {
    await page.getByRole('textbox', { name: 'Table code', exact: true }).fill(code);
    await page.getByRole('button', { name: 'Join table', exact: true }).click();
  }
  await phone(page).getByRole('button', { name: faction, exact: true }).click();
  await expect(phone(page).locator('header')).toContainText(faction);
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
    reducedMotion: 'no-preference',
  });
  const page = central.page;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${runtime.origin}/tools/bidding`);
    await choose(page, 'Ruleset', fixture.rulesetName);
    await page.getByRole('button', { name: 'New table', exact: true }).click();
    await expect(setup(page)).toBeVisible();
    await expect(tablet(page)).toBeHidden();
    await expect(page.getByRole('status', { name: 'Table connection' })).toHaveText('Phone relay connected');
    for (const name of fixture.names.slice(2)) {
      await setup(page)
        .getByRole('button', { name: `Remove ${name}`, exact: true })
        .click();
    }
    await choose(page, 'Bid timer', 'Off');
    await expect(setup(page)).toContainText('Arrange the factions to match storm order around the board.');
    await expect(setup(page).getByRole('button', { name: 'Hand controls', exact: true })).toHaveCount(0);
    await expect(setup(page).getByRole('textbox', { name: 'Cards this phase', exact: true })).toHaveCount(0);
    await expect(setup(page).getByRole('img', { name: 'Scan to join this table', exact: true })).toBeVisible();
    await expect(setup(page).getByRole('switch', { name: 'Show hand limits', exact: true })).not.toBeChecked();
    await setup(page).getByRole('button', { name: 'Finish setup', exact: true }).click();
    await expect(setup(page)).toBeHidden();
    await fillNumber(near(page), 'Cards this phase', 1);
    await far(page).getByRole('button', { name: 'More: Cards this phase', exact: true }).click();
    await expect(near(page).getByRole('textbox', { name: 'Cards this phase', exact: true })).toHaveValue('2');
    await near(page).getByRole('button', { name: 'Fewer: Cards this phase', exact: true }).click();
    await expect(far(page).getByRole('textbox', { name: 'Cards this phase', exact: true })).toHaveValue('1');
    for (const width of [540, 500]) {
      await page.setViewportSize({ width, height: 900 });
      for (const bar of [near(page), far(page)]) {
        await expect(bar.getByRole('button', { name: 'Start new bid', exact: true })).toBeVisible();
        await expect
          .poll(() =>
            bar.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              return [...element.querySelectorAll('button, input')]
                .filter(
                  (control) => control.getClientRects().length && getComputedStyle(control).visibility !== 'hidden'
                )
                .flatMap((control) => {
                  const rect = control.getBoundingClientRect();
                  const inside =
                    rect.left >= Math.max(0, bounds.left) - 1 &&
                    rect.top >= Math.max(0, bounds.top) - 1 &&
                    rect.right <= Math.min(innerWidth, bounds.right) + 1 &&
                    rect.bottom <= Math.min(innerHeight, bounds.bottom) + 1;
                  return inside ? [] : [{ label: control.getAttribute('aria-label') ?? control.textContent, rect }];
                });
            })
          )
          .toEqual([]);
      }
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    await tableMenu(page, 'Hand controls');
    await page.getByRole('dialog').getByRole('button', { name: 'Edit Atreides hand', exact: true }).click();
    await fillNumber(page.getByRole('dialog'), 'Atreides hand count', 2);
    await fillNumber(page.getByRole('dialog'), 'Atreides hand limit', 5);
    const nearDismiss = await closeHandWithoutQr(page);
    await far(page).getByRole('button', { name: 'Table controls', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Hand controls', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Hand controls', exact: true })).toBeVisible();
    const farDismiss = await closeHandWithoutQr(page);
    await info.attach('hand-controls-dismissal.json', {
      body: JSON.stringify({ reducedMotion: 'no-preference', near: nearDismiss, far: farDismiss }),
      contentType: 'application/json',
    });
    const atreides = tablet(page).getByRole('button', { name: 'Atreides, 2 cards', exact: true });
    await expect(atreides.getByText('2', { exact: true })).toBeVisible();
    await expect(
      tablet(page)
        .locator('[data-seat-id]')
        .getByText(/^\/\s*\d+$/)
    ).toHaveCount(0);
    await expect(near(page).getByRole('button', { name: 'Toggle listening', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await tablet(page).getByRole('button', { name: 'Atreides, 2 cards', exact: true }).click();
    await near(page).getByRole('button', { name: 'Start new bid', exact: true }).click();
    await expect(tablet(page).getByRole('textbox', { name: 'Cards this phase', exact: true })).toHaveCount(0);
    await near(page).getByRole('button', { name: 'Bid', exact: true }).click();
    await fillNumber(page.getByRole('dialog'), 'Tablet bid amount', 3);
    await page.getByRole('dialog').getByRole('button', { name: 'Bid 3', exact: true }).click();
    await closeDialog(page);
    await expect(tablet(page).getByRole('img', { name: 'Atreides has 3 spice', exact: true })).toBeVisible();
    const limitsHidden = info.outputPath('tablet-hand-limits-hidden.png');
    await page.screenshot({ path: limitsHidden });
    await info.attach('tablet-hand-limits-hidden', { path: limitsHidden, contentType: 'image/png' });
    await near(page).getByRole('button', { name: 'Table controls', exact: true }).click();
    const showLimitsItem = page.getByRole('menuitemcheckbox', { name: 'Show hand limits', exact: true });
    await expect(showLimitsItem).toHaveAttribute('aria-checked', 'false');
    await showLimitsItem.click();
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(atreides.getByText('/ 5', { exact: true })).toBeVisible();
    await expect(
      tablet(page).getByRole('button', { name: 'Harkonnen, 1 cards', exact: true }).getByText('/ 4', { exact: true })
    ).toBeVisible();
    await expect(atreides.getByText('2', { exact: true })).toBeVisible();
    await expect(tablet(page).getByRole('img', { name: 'Atreides has 3 spice', exact: true })).toBeVisible();
    await expect(tablet(page).getByRole('img', { name: 'Bidder pointer: Harkonnen', exact: true })).toBeVisible();
    const limitsShown = info.outputPath('tablet-hand-limits-shown.png');
    await page.screenshot({ path: limitsShown });
    await info.attach('tablet-hand-limits-shown', { path: limitsShown, contentType: 'image/png' });
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
      await expect(setup(page)).toBeVisible();
      await expect(tablet(page)).toBeHidden();
      for (const name of fixture.names.slice(2)) {
        await setup(page)
          .getByRole('button', { name: `Remove ${name}`, exact: true })
          .click();
      }
      await choose(page, 'Bid timer', 'Off');
      const atreidesSeat = setup(page).getByRole('listitem').filter({ hasText: 'Atreides' });
      await expect(atreidesSeat.getByText('No phone', { exact: true })).toBeVisible();
      originalCode = await tableCode(page);
      await join(remote.page, runtime.origin, originalCode, true);
      await expect(remote.page).toHaveURL(`${runtime.origin}/tools/bidding`);
      await expect(remote.page.getByRole('status', { name: 'Table connection' })).toHaveText('Direct to the table');
      await expect(phone(remote.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeHidden();
      await expect(phone(remote.page).getByRole('textbox', { name: 'Atreides hand count', exact: true })).toHaveCount(
        0
      );
      await expect(phone(remote.page).getByRole('switch', { name: 'Atreides Full', exact: true })).toHaveCount(0);
      await expect(phone(remote.page).getByRole('switch', { name: 'Atreides Always pass', exact: true })).toHaveCount(
        0
      );
      await expect(phone(remote.page).getByRole('button', { name: 'Adjust hand limit', exact: true })).toHaveCount(0);
      await expect(phone(remote.page).getByText('The table is being set up.', { exact: true })).toBeVisible();
      await expect(atreidesSeat.getByText('Connected', { exact: true })).toBeVisible();
      await remote.page.goto('about:blank');
      await expect(atreidesSeat.getByText('No phone', { exact: true })).toBeVisible();
      await remote.page.goto(`${runtime.origin}/tools/bidding`);
      await expect(phone(remote.page).locator('header')).toContainText('Atreides');
      await expect(atreidesSeat.getByText('Connected', { exact: true })).toBeVisible();
      await expect(remote.page.getByRole('status', { name: 'Table connection' })).toHaveText('Direct to the table');
      await setup(page).getByRole('button', { name: 'Finish setup', exact: true }).click();
      await expect(setup(page)).toBeHidden();
      await expect(tablet(page)).toBeVisible();
      await fillNumber(near(page), 'Cards this phase', 2);
      await expect(phone(remote.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeVisible();
      await expect(phone(remote.page).getByRole('textbox', { name: 'Atreides hand count', exact: true })).toBeVisible();
    });

    await test.step('edit hands, override Full and let the phone choose and start the first auction', async () => {
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
      await phone(remote.page).getByRole('button', { name: 'Choose Harkonnen as first bidder', exact: true }).click();
      await expect(tablet(page).getByRole('img', { name: 'Bidder pointer: Harkonnen', exact: true })).toBeVisible();
      await phone(remote.page).getByRole('button', { name: 'Choose Atreides as first bidder', exact: true }).click();
      await phone(remote.page).getByRole('button', { name: 'Start new bid', exact: true }).click();
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

    await test.step('let the phone open the next phase, then restore a fresh timer and pass on expiry', async () => {
      await phone(secondRemote.page).getByRole('button', { name: 'Next phase', exact: true }).click();
      await expect(setup(remote.page)).toBeHidden();
      await expect(near(remote.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeVisible();
      await tableMenu(remote.page, 'Phase settings');
      await choose(remote.page, 'Bid timer', '5 seconds');
      await closeDialog(remote.page);
      await fillNumber(near(remote.page), 'Cards this phase', 1);
      await phone(secondRemote.page)
        .getByRole('button', { name: 'Choose Harkonnen as first bidder', exact: true })
        .click();
      await phone(secondRemote.page).getByRole('button', { name: 'Start new bid', exact: true }).click();
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
      await expect(setup(remote.page)).toBeVisible();
      await setup(remote.page).getByRole('button', { name: 'Finish setup', exact: true }).click();
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
      await expect(near(remote.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeVisible();
    });
    expect(errors).toEqual([]);
    await info.attach('bidding-flow.json', {
      body: JSON.stringify({
        centralAndRemote: true,
        remoteStartsFirstAuction: true,
        remoteStartsNextPhase: true,
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

test('a moderator controls every faction, transfers control and restores manual bidding', async ({
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
  const moderator = await newUserPage({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const player = await newUserPage({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = central.page;
  const errors: string[] = [];
  for (const participant of [page, moderator.page, player.page]) {
    participant.on('pageerror', (error) => errors.push(error.message));
  }
  const pointer = (target: Page, faction: string) =>
    tablet(target).getByRole('img', { name: `Bidder pointer: ${faction}`, exact: true });
  const high = (target: Page, faction: string, amount: number) =>
    tablet(target).getByRole('img', { name: `${faction} has ${amount} spice`, exact: true });
  try {
    await test.step('prepare an ordinary player and a full faction that always passes', async () => {
      await page.goto(`${runtime.origin}/tools/bidding`);
      await choose(page, 'Ruleset', fixture.rulesetName);
      await page.getByRole('button', { name: 'New table', exact: true }).click();
      for (const name of fixture.names.slice(3)) {
        await setup(page)
          .getByRole('button', { name: `Remove ${name}`, exact: true })
          .click();
      }
      await choose(page, 'Bid timer', '5 seconds');
      const code = await tableCode(page);
      await join(moderator.page, runtime.origin, code, true);
      await join(player.page, runtime.origin, code, true, 'Harkonnen');
      await setup(page).getByRole('button', { name: 'Finish setup', exact: true }).click();
      await fillNumber(near(page), 'Cards this phase', 2);
      await fillNumber(phone(moderator.page), 'Atreides hand count', 4);
      await expect(phone(moderator.page).getByRole('switch', { name: 'Atreides Full', exact: true })).toBeChecked();
      await setHandSwitch(moderator.page, 'Always pass', true);
      await remoteMenu(moderator.page, 'Moderator mode');
      await expect(phone(moderator.page).locator('header')).toContainText('Moderator');
      await expect(
        phone(moderator.page).getByRole('textbox', { name: 'Atreides hand count', exact: true })
      ).toHaveCount(0);
    });
    await test.step('move across all factions without awarding until confirmation', async () => {
      await phone(moderator.page).getByRole('button', { name: 'Choose Atreides as first bidder', exact: true }).click();
      await phone(moderator.page).getByRole('button', { name: 'Start new bid', exact: true }).click();
      await phone(moderator.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(high(page, 'Atreides', 1)).toBeVisible();
      await expect(pointer(page, 'Atreides')).toBeVisible();
      await phone(moderator.page).getByRole('button', { name: 'Pass', exact: true }).click();
      await expect(pointer(page, 'Harkonnen')).toBeVisible();
      await expect(phone(player.page).getByText('The moderator controls bidding.', { exact: true })).toBeVisible();
      await expect(phone(player.page).getByRole('button', { name: '+1', exact: true })).toBeHidden();
      await expect(phone(player.page).getByRole('button', { name: 'Pass', exact: true })).toBeHidden();
      await phone(moderator.page).getByRole('button', { name: 'Back', exact: true }).click();
      await expect(pointer(page, 'Atreides')).toBeVisible();
      await near(page).getByRole('button', { name: 'Pass', exact: true }).click();
      await expect(pointer(page, 'Harkonnen')).toBeVisible();
      await phone(moderator.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(high(page, 'Harkonnen', 2)).toBeVisible();
      await expect(pointer(page, 'Harkonnen')).toBeVisible();
      await phone(moderator.page).getByRole('button', { name: 'Pass', exact: true }).click();
      await expect(pointer(page, 'Emperor')).toBeVisible();
      await phone(moderator.page).getByRole('button', { name: 'Pass', exact: true }).click();
      await expect(pointer(page, 'Atreides')).toBeVisible();
      await expect(tablet(page).getByRole('button', { name: 'Harkonnen, 1 cards', exact: true })).toBeVisible();
      await phone(moderator.page).getByRole('button', { name: 'Confirm winner', exact: true }).click();
      await expect(tablet(page).getByRole('button', { name: 'Harkonnen, 2 cards', exact: true })).toBeVisible();
      await expect(phone(moderator.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeVisible();
    });
    await test.step('transfer exclusive controls and reset only the current auction', async () => {
      await remoteMenu(player.page, 'Take moderator control');
      await expect(phone(player.page).locator('header')).toContainText('Moderator');
      await expect(phone(moderator.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeHidden();
      await phone(player.page).getByRole('button', { name: 'Choose Emperor as first bidder', exact: true }).click();
      await phone(player.page).getByRole('button', { name: 'Start new bid', exact: true }).click();
      await phone(player.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(high(page, 'Emperor', 1)).toBeVisible();
      await expect(phone(moderator.page).getByRole('button', { name: '+1', exact: true })).toBeHidden();
      await phone(player.page).getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(phone(player.page).getByRole('button', { name: 'Start new bid', exact: true })).toBeVisible();
      await expect(high(page, 'Emperor', 1)).toBeHidden();
      await expect(tablet(page).getByRole('button', { name: 'Harkonnen, 2 cards', exact: true })).toBeVisible();
      await phone(player.page).getByRole('button', { name: 'Choose Atreides as first bidder', exact: true }).click();
      await phone(player.page).getByRole('button', { name: 'Start new bid', exact: true }).click();
      await phone(player.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(high(page, 'Atreides', 1)).toBeVisible();
    });
    await test.step('restore manual mode and promote without retaining the old moderator claim', async () => {
      await page.reload();
      await expect(near(page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      await near(page).getByRole('button', { name: 'Resume', exact: true }).click();
      await phone(player.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(high(page, 'Atreides', 2)).toBeVisible();
      await expect(pointer(page, 'Atreides')).toBeVisible();
      await remoteMenu(player.page, 'Recovery copy');
      await phone(player.page).getByRole('button', { name: 'Use this phone as central', exact: true }).click();
      await expect(near(player.page).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      const recoveredCode = await tableCode(player.page);
      await moderator.page.goto(`${runtime.origin}/tools/bidding?join=${recoveredCode}`);
      await phone(moderator.page).getByRole('button', { name: 'Moderator mode', exact: true }).click();
      await expect(phone(moderator.page).locator('header')).toContainText('Moderator');
      await near(player.page).getByRole('button', { name: 'Resume', exact: true }).click();
      await phone(moderator.page).getByRole('button', { name: '+1', exact: true }).click();
      await expect(high(player.page, 'Atreides', 3)).toBeVisible();
      await expect(pointer(player.page, 'Atreides')).toBeVisible();
      await phone(moderator.page).getByRole('button', { name: 'Confirm winner', exact: true }).click();
      await expect(near(player.page).getByRole('button', { name: 'Next phase', exact: true })).toBeVisible();
      await expect(tablet(player.page).getByRole('button', { name: 'Atreides, 5 cards', exact: true })).toBeVisible();
      await tableMenu(player.page, 'Completed wins');
      await expect(player.page.getByRole('dialog')).toContainText('Card 1 · Harkonnen · 2 spice');
      await expect(player.page.getByRole('dialog')).toContainText('Card 2 · Atreides · 3 spice');
      await closeDialog(player.page);
    });
    expect(errors).toEqual([]);
    const screenshot = info.outputPath('moderator-phase-complete.png');
    await player.page.screenshot({ path: screenshot });
    await info.attach('moderator-phase-complete', { path: screenshot, contentType: 'image/png' });
  } finally {
    try {
      await central.close();
      await moderator.close();
      await player.close();
    } finally {
      await runtime.close();
    }
  }
});

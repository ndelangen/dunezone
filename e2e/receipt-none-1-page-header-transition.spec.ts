import { test as base } from './coverage';

/* Receipt for #1071: CPU throttled 1x through the devtools protocol before every run. Not for merge. */
base.beforeEach(async ({ page }) => {
  if (1 > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
});

/*
 * The band's height is a CSS transition, so the browser reports when it ran and finished.
 * The wait is armed before the click, because the transition starts on navigation and lasts 0.2 s, and it is bounded so a band that no longer transitions fails here with a reason rather than hanging.
 * An earlier version counted distinct heights across animation frames, which a starved machine failed while the header animated correctly (#1052).
 */
const TRANSITION_WAIT_MS = 5000;

test('new, rate none, run 1: the persistent page hero contracts when navigating to a headerless route', async ({ page }) => {
  await page.goto('/privacy'); await page.addStyleTag({ content: 'header { transition: none !important; }' });
  const hero = page.getByRole('banner');
  await expect(hero).toBeVisible();

  const initialHeight = (await hero.boundingBox())?.height ?? 0;
  expect(initialHeight).toBeGreaterThan(0);

  const transitionOutcome = page.evaluate(
    (waitMs) =>
      new Promise<string>((resolve) => {
        const header = document.querySelector('header');
        if (!header) {
          resolve('no header element');
          return;
        }
        const timer = window.setTimeout(() => resolve(`no height transition ended within ${waitMs}ms`), waitMs);
        header.addEventListener('transitionend', (event) => {
          if (event.target === header && event.propertyName === 'height') {
            window.clearTimeout(timer);
            resolve('height transition ended');
          }
        });
      }),
    TRANSITION_WAIT_MS
  );

  const assetsLink = page.getByRole('link', { name: 'Assets', exact: true });
  const [outcome] = await Promise.all([transitionOutcome, assetsLink.click()]);
  expect(outcome).toBe('height transition ended');

  await expect(page).toHaveURL(/\/assets\/?$/);
  const finalHeight = (await hero.boundingBox())?.height ?? 0;
  expect(finalHeight).toBeLessThan(initialHeight / 2);
});

test('new, rate none, run 2: the persistent page hero contracts when navigating to a headerless route', async ({ page }) => {
  await page.goto('/privacy'); await page.addStyleTag({ content: 'header { transition: none !important; }' });
  const hero = page.getByRole('banner');
  await expect(hero).toBeVisible();

  const initialHeight = (await hero.boundingBox())?.height ?? 0;
  expect(initialHeight).toBeGreaterThan(0);

  const transitionOutcome = page.evaluate(
    (waitMs) =>
      new Promise<string>((resolve) => {
        const header = document.querySelector('header');
        if (!header) {
          resolve('no header element');
          return;
        }
        const timer = window.setTimeout(() => resolve(`no height transition ended within ${waitMs}ms`), waitMs);
        header.addEventListener('transitionend', (event) => {
          if (event.target === header && event.propertyName === 'height') {
            window.clearTimeout(timer);
            resolve('height transition ended');
          }
        });
      }),
    TRANSITION_WAIT_MS
  );

  const assetsLink = page.getByRole('link', { name: 'Assets', exact: true });
  const [outcome] = await Promise.all([transitionOutcome, assetsLink.click()]);
  expect(outcome).toBe('height transition ended');

  await expect(page).toHaveURL(/\/assets\/?$/);
  const finalHeight = (await hero.boundingBox())?.height ?? 0;
  expect(finalHeight).toBeLessThan(initialHeight / 2);
});

test('new, rate none, run 3: the persistent page hero contracts when navigating to a headerless route', async ({ page }) => {
  await page.goto('/privacy'); await page.addStyleTag({ content: 'header { transition: none !important; }' });
  const hero = page.getByRole('banner');
  await expect(hero).toBeVisible();

  const initialHeight = (await hero.boundingBox())?.height ?? 0;
  expect(initialHeight).toBeGreaterThan(0);

  const transitionOutcome = page.evaluate(
    (waitMs) =>
      new Promise<string>((resolve) => {
        const header = document.querySelector('header');
        if (!header) {
          resolve('no header element');
          return;
        }
        const timer = window.setTimeout(() => resolve(`no height transition ended within ${waitMs}ms`), waitMs);
        header.addEventListener('transitionend', (event) => {
          if (event.target === header && event.propertyName === 'height') {
            window.clearTimeout(timer);
            resolve('height transition ended');
          }
        });
      }),
    TRANSITION_WAIT_MS
  );

  const assetsLink = page.getByRole('link', { name: 'Assets', exact: true });
  const [outcome] = await Promise.all([transitionOutcome, assetsLink.click()]);
  expect(outcome).toBe('height transition ended');

  await expect(page).toHaveURL(/\/assets\/?$/);
  const finalHeight = (await hero.boundingBox())?.height ?? 0;
  expect(finalHeight).toBeLessThan(initialHeight / 2);
});

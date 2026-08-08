import { expect, test } from '@playwright/test';

test.use({ storageState: '.playwright/user-a-header.json' });

test('the persistent page hero contracts when navigating to a headerless route', async ({
  page,
}) => {
  await page.goto('/privacy');
  const hero = page.getByRole('banner');
  await expect(hero).toBeVisible();

  const initialBox = await hero.boundingBox();
  expect(initialBox).not.toBeNull();

  const heightSamplesPromise = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const samples: number[] = [];
        const startedAt = performance.now();

        const sample = () => {
          const pageHero = document.querySelector('header');
          if (pageHero) {
            samples.push(pageHero.getBoundingClientRect().height);
          }

          if (performance.now() - startedAt < 850) {
            requestAnimationFrame(sample);
          } else {
            resolve(samples);
          }
        };

        requestAnimationFrame(sample);
      })
  );

  const assetsLink = page.getByRole('link', { name: 'Assets', exact: true });
  const [heightSamples] = await Promise.all([heightSamplesPromise, assetsLink.click()]);

  await expect(page).toHaveURL(/\/assets\/?$/);
  const finalBox = await hero.boundingBox();
  expect(finalBox).not.toBeNull();

  const initialHeight = initialBox?.height ?? 0;
  const finalHeight = finalBox?.height ?? 0;
  const intermediateHeights = heightSamples.filter(
    (height) => height < initialHeight - 2 && height > finalHeight + 2
  );

  expect(finalHeight).toBeLessThan(initialHeight / 2);
  expect(new Set(intermediateHeights.map((height) => Math.round(height))).size).toBeGreaterThan(2);
});

import { expect, test } from './coverage';

test.use({ storageState: '.playwright/user-a-faq.json' });

test('FAQ happy path: ask, answer, accept, profile activity', async ({ page, browser }) => {
  test.setTimeout(90_000);

  const suffix = Date.now();
  const questionText = `What is the E2E spice cycle ${suffix}?`;
  const answerText = `The E2E spice must flow ${suffix}.`;

  await test.step('asker posts a question on the baseline ruleset', async () => {
    await page.goto('/rulesets/e2ebaselineruleset/faq/create');
    await page.getByPlaceholder('Your question...').fill(questionText);
    await page.getByRole('button', { name: 'Ask' }).click();
    await expect(page).toHaveURL(/\/rulesets\/e2ebaselineruleset\/faq\/\d+$/);
    await expect(page.getByText(questionText)).toBeVisible();
  });
  const questionUrl = page.url();

  const userBContext = await browser.newContext({ storageState: '.playwright/user-b-faq.json' });
  const userBPage = await userBContext.newPage();

  await test.step('another member answers', async () => {
    await userBPage.goto(questionUrl);
    await userBPage.getByPlaceholder('Your answer...').fill(answerText);
    await userBPage.getByRole('button', { name: 'Add answer' }).click();
    await expect(userBPage.getByText(answerText)).toBeVisible();
  });

  await test.step('asker accepts the answer through the live subscription', async () => {
    await expect(page.getByText(answerText)).toBeVisible();
    await page.getByRole('button', { name: 'Mark as accepted answer' }).click();
    await expect(page.getByText('Accepted answer')).toBeVisible();
  });

  await test.step('the answer and its acceptance appear on the answerer profile', async () => {
    const userASlug = (process.env.PLAYWRIGHT_USER_A_EMAIL ?? 'e2e-user-a@example.com').split(
      '@'
    )[0]!;
    const hrefs = await page
      .locator('main a[href^="/profiles/"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    const answererHref = hrefs.find((href) => href && !href.endsWith(`/${userASlug}`));
    expect(answererHref).toBeTruthy();
    await page.goto(answererHref!);
    await expect(page.getByText(questionText)).toBeVisible();
    const pickedFact = page.locator('p', { hasText: 'Picked answers' });
    await expect(pickedFact.locator('strong')).toHaveText('1');
  });

  await userBContext.close();
});

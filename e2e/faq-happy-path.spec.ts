import { userA } from './accounts';
import { expect, longSpecTimeoutMs, test } from './coverage';

test.use({ storageState: '.playwright/user-a-faq.json' });

test('FAQ happy path: ask, answer, accept, profile activity', async ({ page, newUserPage }) => {
  test.setTimeout(longSpecTimeoutMs);

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

  const answerer = await newUserPage({ storageState: '.playwright/user-b-faq.json' });
  const userBPage = answerer.page;

  /*
   * The answerer's count before this run's acceptance, so the profile check reads the change rather than an absolute
   * that only a fresh database satisfies; a local re-run against the same backend failed on "1 picked answer".
   */
  const pickedAnswers = /^(\d+) picked answers?$/;
  let pickedBefore = Number.NaN;
  let answererHref = '';
  await test.step('another member answers', async () => {
    await userBPage.goto(questionUrl);
    await userBPage.getByPlaceholder('Your answer...').fill(answerText);
    await userBPage.getByRole('button', { name: 'Add answer' }).click();
    await expect(userBPage.getByText(answerText)).toBeVisible();

    /* Waited for, not read once: the answer's text renders before its author link does. */
    const answererLink = userBPage.locator(`main a[href^="/profiles/"]:not([href$="/${userA.slug}"])`);
    await expect(answererLink).toBeVisible();
    answererHref = (await answererLink.getAttribute('href')) ?? '';
    await userBPage.goto(answererHref);
    const pickedStat = userBPage.getByText(pickedAnswers);
    await expect(pickedStat).toBeAttached();
    pickedBefore = Number(pickedAnswers.exec((await pickedStat.textContent()) ?? '')?.[1]);
    expect(pickedBefore).not.toBeNaN();
  });

  await test.step('asker accepts the answer through the live subscription', async () => {
    await expect(page.getByText(answerText)).toBeVisible();
    await page.getByRole('button', { name: 'Accept answer' }).click();
    /* Exact, so the wait reads the accepted status. */
    await expect(page.getByText('Accepted answer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept answer', exact: true })).toHaveCount(0);
  });

  await test.step('the asker unmarks through the menu before accepting again', async () => {
    await page.getByRole('button', { name: 'Actions for answer' }).click();
    await page.getByRole('menuitem', { name: 'Unmark accepted answer' }).click();
    await expect(page.getByText('Accepted answer', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Accept answer', exact: true }).click();
    await expect(page.getByText('Accepted answer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept answer', exact: true })).toHaveCount(0);
  });

  await test.step('the answer and its acceptance appear on the answerer profile', async () => {
    await page.goto(answererHref);
    await expect(page.getByText(questionText)).toBeVisible();
    /* The stat's phrase is what it promises a reader; its markup is the Stats component's own. */
    const pickedAfter = pickedBefore + 1;
    await expect(
      page.getByText(`${pickedAfter} ${pickedAfter === 1 ? 'picked answer' : 'picked answers'}`, { exact: true })
    ).toBeAttached();
  });

  await answerer.close();
});

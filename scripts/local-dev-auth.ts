import { chromium } from '@playwright/test';

export async function ensureLocalAuthUser(baseUrl: string, email: string, password: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.goto(`${baseUrl}/auth/login`, {
          waitUntil: 'domcontentloaded',
          timeout: 10_000,
        });
        const alreadySignedIn =
          !new URL(page.url()).pathname.endsWith('/auth/login') ||
          (await page.getByRole('heading', { name: /you're signed in/i }).isVisible());
        if (alreadySignedIn) {
          return;
        }
        await page.getByRole('textbox', { name: /email/i }).fill(email);
        await page.getByLabel(/password/i).fill(password);
        await page.getByTestId('local-auth-submit').click();
        await Promise.race([
          page.waitForURL((url: URL) => !url.pathname.endsWith('/auth/login'), { timeout: 10_000 }),
          page.getByRole('heading', { name: /you're signed in/i }).waitFor({ timeout: 10_000 }),
        ]);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          console.warn(`Local auth attempt ${attempt} did not finish; retrying.`);
        }
      }
    }
    throw lastError ?? new Error(`Local auth did not finish for ${email}`);
  } finally {
    await browser.close();
  }
}

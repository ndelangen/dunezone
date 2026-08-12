import { execSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

import type { FullConfig } from '@playwright/test';
import { chromium } from '@playwright/test';

type Credentials = {
  email: string;
  password: string;
  storageStatePath: string;
};

async function loginWithLocalAuth(baseUrl: string, credentials: Credentials) {
  const headless = process.env.PLAYWRIGHT_HEADLESS === 'true';
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const traceBase = `.playwright/global-setup-${credentials.email.replace(/[^a-z0-9]/gi, '_')}`;
  const tracePath = `${traceBase}.zip`;

  try {
    console.log(`[globalSetup] logging in ${credentials.email}`);
    let navigationError: unknown;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        await page.goto(`${baseUrl}/auth/login`, {
          waitUntil: 'domcontentloaded',
          timeout: 10_000,
        });
        navigationError = null;
        break;
      } catch (error) {
        navigationError = error;
        await page.waitForTimeout(1000);
      }
    }
    if (navigationError) {
      throw navigationError;
    }
    await page.getByRole('textbox', { name: /email/i }).fill(credentials.email);
    await page.getByLabel(/password/i).fill(credentials.password);
    await page.getByTestId('local-auth-submit').click();
    await Promise.race([
      page.waitForURL((url: URL) => !url.pathname.endsWith('/auth/login')),
      page.getByRole('heading', { name: /you're signed in/i }).waitFor(),
    ]);
    await context.storageState({ path: credentials.storageStatePath });
    console.log(`[globalSetup] saved storage state -> ${credentials.storageStatePath}`);
    await context.tracing.stop({ path: `${traceBase}-success.zip` });
  } catch (error) {
    await context.tracing.stop({ path: tracePath });
    console.error(`[globalSetup] login failed for ${credentials.email}. Trace: ${tracePath}`);
    throw error;
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig) {
  const configuredBaseUrl = config.projects[0]?.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL;
  if (!configuredBaseUrl) {
    throw new Error('PLAYWRIGHT_BASE_URL must be configured');
  }
  const baseUrl = configuredBaseUrl;

  const userAEmail = process.env.PLAYWRIGHT_USER_A_EMAIL;
  const userBEmail = process.env.PLAYWRIGHT_USER_B_EMAIL;
  const userPassword = process.env.PLAYWRIGHT_USER_PASSWORD;
  if (!userAEmail || !userBEmail || !userPassword) {
    throw new Error(
      'PLAYWRIGHT_USER_A_EMAIL, PLAYWRIGHT_USER_B_EMAIL and PLAYWRIGHT_USER_PASSWORD are required'
    );
  }

  await mkdir('.playwright', { recursive: true });
  /**
   * Each spec file gets its own session: Convex Auth rotates refresh tokens, so two parallel
   * workers sharing a storage state would invalidate each other's session mid-run. Logins are
   * independent, so they run concurrently.
   */
  const sessions: Credentials[] = [
    { email: userAEmail, password: userPassword, storageStatePath: '.playwright/user-a.json' },
    {
      email: userAEmail,
      password: userPassword,
      storageStatePath: '.playwright/user-a-header.json',
    },
    {
      email: userAEmail,
      password: userPassword,
      storageStatePath: '.playwright/user-a-ruleset.json',
    },
    { email: userAEmail, password: userPassword, storageStatePath: '.playwright/user-a-faq.json' },
    {
      email: userAEmail,
      password: userPassword,
      storageStatePath: '.playwright/user-a-group.json',
    },
    {
      email: userAEmail,
      password: userPassword,
      storageStatePath: '.playwright/user-a-asset-assign.json',
    },
    { email: userBEmail, password: userPassword, storageStatePath: '.playwright/user-b.json' },
    { email: userBEmail, password: userPassword, storageStatePath: '.playwright/user-b-faq.json' },
    {
      email: userBEmail,
      password: userPassword,
      storageStatePath: '.playwright/user-b-group.json',
    },
  ];
  /*
   * Logins for the SAME user run sequentially: concurrent sign-ins write the same Convex Auth
   * user doc, and the static build made logins fast enough to overlap in that mutation window
   * (one of three simultaneous user-B logins timed out in CI). Distinct users don't contend, so
   * their chains run in parallel. (The dev server's transform latency used to stagger this race
   * away; the old first-login-alone warmup went with it.)
   */
  const byUser = new Map<string, Credentials[]>();
  for (const session of sessions) {
    byUser.set(session.email, [...(byUser.get(session.email) ?? []), session]);
  }
  await Promise.all(
    [...byUser.values()].map(async (chain) => {
      for (const credentials of chain) {
        await loginWithLocalAuth(baseUrl, credentials);
      }
    })
  );

  execSync(`npx convex run e2e:seedBaseline '${JSON.stringify({ ownerEmail: userAEmail })}'`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      CONVEX_DEPLOYMENT: '',
      CONVEX_URL: '',
      CONVEX_CLOUD_URL: '',
      CONVEX_SELF_HOSTED_URL: process.env.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210',
      CONVEX_SELF_HOSTED_ADMIN_KEY: process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ?? '',
    },
  });
}

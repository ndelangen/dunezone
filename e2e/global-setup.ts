import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

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
    /*
     * Three shorter attempts instead of one 30s wait, re-filling each time (issue #585).
     * The suspected cause, unproven until a retained trace shows it: the login form is controlled, so a
     * fill that lands before hydration types into DOM the state never saw, and hydration then resets the
     * inputs to empty; the submit either errors on blank credentials or native-navigates back to the same
     * URL, and either way the page sits on /auth/login for the full timeout.
     * Re-filling after the reset makes the attempt whole; the retry also covers any other transient,
     * and a failure that survives all three now ships its trace instead of a shrug.
     */
    let loginError: unknown = new Error('login never attempted');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.getByRole('textbox', { name: /email/i }).fill(credentials.email);
        await page.getByLabel(/password/i).fill(credentials.password);
        await page.getByTestId('local-auth-submit').click();
        await Promise.race([
          page.waitForURL((url: URL) => !url.pathname.endsWith('/auth/login'), { timeout: 10_000 }),
          page.getByRole('heading', { name: /you're signed in/i }).waitFor({ timeout: 10_000 }),
        ]);
        loginError = null;
        break;
      } catch (error) {
        loginError = error;
        console.warn(
          `[globalSetup] login attempt ${attempt} for ${credentials.email} did not leave /auth/login; retrying`
        );
        /* A native submit may have reloaded the page with the credentials in the query; start clean. */
        try {
          await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
        } catch {
          /* A wedged server is context for the login failure, not a better error; keep the informative one for the trace's filing. */
          continue;
        }
        /*
         * A login that completed just as the attempt timed out shows either success signal on this
         * visit, the same two the race above accepts: bounced off the form, or the signed-in heading
         * on the login route. Either is success, not a retry.
         */
        const offLoginRoute = !new URL(page.url()).pathname.endsWith('/auth/login');
        if (offLoginRoute || (await page.getByRole('heading', { name: /you're signed in/i }).isVisible())) {
          loginError = null;
          break;
        }
      }
    }
    if (loginError) {
      throw loginError;
    }
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
    throw new Error('PLAYWRIGHT_USER_A_EMAIL, PLAYWRIGHT_USER_B_EMAIL and PLAYWRIGHT_USER_PASSWORD are required');
  }

  await mkdir('.playwright', { recursive: true });
  /**
   * Each spec file gets its own session: Convex Auth rotates refresh tokens, so two parallel workers sharing a storage state would invalidate each other's session mid-run.
   * Logins are independent, so they run concurrently.
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
    {
      email: userAEmail,
      password: userPassword,
      storageStatePath: '.playwright/user-a-avatar-menu.json',
    },
    {
      email: userAEmail,
      password: userPassword,
      storageStatePath: '.playwright/user-a-profile-edit.json',
    },
    { email: userBEmail, password: userPassword, storageStatePath: '.playwright/user-b.json' },
    { email: userBEmail, password: userPassword, storageStatePath: '.playwright/user-b-faq.json' },
    {
      email: userBEmail,
      password: userPassword,
      storageStatePath: '.playwright/user-b-group.json',
    },
    {
      email: process.env.PLAYWRIGHT_ACCOUNT_DELETE_EMAIL ?? 'e2e-account-delete@example.com',
      password: userPassword,
      storageStatePath: '.playwright/account-delete.json',
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

  const convexPackagePath = createRequire(import.meta.url).resolve('convex/package.json');
  const convexCliPath = resolve(dirname(convexPackagePath), 'bin/main.js');
  execFileSync(
    process.execPath,
    [
      convexCliPath,
      'run',
      'e2e:seedBaseline',
      JSON.stringify({
        ownerEmail: userAEmail,
        disposableAccountEmail: process.env.PLAYWRIGHT_ACCOUNT_DELETE_EMAIL ?? 'e2e-account-delete@example.com',
      }),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        CONVEX_DEPLOYMENT: '',
        CONVEX_URL: '',
        CONVEX_CLOUD_URL: '',
        CONVEX_SELF_HOSTED_URL: process.env.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210',
        CONVEX_SELF_HOSTED_ADMIN_KEY: process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ?? '',
      },
    }
  );
}

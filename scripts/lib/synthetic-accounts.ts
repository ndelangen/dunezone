/**
 * Synthetic Password accounts for the browser runners: the hosted browser flows (`verify-hosted-play-browser.mjs`) and the load runner's browsers (`play-load`).
 * Both provision every account a run needs before any browser starts, then sign each browser in through the login form, so no browser ever creates an account.
 * It sits in `scripts/lib` because the flow driver imports it directly and the load runner's bundle reaches it from `scripts/play-load`.
 */
import { randomBytes, scrypt } from 'node:crypto';

import type { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { Page, WebSocket } from 'playwright';

type SyntheticAccount = { email: string; password: string };

/**
 * The secret Convex Auth's Password provider stores for `password`: Lucia's Scrypt with N 16384, r 16 and p 1, a 64-byte key, and the hex salt used as text.
 * Password hashes inside a mutation, which the local backend stops at 1 s, so the runner hashes here instead.
 */
export function passwordSecret(password: string) {
  const salt = randomBytes(16).toString('hex');
  return new Promise<string>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 64, { N: 16_384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`)
    );
  });
}

/** Creates each account that does not exist yet through the synthetic backend's test control; `admin` carries the admin key. */
export async function provisionAccounts(admin: ConvexHttpClient, accounts: SyntheticAccount[]) {
  const hashed = await Promise.all(
    accounts.map(async ({ email, password }) => ({ email, secret: await passwordSecret(password) }))
  );
  await admin.mutation(anyApi.playTesting.provisionAccounts, { accounts: hashed });
}

/** The Password flow of an `auth:signIn` action the page sent, or null for any other frame. */
function signInFlow(payload: string | Buffer) {
  try {
    const message = JSON.parse(payload.toString());
    const flow =
      message.type === 'Action' && message.udfPath === 'auth:signIn' ? message.args?.[0]?.params?.flow : null;
    return typeof flow === 'string' ? flow : null;
  } catch {
    return null;
  }
}

/**
 * Signs a provisioned account in through the login form and waits for the signed-in page, calling the account `name` in errors.
 * A sign-in the backend refuses fails at once with the form's own message, not after a silent 30 s wait.
 * The form falls back to sign-up when sign-in fails, so a sign-in that reached sign-up fails too: it would be a second attempt, and the account already exists.
 * A signed-in page without the form's `signIn` frame fails as well, so the sign-up check cannot pass on frames it never saw.
 */
export async function signIn(page: Page, origin: string, account: SyntheticAccount, name: string) {
  const flows: string[] = [];
  const sockets: WebSocket[] = [];
  const onFrame = ({ payload }: { payload: string | Buffer }) => {
    const flow = signInFlow(payload);
    if (flow) {
      flows.push(flow);
    }
  };
  const onSocket = (socket: WebSocket) => {
    sockets.push(socket);
    socket.on('framesent', onFrame);
  };
  const redact = (text: string) =>
    text
      .replaceAll(account.email, '[synthetic email]')
      .replaceAll(account.password, '[synthetic password]')
      .slice(0, 300);
  page.on('websocket', onSocket);
  try {
    await page.goto(`${origin}/auth/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    const signedIn = page.getByRole('heading', { name: "You're signed in" });
    const submit = page.getByTestId('local-auth-submit');
    const alert = page.locator('form', { has: submit }).getByRole('alert');
    await submit.click();
    await signedIn.or(alert).first().waitFor();
    if (!(await signedIn.isVisible())) {
      throw new Error(`Sign-in for ${name} failed: ${redact((await alert.textContent()) ?? '')}`);
    }
  } finally {
    page.off('websocket', onSocket);
    for (const socket of sockets) {
      socket.off('framesent', onFrame);
    }
  }
  if (flows.includes('signUp')) {
    throw new Error(
      `Sign-in for ${name} reached the form's sign-up fallback (${flows.join(', ')}), so its sign-in failed.`
    );
  }
  if (!flows.includes('signIn')) {
    throw new Error(`Sign-in for ${name} reached the signed-in page, but the form's signIn frame was never seen.`);
  }
}

/**
 * Synthetic Password accounts for the browser runners: the hosted browser flows (`verify-hosted-play-browser.mjs`) and the load runner's browsers (`play-load`).
 * Both provision every account a run needs before any browser starts, then sign each browser in through the login form, so no browser ever creates an account.
 * It sits in `scripts/lib` because the flow driver imports it directly and the load runner's bundle reaches it from `scripts/play-load`.
 */
import { createHash, randomBytes, scrypt } from 'node:crypto';

import type { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { Page, WebSocket } from 'playwright';

type SyntheticAccount = { email: string; password: string };

/**
 * The secret Convex Auth's Password provider stores for `password` by default: Lucia's Scrypt with N 16384, r 16 and p 1, a 64-byte key, and the hex salt used as text.
 * Password hashes inside a mutation, which the backend stops at its function limit, so the runner hashes here instead.
 */
export function passwordSecret(password: string) {
  const salt = randomBytes(16).toString('hex');
  return new Promise<string>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 64, { N: 16_384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`)
    );
  });
}

/** The salted SHA-256 that the hosted-play launcher's backend checks instead of Scrypt, in the form `convex/lib/syntheticPasswords.ts` stores. */
export function passwordDigest(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `sha256:${salt}:${createHash('sha256').update(`${salt}:${password}`).digest('hex')}`;
}

/**
 * Accounts per provisioning mutation.
 * The load runner creates up to 38, and one mutation writing all of them could itself meet the backend's function limit on a loaded machine.
 * Six took at most about 0.4 s under 80 busy loops.
 */
const ACCOUNTS_PER_MUTATION = 6;

/**
 * Creates each account that does not exist yet through the synthetic backend's test control, with `admin` carrying the admin key.
 * Each password goes as Scrypt and as a salted SHA-256, and the control keeps the one the backend's Password checks.
 */
export async function provisionAccounts(admin: ConvexHttpClient, accounts: SyntheticAccount[]) {
  const hashed = await Promise.all(
    accounts.map(async ({ email, password }) => ({
      email,
      scrypt: await passwordSecret(password),
      sha256: passwordDigest(password),
    }))
  );
  for (let start = 0; start < hashed.length; start += ACCOUNTS_PER_MUTATION) {
    await admin.mutation(anyApi.playTesting.provisionAccounts, {
      accounts: hashed.slice(start, start + ACCOUNTS_PER_MUTATION),
    });
  }
}

/**
 * One `auth:signIn` action the page sent.
 * `error` stays undefined until the backend answers, then holds null for success or the backend's own error text.
 */
type SignInAttempt = { flow: string; error?: string | null };

type Frame = { payload: string | Buffer };

function parseFrame({ payload }: Frame) {
  try {
    return JSON.parse(payload.toString());
  } catch {
    return null;
  }
}

/** The request id and Password flow of an `auth:signIn` action frame, or null for any other frame. */
function signInRequest(frame: Frame) {
  const message = parseFrame(frame);
  const flow = message?.type === 'Action' && message.udfPath === 'auth:signIn' ? message.args?.[0]?.params?.flow : null;
  return typeof flow === 'string' ? { requestId: message.requestId, flow } : null;
}

/** The request id of an action response frame, with null for success or the backend's error text, or null for any other frame. */
function actionAnswer(frame: Frame) {
  const message = parseFrame(frame);
  if (message?.type !== 'ActionResponse') {
    return null;
  }
  return { requestId: message.requestId, error: message.success ? null : String(message.result) };
}

/** Records each `auth:signIn` action the page sends, and the backend's answer to it, until `stop` is called. */
function watchSignIn(page: Page) {
  const attempts: SignInAttempt[] = [];
  const detach: (() => void)[] = [];
  const onSocket = (socket: WebSocket) => {
    const sent = new Map<unknown, SignInAttempt>();
    const onSent = (frame: Frame) => {
      const request = signInRequest(frame);
      if (request) {
        const attempt = { flow: request.flow };
        attempts.push(attempt);
        sent.set(request.requestId, attempt);
      }
    };
    const onReceived = (frame: Frame) => {
      const answer = actionAnswer(frame);
      const attempt = answer && sent.get(answer.requestId);
      if (attempt) {
        attempt.error = answer.error;
      }
    };
    socket.on('framesent', onSent);
    socket.on('framereceived', onReceived);
    detach.push(() => {
      socket.off('framesent', onSent);
      socket.off('framereceived', onReceived);
    });
  };
  page.on('websocket', onSocket);
  return {
    attempts,
    stop() {
      page.off('websocket', onSocket);
      for (const remove of detach) {
        remove();
      }
    },
  };
}

/** Fills and submits the login form, then returns the form's alert text, or null once the signed-in page shows. */
async function submitLogin(page: Page, origin: string, account: SyntheticAccount) {
  await page.goto(`${origin}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  const signedIn = page.getByRole('heading', { name: "You're signed in" });
  const submit = page.getByTestId('local-auth-submit');
  const alert = page.locator('form', { has: submit }).getByRole('alert');
  await submit.click();
  await signedIn.or(alert).first().waitFor();
  return (await signedIn.isVisible()) ? null : ((await alert.textContent()) ?? '');
}

/** What went wrong with a sign-in, or null when the page signed in through its `signIn` flow alone. */
function signInFailure(attempts: SignInAttempt[], alert: string | null) {
  switch (true) {
    case alert !== null:
      return `failed: ${alert}`;
    case attempts.some(({ flow }) => flow === 'signUp'):
      return "reached the form's sign-up fallback, so its sign-in failed";
    case !attempts.some(({ flow }) => flow === 'signIn'):
      return "reached the signed-in page, but the form's signIn frame was never seen";
    default:
      return null;
  }
}

function describeAttempt({ flow, error }: SignInAttempt, redact: (text: string) => string) {
  switch (error) {
    case undefined:
      return `${flow} got no answer`;
    case null:
      return `${flow} succeeded`;
    default:
      return `${flow} failed: ${redact(error)}`;
  }
}

/**
 * Signs a provisioned account in through the login form and waits for the signed-in page, calling the account `name` in errors.
 * A sign-in the backend refuses fails at once with the form's own message, not after a silent 30 s wait.
 * The form falls back to sign-up when sign-in fails, so a sign-in that reached sign-up fails too: it would be a second attempt, and the account already exists.
 * A signed-in page without the form's `signIn` frame fails as well, so the sign-up check cannot pass on frames it never saw.
 * Every failure lists each Password flow the form sent with the backend's answer, so a sign-in that timed out is named even when the fallback's error is what the form shows.
 */
export async function signIn(page: Page, origin: string, account: SyntheticAccount, name: string) {
  const redact = (text: string) =>
    text
      .replaceAll(account.email, '[synthetic email]')
      .replaceAll(account.password, '[synthetic password]')
      .replaceAll(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  const watch = watchSignIn(page);
  let alert: string | null;
  try {
    alert = await submitLogin(page, origin, account);
  } finally {
    watch.stop();
  }
  const failure = signInFailure(watch.attempts, alert === null ? null : redact(alert));
  if (failure) {
    const flows = watch.attempts.map((attempt) => describeAttempt(attempt, redact)).join('; ');
    throw new Error(`Sign-in for ${name} ${failure}. Password flows: ${flows || 'none seen'}.`);
  }
}

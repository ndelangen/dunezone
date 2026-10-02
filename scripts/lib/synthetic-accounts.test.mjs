import { createServer } from 'node:http';

import { chromium } from 'playwright';
import { expect, onTestFinished, test } from 'vitest';
import { WebSocketServer } from 'ws';

import { provisionAccounts, signIn } from './synthetic-accounts.ts';

/* The backend's error text for a Password call that ran past a 1 s function limit inside `at`. */
const timedOut = (at) =>
  `[Request ID: 0f1e2d3c4b5a6978] Server Error\nUncaught Error: Function execution timed out (maximum duration: 1s)\n    at async ${at} (../../node_modules/@convex-dev/auth/src/server/implementation/index.ts:558:0)`;

/*
 * What the stand-in backend answers to each Password flow, per outcome; a flow without an entry succeeds.
 * `fallback`: the sign-in times out, and the sign-up the form falls back to succeeds.
 * `refused`: the sign-in times out, and the sign-up is refused, so the form shows sign-up's error.
 * `silent`: the page signs in without sending a frame.
 */
const answers = {
  'signed-in': {},
  fallback: { signIn: () => timedOut('retrieveAccount') },
  refused: { signIn: () => timedOut('retrieveAccount'), signUp: (email) => `Account ${email} already exists` },
  silent: {},
};
let outcome = 'signed-in';

/* A login page that behaves like the real form: an `auth:signIn` action per Password flow, sign-up after a failed sign-in, and sign-up's error in an alert. */
const loginPage = (silent) => `<!doctype html>
<form><div role="status"></div>
  <input aria-label="Email"><input aria-label="Password" type="password">
  <button type="submit" data-testid="local-auth-submit">Continue</button></form>
<script>
  const socket = new WebSocket(location.origin.replace('http', 'ws'));
  const opened = new Promise((resolve) => socket.addEventListener('open', resolve));
  const waiting = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    waiting.get(message.requestId)?.(message);
  });
  let requestId = 0;
  const call = (flow, email, password) =>
    new Promise((resolve) => {
      waiting.set(requestId, resolve);
      socket.send(JSON.stringify({ type: 'Action', requestId: requestId++, udfPath: 'auth:signIn', args: [{ provider: 'password', params: { flow, email, password } }] }));
    });
  const form = document.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await opened;
    const [email, password] = [...form.querySelectorAll('input')].map((input) => input.value);
    let answer = { success: true };
    if (!${silent}) {
      answer = await call('signIn', email, password);
      answer = answer.success ? answer : await call('signUp', email, password);
    }
    if (!answer.success) {
      form.querySelector('[role="status"]').outerHTML = '<p role="alert">' + answer.result + '</p>';
      return;
    }
    document.body.innerHTML = "<h2>You're signed in</h2>";
  });
</script>`;

/* Chromium can take 30 s to exit on a loaded Mac (scripts/play-load/browsers.test.mjs), so the teardown has its own budget. */
const teardownBudget = 65_000;

test('a sign-in passes only when the page sent its signIn frame and signed in without falling back to sign-up, and a failure names each flow with its answer', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(loginPage(outcome === 'silent'));
  });
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket) => {
    socket.on('message', (data) => {
      const { requestId, args } = JSON.parse(data.toString());
      const { flow, email } = args[0].params;
      const error = answers[outcome][flow]?.(email);
      socket.send(
        JSON.stringify(
          error === undefined
            ? { type: 'ActionResponse', requestId, success: true, result: null, logLines: [] }
            : { type: 'ActionResponse', requestId, success: false, result: error, logLines: [] }
        )
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const launched = chromium.launch({ headless: true });
  onTestFinished(async () => {
    await (await launched.catch(() => undefined))?.close();
    await new Promise((resolve) => sockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }, teardownBudget);
  const page = await (await launched).newPage();
  const account = { email: 'player-a-0f@example.invalid', password: 'synthetic-password' };
  const signInTimedOut =
    'signIn failed: [Request ID: 0f1e2d3c4b5a6978] Server Error Uncaught Error: Function execution timed out (maximum duration: 1s) at async retrieveAccount';

  await signIn(page, origin, account, 'player-a');

  outcome = 'fallback';
  const fallback = signIn(page, origin, account, 'player-a');
  await expect(fallback).rejects.toThrow(
    `Sign-in for player-a reached the form's sign-up fallback, so its sign-in failed. Password flows: ${signInTimedOut}`
  );
  await expect(fallback).rejects.toThrow('; signUp succeeded.');

  outcome = 'refused';
  const refused = signIn(page, origin, account, 'player-a');
  await expect(refused).rejects.toThrow(
    `Sign-in for player-a failed: Account [synthetic email] already exists. Password flows: ${signInTimedOut}`
  );
  await expect(refused).rejects.toThrow('; signUp failed: Account [synthetic email] already exists.');

  outcome = 'silent';
  await expect(signIn(page, origin, account, 'player-a')).rejects.toThrow(
    "Sign-in for player-a reached the signed-in page, but the form's signIn frame was never seen. Password flows: none seen."
  );
}, 30_000);

test('provisioning sends every account with both hashes, at most six to a mutation', async () => {
  const sent = [];
  const admin = {
    async mutation(_reference, { accounts }) {
      sent.push(accounts);
    },
  };
  const accounts = Array.from({ length: 13 }, (_, index) => ({
    email: `load-${index}-0f@example.invalid`,
    password: `synthetic-password-${index}`,
  }));

  await provisionAccounts(admin, accounts);

  expect(sent.every((batch) => batch.length <= 6)).toBe(true);
  expect(sent.flat().map(({ email }) => email)).toEqual(accounts.map(({ email }) => email));
  for (const { scrypt, sha256 } of sent.flat()) {
    expect(scrypt).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(sha256).toMatch(/^sha256:[a-f0-9]{32}:[a-f0-9]{64}$/);
  }
});

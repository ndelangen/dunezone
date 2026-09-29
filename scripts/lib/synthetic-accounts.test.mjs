import { createServer } from 'node:http';

import { chromium } from 'playwright';
import { expect, onTestFinished, test } from 'vitest';
import { WebSocketServer } from 'ws';

import { signIn } from './synthetic-accounts.ts';

/*
 * A login page that sends the frames the real form's Convex client sends: an `auth:signIn` action per Password flow.
 * `outcome` decides what the page does after its sign-in: sign in, fall back to sign-up as the real form does after a failed sign-in, or show the form's alert.
 */
let outcome = 'signed-in';
const loginPage = (fallback, refused) => `<!doctype html>
<form><div role="status"></div>
  <input aria-label="Email"><input aria-label="Password" type="password">
  <button type="submit" data-testid="local-auth-submit">Continue</button></form>
<script>
  const socket = new WebSocket(location.origin.replace('http', 'ws'));
  const opened = new Promise((resolve) => socket.addEventListener('open', resolve));
  const form = document.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await opened;
    const [email, password] = [...form.querySelectorAll('input')].map((input) => input.value);
    const send = (flow) => socket.send(JSON.stringify({ type: 'Action', requestId: 0, udfPath: 'auth:signIn', args: [{ provider: 'password', params: { flow, email, password } }] }));
    send('signIn');
    ${fallback ? "send('signUp');" : ''}
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (${refused}) {
      form.querySelector('[role="status"]').outerHTML = '<p role="alert">Account ' + email + ' already exists</p>';
      return;
    }
    document.body.innerHTML = "<h2>You're signed in</h2>";
  });
</script>`;

/* Chromium can take 30 s to exit on a loaded Mac (scripts/play-load/browsers.test.mjs), so the teardown has its own budget. */
const teardownBudget = 65_000;

test('a sign-in passes only when the page signed in without the form falling back to sign-up', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(loginPage(outcome === 'fallback', outcome === 'refused'));
  });
  const sockets = new WebSocketServer({ server });
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

  await signIn(page, origin, account, 'player-a');

  outcome = 'fallback';
  await expect(signIn(page, origin, account, 'player-a')).rejects.toThrow(
    "Sign-in for player-a reached the form's sign-up fallback (signIn, signUp), so its sign-in failed."
  );

  outcome = 'refused';
  await expect(signIn(page, origin, account, 'player-a')).rejects.toThrow(
    'Sign-in for player-a failed: Account [synthetic email] already exists'
  );
}, 30_000);

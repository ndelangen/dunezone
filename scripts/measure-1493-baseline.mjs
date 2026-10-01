/*
 * Throwaway diagnostic for #1493, never merged.
 * Runs on the launcher's stack after the Worker is up and before any verifier or browser starts.
 * Times Lucia Scrypt verify in Node, provisions one synthetic account through the test control
 * and signs it in over HTTP with flow signIn, five times, so the backend's function log has idle auth:store times.
 */
import { randomBytes, scrypt } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const [backendUrl, output] = process.argv.slice(2);
const adminKey = process.env.MEASURE_ADMIN_KEY;
const root = path.resolve(import.meta.dirname, '..');
const store = path.join(root, 'node_modules/.bun');
const lucia = readdirSync(store).find((name) => name.startsWith('lucia@'));
const { Scrypt } = await import(pathToFileURL(path.join(store, lucia, 'node_modules/lucia/dist/crypto.js')).href);

function passwordSecret(password) {
  const salt = randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 64, { N: 16_384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`)
    );
  });
}

const result = { startedAt: Date.now(), luciaVerifyMs: [], nodeScryptMs: [], signIns: [] };
const account = {
  email: `measure-${randomBytes(6).toString('hex')}@example.invalid`,
  password: randomBytes(24).toString('hex'),
};
const secret = await passwordSecret(account.password);
for (let index = 0; index < 5; index += 1) {
  let started = performance.now();
  const ok = await new Scrypt().verify(secret, account.password);
  result.luciaVerifyMs.push({ ms: Math.round(performance.now() - started), ok });
  started = performance.now();
  await passwordSecret(account.password);
  result.nodeScryptMs.push(Math.round(performance.now() - started));
}
const admin = new ConvexHttpClient(backendUrl, { logger: false });
admin.setAdminAuth(adminKey);
await admin.mutation(anyApi.playTesting.provisionAccounts, { accounts: [{ email: account.email, secret }] });
result.provisionedAt = Date.now();
for (let index = 0; index < 5; index += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const client = new ConvexHttpClient(backendUrl, { logger: false });
  const at = Date.now();
  const started = performance.now();
  try {
    const answer = await client.action(anyApi.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', ...account },
    });
    result.signIns.push({ at, ms: Math.round(performance.now() - started), ok: Boolean(answer.tokens?.token) });
  } catch (error) {
    result.signIns.push({ at, ms: Math.round(performance.now() - started), ok: false, error: String(error.message).slice(0, 300) });
  }
}
result.finishedAt = Date.now();
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(`measure-1493 baseline ${JSON.stringify(result)}`);

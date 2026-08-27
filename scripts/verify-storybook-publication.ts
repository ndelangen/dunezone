import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { chromium, errors } from 'playwright';
import type { Browser, Page } from 'playwright';

import { RETRYABLE_BROWSER_CHECK_STATUS, runBrowserCheck } from './storybook-publication-browser';

const repositoryRoot = path.resolve(import.meta.dir, '..');
const artifactDirectory = path.join(repositoryRoot, 'storybook-static');
const wranglerConfig = path.join(repositoryRoot, 'workers/storybook/wrangler.jsonc');
const port = 6842;
const origin = `http://127.0.0.1:${port}`;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 5000;
const PAGE_CLEAR_TIMEOUT_MS = 5000;
const NETWORK_PROBE_TIMEOUT_MS = 5000;
const BROWSER_CHECK_TIMEOUT_MS = 180_000;
const BROWSER_CHECK_CHILD = 'STORYBOOK_PUBLICATION_BROWSER_CHECK_CHILD';

function progress(message: string) {
  console.log(`[storybook-publication] ${message}`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(command: string[], environment: Record<string, string>) {
  const child = Bun.spawn(command, {
    cwd: repositoryRoot,
    env: environment,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (status !== 0) {
    process.stderr.write(stderr);
    process.stdout.write(stdout);
  }
  invariant(status === 0, `${command.join(' ')} exited with status ${status}.`);
}

function buildEnvironment() {
  return {
    CI: 'true',
    NODE_ENV: 'production',
    PATH: process.env.PATH ?? '',
    VITE_CONVEX_URL: 'https://storybook.invalid',
  };
}

function artifactFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? artifactFiles(absolute) : [absolute];
    })
    .sort();
}

function assertNoForbiddenText(files: string[]) {
  const forbiddenText = ['.convex.cloud', '.convex.site', 'CLOUDFLARE_API_TOKEN', 'CONVEX_DEPLOY_KEY'];
  for (const file of files) {
    const bytes = readFileSync(file);
    for (const forbidden of forbiddenText) {
      invariant(
        !bytes.includes(Buffer.from(forbidden)),
        `The Storybook artifact contains forbidden publication text ${forbidden} in ${path.relative(
          artifactDirectory,
          file
        )}.`
      );
    }
    const text = bytes.toString('utf8');
    invariant(
      !/-----BEGIN PRIVATE KEY-----[A-Za-z0-9+/=\s]{64,}-----END PRIVATE KEY-----/.test(text),
      `The Storybook artifact contains a private key block in ${path.relative(artifactDirectory, file)}.`
    );
  }
}

function assertNoSensitiveEnvironmentValues(files: string[]) {
  for (const [name, value] of Object.entries(process.env)) {
    const isSensitiveValue = value && value.length >= 12 && /(?:SECRET|TOKEN|PASSWORD|DEPLOY_KEY|API_KEY)$/i.test(name);
    if (!isSensitiveValue) {
      continue;
    }
    invariant(
      !files.some((file) => readFileSync(file).includes(Buffer.from(value))),
      `The Storybook artifact contains the value of ${name}.`
    );
  }
}

function inspectArtifact() {
  const files = artifactFiles(artifactDirectory);
  invariant(files.length > 0, 'The Storybook publication artifact is empty.');
  assertNoForbiddenText(files);
  assertNoSensitiveEnvironmentValues(files);
  const worker = files.find((file) => /^convexStorybook\.worker-[\w-]+\.js$/.test(path.basename(file)));
  invariant(worker, 'The Storybook artifact has no browser-local Convex worker.');
  invariant(statSync(worker).size > 0, 'The browser-local Convex worker is empty.');
  return `/${path.relative(artifactDirectory, worker).split(path.sep).join('/')}`;
}

async function waitForServer(process: ReturnType<typeof Bun.spawn>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    invariant(process.exitCode === null, `Wrangler stopped before ${origin} became ready.`);
    try {
      const response = await fetch(origin);
      if (response.ok) {
        return;
      }
    } catch {
      /* The local socket is not ready yet. */
    }
    await Bun.sleep(100);
  }
  throw new Error(`Wrangler did not start ${origin}.`);
}

async function stopProcess(process: ReturnType<typeof Bun.spawn>) {
  process.kill();
  const exited = await Promise.race([
    process.exited.then(() => true),
    Bun.sleep(PROCESS_SHUTDOWN_TIMEOUT_MS).then(() => false),
  ]);
  if (exited) {
    return;
  }

  process.kill('SIGKILL');
  const killed = await Promise.race([
    process.exited.then(() => true),
    Bun.sleep(PROCESS_SHUTDOWN_TIMEOUT_MS).then(() => false),
  ]);
  invariant(killed, 'Wrangler did not stop after SIGKILL.');
}

function assertDocumentCsp(value: string | null) {
  invariant(value, 'The Storybook document has no CSP.');
  invariant(value.includes("default-src 'self'"), 'The Storybook document CSP has no same-origin default.');
  invariant(value.includes("connect-src 'self'"), 'The Storybook document CSP permits external connections.');
  invariant(value.includes("worker-src 'self'"), 'The Storybook document CSP cannot start its same-origin worker.');
  invariant(value.includes("object-src 'none'"), 'The Storybook document CSP permits objects.');
}

function assertWorkerCsp(value: string | null) {
  invariant(value, 'The browser-local Convex worker has no CSP.');
  invariant(value.includes("default-src 'none'"), 'The Convex worker CSP has no deny-by-default policy.');
  invariant(value.includes("script-src 'self'"), 'The Convex worker CSP cannot load its same-origin chunks.');
  invariant(value.includes("connect-src 'none'"), 'The Convex worker CSP permits connections.');
  invariant(value.includes("worker-src 'none'"), 'The Convex worker CSP permits subworkers.');
}

async function verifyHeaders(workerPath: string) {
  for (const documentPath of ['/', '/iframe.html']) {
    const response = await fetch(`${origin}${documentPath}`);
    invariant(response.status === 200, `${documentPath} returned HTTP ${response.status}.`);
    assertDocumentCsp(response.headers.get('Content-Security-Policy'));
    invariant(response.headers.get('X-Content-Type-Options') === 'nosniff', `${documentPath} can sniff content.`);
  }
  const worker = await fetch(`${origin}${workerPath}`);
  invariant(worker.status === 200, `${workerPath} returned HTTP ${worker.status}.`);
  assertWorkerCsp(worker.headers.get('Content-Security-Policy'));
}

async function verifyBrowser(browser: Browser, workerPath: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' && url.origin !== origin) {
      externalRequests.push(request.url());
    }
    if (url.protocol === 'https:') {
      externalRequests.push(request.url());
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(`${origin}/iframe.html?id=pages-rulesets-create--authenticated&viewMode=story`, {
    waitUntil: 'networkidle',
  });
  await page.getByRole('heading', { name: 'Create ruleset' }).waitFor({ timeout: 45_000 });
  await page.waitForTimeout(1000);
  invariant(externalRequests.length === 0, `Storybook requested an external URL: ${externalRequests.join(', ')}`);
  invariant(consoleErrors.length === 0, `Storybook logged browser errors: ${consoleErrors.join('\n')}`);

  const networkResult = await page.evaluate(async (timeoutMs) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch('https://example.com', { signal: controller.signal });
      return 'connected';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      window.clearTimeout(timeout);
    }
  }, NETWORK_PROBE_TIMEOUT_MS);
  invariant(networkResult !== 'connected', 'The Storybook document connected to an external origin.');

  const subworkerResult = await page.evaluate(async (url) => {
    return await new Promise<string>((resolve, reject) => {
      const worker = new Worker(url, { type: 'module' });
      const timeout = window.setTimeout(() => reject(new Error('The subworker probe timed out.')), 15_000);
      worker.addEventListener('message', (event: MessageEvent<{ id: number; result?: unknown }>) => {
        if (event.data.id !== 1) {
          return;
        }
        window.clearTimeout(timeout);
        worker.terminate();
        resolve(String(event.data.result));
      });
      worker.addEventListener('error', (event) => reject(new Error(event.message)));
      worker.postMessage({ id: 1, operation: 'subworkerProbe' });
    });
  }, `${origin}${workerPath}`);
  invariant(
    subworkerResult !== 'The Convex Storybook worker started a subworker.',
    'The Convex Storybook worker started a subworker despite its CSP.'
  );
  await context.close();
}

function startNonRootServer() {
  const prefix = '/catalogue/';
  return Bun.serve({
    hostname: '127.0.0.1',
    port: 6843,
    fetch(request) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(prefix)) {
        return new Response('Not found', { status: 404 });
      }
      const requested = url.pathname.slice(prefix.length) || 'index.html';
      const normalized = path.posix.normalize(requested);
      if (normalized.startsWith('../')) {
        return new Response('Not found', { status: 404 });
      }
      const file = Bun.file(path.join(artifactDirectory, normalized));
      return file.exists().then((exists) => (exists ? new Response(file) : new Response('Not found', { status: 404 })));
    },
  });
}

async function verifyNonRootPath(browser: Browser) {
  const nonRootOrigin = 'http://127.0.0.1:6843';
  const prefix = '/catalogue/';
  const context = await browser.newContext();
  const page: Page = await context.newPage();
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== nonRootOrigin) {
      externalRequests.push(request.url());
    }
  });
  await page.goto(`${nonRootOrigin}${prefix}iframe.html?id=pages-rulesets-create--authenticated&viewMode=story`, {
    waitUntil: 'networkidle',
  });
  await page.getByRole('heading', { name: 'Create ruleset' }).waitFor({ timeout: 45_000 });
  invariant(
    externalRequests.length === 0,
    `Non-root Storybook requested an external URL: ${externalRequests.join(', ')}`
  );
  progress('The non-root story rendered.');
  progress('Clearing the non-root story before context shutdown.');
  await page.goto('about:blank', { waitUntil: 'commit', timeout: PAGE_CLEAR_TIMEOUT_MS });
  progress('Closing the non-root browser context.');
  await context.close();
}

async function runBrowserChecks() {
  const browser = await chromium.launch({ headless: true });
  try {
    const workerPath = inspectArtifact();
    progress('Checking the published story in Chromium.');
    await verifyBrowser(browser, workerPath);
    progress('Checking publication from a non-root path.');
    await verifyNonRootPath(browser);
  } catch (error) {
    /* The parent owns the servers and kills this disposable child when Chromium stops answering. */
    console.error(error);
    process.exit(error instanceof errors.TimeoutError ? RETRYABLE_BROWSER_CHECK_STATUS : 1);
  }
  await browser.close();
}

async function verifyPublication() {
  progress('Building the static Storybook.');
  await run([process.execPath, 'run', 'build-storybook'], buildEnvironment());
  const workerPath = inspectArtifact();
  progress('Checking the publication worker bundle.');
  await run([process.execPath, 'x', 'wrangler', 'deploy', '--dry-run', '--config', wranglerConfig], buildEnvironment());

  const nonRootServer = startNonRootServer();
  const wrangler = Bun.spawn(
    [
      process.execPath,
      'x',
      'wrangler',
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--config',
      wranglerConfig,
    ],
    {
      cwd: repositoryRoot,
      env: buildEnvironment(),
      stderr: 'inherit',
      stdout: 'inherit',
    }
  );
  try {
    progress('Waiting for the publication worker.');
    await waitForServer(wrangler);
    progress('Checking publication headers.');
    await verifyHeaders(workerPath);
    await runBrowserCheck({
      spawn: () =>
        Bun.spawn([process.execPath, path.join(repositoryRoot, 'scripts/verify-storybook-publication.ts')], {
          cwd: repositoryRoot,
          env: { ...buildEnvironment(), [BROWSER_CHECK_CHILD]: 'true' },
          stderr: 'inherit',
          stdout: 'inherit',
        }),
      timeoutMs: BROWSER_CHECK_TIMEOUT_MS,
      shutdownTimeoutMs: PROCESS_SHUTDOWN_TIMEOUT_MS,
      onRetry: (reason) => progress(`Retrying the browser publication check because ${reason}.`),
    });
  } finally {
    progress('Stopping the non-root static server.');
    nonRootServer.stop(true);
    progress('Stopping the publication worker.');
    await stopProcess(wrangler);
  }

  console.log(JSON.stringify({ ok: true, workerPath, origin }));
}

if (process.env[BROWSER_CHECK_CHILD] === 'true') {
  await runBrowserChecks();
} else {
  await verifyPublication();
}

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';
import { build } from 'vite-plus';
import { expect, test } from 'vite-plus/test';

import { convexWorkerBuildPlugins } from '../.storybook/worker-async-transform';
import { applicationContentSecurityPolicy } from '../workers/publisher/application-security';
import { handleBundleAssetRequest } from '../workers/publisher/bundle-assets';

type VoiceCheck = {
  states: { status: string; message: string | null; at: number }[];
  starts: number[];
  commands: {
    command: { type: string; amount?: number };
    accepted: boolean;
    high: { id: string; amount: number } | null;
    at: number;
  }[];
  tracks: MediaStreamTrack[];
  start(): void;
  stop(): void;
  deny: boolean;
};
declare global {
  interface Window {
    voiceCheck: VoiceCheck;
  }
}

/* The 16 kHz mono fixture says "bid five", synthesized with macOS's Samantha voice.
 * It exercises microphone capture, WASM and auction validation, not room accuracy. */
test('a spoken bid reaches the auction under release CSP, then the listener restarts offline', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const temporary = await mkdtemp(path.join(tmpdir(), 'bidding-voice-browser-'));
  const entry = path.join(temporary, 'entry.ts');
  await writeFile(
    entry,
    `import { createBiddingVoice } from ${JSON.stringify(path.join(root, 'src/app/routes/_tool/tools/bidding/voice.ts'))};
    import { createAuction } from ${JSON.stringify(path.join(root, 'src/app/routes/_tool/tools/bidding/auction.ts'))};
    import { BiddingSession } from ${JSON.stringify(path.join(root, 'src/app/routes/_tool/tools/bidding/session.ts'))};
    const table = new BiddingSession({
      identity: { tableId: 'voice-test', code: 'VOICE1', centralInstanceId: 'central-1', generation: 1 },
      auction: createAuction({ ruleset: { id: 'test', name: 'Test' }, seconds: 0,
        seats: ['fremen', 'atreides'].map(id => ({ id, name: id, hand: 0, limit: 4, full: false, pass: false })) }),
    });
    table.dispatch({ type: 'start' });
    const check = window.voiceCheck = { states: [], tracks: [], starts: [], commands: [], deny: true };
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => {
      if (check.deny) throw new DOMException('refused', 'NotAllowedError');
      const stream = await original(...args); check.tracks.push(...stream.getTracks()); return stream;
    };
    const voice = createBiddingVoice({
      onState: state => check.states.push({ ...state, at: performance.now() }),
      onCommand: (command, context) => {
        const action = command.type === 'raise' ? { type: 'bid', amount: (table.getSnapshot().auction.high?.amount ?? 0) + 1 } : command;
        const result = table.dispatch(action, context);
        check.commands.push({ command: action, accepted: result.accepted, high: table.getSnapshot().auction.high, at: performance.now() });
        if (result.accepted) voice.setContext(null, null);
      },
    });
    check.start = () => {
      check.starts.push(performance.now());
      const context = table.captureContext();
      void voice.start(context, JSON.stringify(context));
    };
    check.stop = () => voice.stop();
    document.querySelector('button').onclick = check.start;`
  );
  const dist = path.join(temporary, 'dist');
  await build({
    configFile: false,
    root: temporary,
    publicDir: false,
    logLevel: 'silent',
    resolve: { alias: { '@shared': path.join(root, 'src/shared') } },
    build: { outDir: dist, lib: { entry, formats: ['es'], fileName: () => 'entry.js' } },
    worker: {
      plugins: () => convexWorkerBuildPlugins(),
      format: 'es',
      rolldownOptions: { output: { entryFileNames: ({ name }) => `public/${name.replace(/[-.]/g, '_')}-[hash].js` } },
    },
  });
  const policy = applicationContentSecurityPolicy('https://backend.invalid', []);
  let servedVoiceBytes = 0;
  let voiceAssetRequests = 0;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://local').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': policy });
      response.end(
        '<!doctype html><html><body><button>Listen</button><script type="module" src="/entry.js"></script></body></html>'
      );
      return;
    }
    try {
      const filename = pathname.startsWith('/tools/') ? path.join(root, 'public', pathname) : path.join(dist, pathname);
      const bytes = await readFile(filename);
      if (pathname.startsWith('/tools/bidding-listener/v1/')) {
        servedVoiceBytes += bytes.length;
        voiceAssetRequests += 1;
      }
      const type = /\.(?:m?js)$/.test(filename)
        ? 'text/javascript'
        : filename.endsWith('.wasm')
          ? 'application/wasm'
          : 'application/octet-stream';
      let asset = new Response(bytes, {
        headers: {
          'Content-Type': type,
          'Content-Security-Policy': policy,
          ...(pathname.startsWith('/tools/bidding-listener/v1/')
            ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
            : {}),
        },
      });
      if (pathname.startsWith('/public/')) {
        const asked = new Request(`http://local${pathname}`);
        asset = (await handleBundleAssetRequest(asked, new URL(asked.url), { fetch: async () => asset }))!;
      }
      response.writeHead(asset.status, Object.fromEntries(asset.headers));
      response.end(Buffer.from(await asset.arrayBuffer()));
    } catch {
      response.writeHead(404).end();
    }
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing listener test address');
    }
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${path.join(root, 'scripts/fixtures/bidding-bid-five.wav')}`,
      ],
    });
    const page = await browser.newPage();
    const violations: string[] = [];
    page.on('pageerror', (error) => violations.push(error.message));
    const workerPolicies: string[] = [];
    page.on('response', (reply) => {
      if (/\/public\/biddingVoice_worker-[\w-]+\.js$/.test(reply.url())) {
        workerPolicies.push(reply.headers()['content-security-policy'] ?? '');
      }
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => window.voiceCheck !== undefined);
    await page.getByRole('button', { name: 'Listen' }).click();
    await page.waitForFunction(() => window.voiceCheck.states.at(-1)?.status === 'failed');
    expect(await page.evaluate(() => window.voiceCheck.states.at(-1)?.message)).toContain('refused');
    expect(workerPolicies).toEqual([]);
    expect(voiceAssetRequests).toBe(0);
    expect(servedVoiceBytes).toBe(0);
    await page.evaluate(() => {
      window.voiceCheck.deny = false;
    });
    await page.getByRole('button', { name: 'Listen' }).click();
    await page.waitForFunction(() => window.voiceCheck.states.at(-1)?.status === 'listening', undefined, {
      timeout: 60_000,
    });
    expect(workerPolicies.some((value) => value.includes("'wasm-unsafe-eval'"))).toBe(true);
    expect(policy).not.toContain('wasm-unsafe-eval');
    await page.waitForFunction(() => window.voiceCheck.commands.some((command) => command.accepted), undefined, {
      timeout: 30_000,
    });
    expect(await page.evaluate(() => window.voiceCheck.commands.map(({ at: _at, ...event }) => event))).toEqual([
      { command: { type: 'bid', amount: 5 }, accepted: true, high: { id: 'fremen', amount: 5 } },
    ]);
    const cold = await page.evaluate(() => ({
      listenToCaptureMs:
        window.voiceCheck.states.find((state) => state.status === 'listening')!.at - window.voiceCheck.starts[1],
      listenToAcceptedCommandMs: window.voiceCheck.commands[0].at - window.voiceCheck.starts[1],
    }));
    const coldBytes = servedVoiceBytes;
    const coldRequests = voiceAssetRequests;
    await page.evaluate(() => window.voiceCheck.stop());
    expect(await page.evaluate(() => window.voiceCheck.tracks.every((track) => track.readyState === 'ended'))).toBe(
      true
    );
    expect(await page.evaluate(() => window.voiceCheck.states.at(-1)?.status)).toBe('off');
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Listen' }).click();
    await page.waitForFunction(() => window.voiceCheck.states.at(-1)?.status === 'listening', undefined, {
      timeout: 60_000,
    });
    await page.evaluate(() => window.voiceCheck.stop());
    expect(await page.evaluate(() => window.voiceCheck.tracks.every((track) => track.readyState === 'ended'))).toBe(
      true
    );
    expect(servedVoiceBytes).toBe(coldBytes);
    expect(voiceAssetRequests).toBe(coldRequests);
    expect(violations).toEqual([]);
    console.info(
      'Voice desktop loopback check',
      JSON.stringify({
        ...cold,
        servedVoiceBytes: coldBytes,
        voiceAssetRequests: coldRequests,
        offlineRestartAssetRequests: voiceAssetRequests - coldRequests,
      })
    );
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
}, 90_000);

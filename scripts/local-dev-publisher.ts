import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { build } from 'esbuild';

import type { PersistentManifest, PersistentSecrets } from './local-dev-persistence';
import { assertLoopbackUrl, writePrivateJson } from './local-dev-persistence';
import { localApplicationEnvironment } from './provision';

const root = path.resolve(import.meta.dirname, '..');
export const localPublisherPaths = [
  '/__asset-publisher',
  '/published',
  '/publisher-capture',
  '/user-images',
  '/__user-images',
  '/__media',
  '/m/',
  '/image/',
  '/web/',
  '/vector/',
];

/** Construct local configuration from an allowlist. Hosted routes, secrets and service bindings never enter it. */
export function localPublisherConfiguration(manifest: PersistentManifest, sourceCommit: string) {
  const { instance } = manifest;
  const app = assertLoopbackUrl(instance.appUrl);
  const site = assertLoopbackUrl(instance.siteUrl);
  const backend = assertLoopbackUrl(instance.backendUrl);
  return {
    name: 'dunezone-isolated-local-publisher',
    main: path.join(root, 'workers/publisher/local-review.ts'),
    compatibility_date: '2026-07-17',
    compatibility_flags: ['nodejs_compat'],
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: {
      ...(existsSync(path.join(manifest.stateDirectory, 'publisher-build/server-aliases.json'))
        ? (JSON.parse(
            readFileSync(path.join(manifest.stateDirectory, 'publisher-build/server-aliases.json'), 'utf8')
          ) as Record<string, string>)
        : {}),
      'rulebook-html-renderer-runtime': path.join(
        manifest.stateDirectory,
        'publisher-build/rulebook-html-renderer.mjs'
      ),
      'application-ssr-runtime': path.join(manifest.stateDirectory, 'publisher-build/server/server.js'),
    },
    assets: {
      directory: path.join(manifest.stateDirectory, 'publisher-build/assets'),
      binding: 'ASSETS',
      html_handling: 'none',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    browser: { binding: 'BROWSER', remote: false },
    images: { binding: 'IMAGES', remote: false },
    version_metadata: { binding: 'CF_VERSION_METADATA' },
    r2_buckets: [
      'ASSET_BUCKET',
      'USER_IMAGE_BUCKET',
      'MEDIA_SOURCE_BUCKET',
      'MEDIA_BUCKET',
      'MEDIA_RELEASES_BUCKET',
    ].map((binding) => ({
      binding,
      bucket_name: `review-${manifest.instance.composeProjectName.slice(-36)}-${binding.toLowerCase().replaceAll('_bucket', '').replaceAll('_', '-')}`,
      remote: false,
    })),
    rules: [
      { type: 'Text', globs: ['**/*.css'], fallthrough: true },
      { type: 'Data', globs: ['**/*.woff2', '**/*.woff'], fallthrough: true },
    ],
    vars: {
      LOCAL_REVIEW: 'isolated-local-v1',
      PUBLIC_BASE_URL: app,
      USER_IMAGE_PUBLIC_BASE_URL: app,
      CAPTURE_BASE_URL: app,
      CONVEX_EXECUTOR_BASE_URL: `${site}/asset-publishing/executor`,
      CONVEX_AUTH_BASE_URL: site,
      CONVEX_RENDER_URL: `${site}/asset-publishing/render`,
      CONVEX_CLOUD_BASE_URL: backend,
      GIT_SHA: sourceCommit,
      WORK_WINDOW_MS: '240000',
      BROWSER_CAPTURE_TIMEOUT_MS: '45000',
      BROWSER_CLEANUP_GRACE_MS: '15000',
      PDF_MAX_BYTES: '8000000',
    },
  };
}

async function buildAndCopyLocalPublisher(environment: NodeJS.ProcessEnv, stateDirectory: string) {
  const result = spawnSync(process.execPath, ['--no-env-file', 'run', 'publisher:assets'], {
    cwd: root,
    env: localApplicationEnvironment(environment),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('Local publisher asset build failed. Restore required maintained media and retry.');
  }
  // Snapshot documents retain maintained vector URLs. Serve their actual local source bytes.
  const output = path.join(stateDirectory, 'publisher-build');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(path.join(root, 'workers/publisher/dist'), path.join(output, 'assets'), { recursive: true });
  cpSync(path.join(root, 'media/vector'), path.join(output, 'assets/vector'), { recursive: true });
  cpSync(path.join(root, 'dist/server'), path.join(output, 'server'), { recursive: true });
  // Copied SSR chunks sit outside the checkout. Resolve their bare imports through
  // this checkout's frozen dependency graph rather than an ancestor's node_modules.
  const serverAliases: Record<string, string> = {};
  const transpiler = new Bun.Transpiler({ loader: 'js' });
  const files = readdirSync(path.join(root, 'dist/server'), { recursive: true }).filter(
    (file): file is string => typeof file === 'string' && file.endsWith('.js')
  );
  for (const file of files) {
    for (const entry of transpiler.scan(readFileSync(path.join(root, 'dist/server', file), 'utf8')).imports) {
      if (!entry.path.startsWith('.') && !entry.path.startsWith('/') && !entry.path.includes(':')) {
        serverAliases[entry.path] = '';
      }
    }
  }
  await build({
    stdin: {
      contents: Object.keys(serverAliases)
        .map((specifier) => `import ${JSON.stringify(specifier)};`)
        .join('\n'),
      resolveDir: root,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    conditions: ['workerd', 'browser'],
    plugins: [
      {
        name: 'local-ssr-dependencies',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, async (args) => {
            if (args.pluginData?.resolvedForAlias) {
              return undefined;
            }
            const resolved = await builder.resolve(args.path, {
              resolveDir: root,
              kind: args.kind,
              pluginData: { resolvedForAlias: true },
            });
            if (resolved.errors.length > 0) {
              return { errors: resolved.errors };
            }
            serverAliases[args.path] = resolved.path;
            return { path: resolved.path, external: true };
          });
        },
      },
    ],
  });
  writePrivateJson(path.join(output, 'server-aliases.json'), serverAliases);
  cpSync(
    path.join(root, 'workers/publisher/runtime-generated/rulebook-html-renderer.mjs'),
    path.join(output, 'rulebook-html-renderer.mjs')
  );
}

/** Serialize generation and copying, then serve only this environment's copied build. */
export function buildLocalPublisher(environment: NodeJS.ProcessEnv, stateDirectory: string) {
  const result = spawnSync(
    'python3',
    [
      path.join(root, 'scripts/local-dev-lock.py'),
      path.join(root, 'node_modules/.cache/local-review-build'),
      process.execPath,
      '--no-env-file',
      path.join(root, 'scripts/local-dev-publisher.ts'),
      '--build',
      stateDirectory,
    ],
    { cwd: root, env: environment, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error(
      'Local publisher build failed or another launcher owns the checkout build lock. Retry after that build finishes.'
    );
  }
}

export function startLocalPublisher(
  manifest: PersistentManifest,
  secrets: PersistentSecrets,
  environment: NodeJS.ProcessEnv,
  sourceCommit: string
) {
  const configFile = path.join(manifest.stateDirectory, 'wrangler.json');
  writePrivateJson(configFile, localPublisherConfiguration(manifest, sourceCommit));
  // Wrangler reads only this adjacent private file, never the production worker's .dev.vars.
  writeFileSync(
    path.join(manifest.stateDirectory, '.dev.vars'),
    `ASSET_PUBLISHER_EXECUTOR_SECRET=${secrets.executorSecret}\n`,
    { mode: 0o600 }
  );
  const workerEnv = Object.fromEntries(
    Object.entries(localApplicationEnvironment(environment)).filter(
      ([key]) => !/^(CLOUDFLARE_|CF_|AWS_|MEDIA_|ASSET_PUBLISHER_|WRANGLER_)/.test(key)
    )
  );
  return spawn(
    process.execPath,
    [
      '--no-env-file',
      'x',
      'wrangler',
      'dev',
      '--local',
      '--config',
      configFile,
      '--persist-to',
      path.join(manifest.stateDirectory, 'objects'),
      '--ip',
      '127.0.0.1',
      '--port',
      String(manifest.publisherPort),
      '--inspector-port',
      '0',
      '--test-scheduled',
    ],
    {
      cwd: root,
      env: {
        ...workerEnv,
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_LOG_PATH: path.join(manifest.stateDirectory, 'logs'),
      },
      stdio: 'inherit',
    }
  );
}

if (import.meta.main) {
  const [operation, stateDirectory] = process.argv.slice(2);
  if (operation !== '--build' || !stateDirectory || !path.isAbsolute(stateDirectory)) {
    throw new Error('Local publisher build requires an absolute state directory');
  }
  await buildAndCopyLocalPublisher(process.env, stateDirectory);
}

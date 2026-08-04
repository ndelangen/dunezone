import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

import { ensureLocalAuthUser } from './local-dev-auth';

type AppDevMode = 'cloud' | 'help' | 'local';

type ImportedGroup = {
  name: string;
  slug: string;
  created_at: string;
};

type ImportedFaction = {
  data: unknown;
  slug: string;
  created_at: string;
  updated_at: string;
  group: ImportedGroup | null;
};

type ProductionFactionPage = {
  page: ImportedFaction[];
  isDone: boolean;
  continueCursor: string;
};

type CommandOptions = {
  env?: NodeJS.ProcessEnv;
  quiet?: boolean;
};

const rootDirectory = path.resolve(import.meta.dirname, '..');
const composeFile = path.join(rootDirectory, 'docker-compose.convex-local.yml');
const localEnvFile = process.env.LOCAL_DEV_ENV_FILE ?? path.join(rootDirectory, '.env.e2e.local');
const localImportBatch = makeFunctionReference<
  'mutation',
  {
    ownerEmail: string;
    collaboratorEmail: string;
    factions: ImportedFaction[];
  },
  { importedFactions: number }
>('localDevelopment:importFactionBatch');
const prepareLocalImport = makeFunctionReference<
  'mutation',
  { ownerEmail: string; collaboratorEmail: string },
  { ownerId: string; collaboratorId: string }
>('localDevelopment:prepareFactionImport');

export function parseAppDevMode(args: string[]): AppDevMode {
  if (args.length === 0) {
    return 'cloud';
  }
  if (args.length === 1 && args[0] === '--local') {
    return 'local';
  }
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    return 'help';
  }
  throw new Error(`Unknown app:dev argument: ${args.join(' ')}`);
}

export function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const sourceLine of contents.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator < 1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function buildProductionFactionQuery(cursor: string | null): string {
  return [
    'const result = await ctx.db',
    '  .query("factions")',
    '  .withIndex("by_deleted", q => q.eq("is_deleted", false))',
    `  .paginate({ numItems: 10, cursor: ${JSON.stringify(cursor)} });`,
    'const page = [];',
    'for (const faction of result.page) {',
    '  const group = faction.group_id ? await ctx.db.get(faction.group_id) : null;',
    '  page.push({',
    '    data: faction.data,',
    '    slug: faction.slug,',
    '    created_at: faction.created_at,',
    '    updated_at: faction.updated_at,',
    '    group: group ? { name: group.name, slug: group.slug, created_at: group.created_at } : null,',
    '  });',
    '}',
    'return { page, isDone: result.isDone, continueCursor: result.continueCursor };',
  ].join('\n');
}

function commandEnvironment(
  base: NodeJS.ProcessEnv,
  overrides: Record<string, string | undefined>
) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function run(command: string, args: string[], options: CommandOptions = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0) {
    const details = options.quiet ? result.stderr.trim() : '';
    throw new Error(
      `${command} ${args.join(' ')} failed${details.length > 0 ? `: ${details}` : ''}`
    );
  }
  return result.stdout;
}

function compose(args: string[], env: NodeJS.ProcessEnv, quiet = false) {
  return run('docker', ['compose', '-f', composeFile, ...args], { env, quiet });
}

function localConvex(args: string[], env: NodeJS.ProcessEnv, quiet = false) {
  return run('bunx', ['convex', ...args], {
    env: commandEnvironment(env, {
      CONVEX_DEPLOYMENT: '',
      CONVEX_URL: '',
      CONVEX_CLOUD_URL: '',
    }),
    quiet,
  });
}

function productionConvex(args: string[]) {
  return run('bunx', ['convex', ...args], {
    env: commandEnvironment(process.env, {
      CONVEX_SELF_HOSTED_URL: undefined,
      CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
    }),
    quiet: true,
  });
}

function requireValue(values: Record<string, string>, key: string) {
  const value = values[key]?.trim();
  if (!value || value === 'replace-me') {
    throw new Error(`Set ${key} in ${localEnvFile}`);
  }
  return value;
}

function parseProductionPage(output: string): ProductionFactionPage {
  const value = JSON.parse(output) as Partial<ProductionFactionPage>;
  if (!Array.isArray(value.page) || typeof value.isDone !== 'boolean') {
    throw new Error('Production faction export returned an unexpected response');
  }
  if (typeof value.continueCursor !== 'string') {
    throw new Error('Production faction export did not return a cursor');
  }
  return value as ProductionFactionPage;
}

async function waitForUrl(url: string, processToWatch: ChildProcess) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processToWatch.exitCode !== null) {
      throw new Error('The Vite development server exited before it became ready');
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The Vite development server did not become ready at ${url}`);
}

function startVite(port: string, env: NodeJS.ProcessEnv) {
  return spawn('bunx', ['vite', 'dev', '--port', port], {
    cwd: rootDirectory,
    env,
    stdio: 'inherit',
  });
}

async function waitForExit(child: ChildProcess) {
  return await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 0));
  });
}

function printHelp() {
  console.log(`Usage:
  bun run app:dev          Start Vite with the configured online Convex deployment.
  bun run app:dev --local  Reset and start disposable local Convex, import production
                           factions, and enable the two local test accounts.`);
}

function generateJwtMaterial(directory: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPath = path.join(directory, 'jwt-private-key.pem');
  const jwksPath = path.join(directory, 'jwks.json');
  const privateKeyValue = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const jwksValue = JSON.stringify({ keys: [publicKey.export({ format: 'jwk' })] });
  writeFileSync(privateKeyPath, privateKeyValue);
  writeFileSync(jwksPath, jwksValue);
  return {
    privateKeyPath,
    jwksPath,
    privateKeyBase64: Buffer.from(privateKeyValue).toString('base64'),
    jwksBase64: Buffer.from(jwksValue).toString('base64'),
  };
}

async function importProductionFactions(
  localUrl: string,
  ownerEmail: string,
  collaboratorEmail: string
) {
  const client = new ConvexHttpClient(localUrl);
  await client.mutation(prepareLocalImport, { ownerEmail, collaboratorEmail });

  let cursor: string | null = null;
  let imported = 0;
  while (true) {
    const query = buildProductionFactionQuery(cursor);
    const output = productionConvex(['run', '--prod', '--inline-query', query]);
    const result = parseProductionPage(output);
    if (result.page.length > 0) {
      const batch = await client.mutation(localImportBatch, {
        ownerEmail,
        collaboratorEmail,
        factions: result.page,
      });
      imported += batch.importedFactions;
      console.log(`Imported ${imported} production factions...`);
    }
    if (result.isDone) {
      return imported;
    }
    cursor = result.continueCursor;
  }
}

async function runCloudDevelopment() {
  const port = process.env.APP_DEV_PORT ?? '3000';
  const vite = startVite(port, process.env);
  process.exitCode = await waitForExit(vite);
}

async function runLocalDevelopment() {
  const values = {
    ...parseEnvFile(readFileSync(localEnvFile, 'utf8')),
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    ),
  };
  const port = process.env.APP_DEV_PORT ?? '3000';
  const baseUrl = `http://localhost:${port}`;
  const localUrl = values.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210';
  const localSiteUrl = values.CONVEX_SITE_URL ?? 'http://127.0.0.1:3211';
  const ownerEmail = requireValue(values, 'PLAYWRIGHT_USER_A_EMAIL');
  const collaboratorEmail = requireValue(values, 'PLAYWRIGHT_USER_B_EMAIL');
  const password = requireValue(values, 'PLAYWRIGHT_USER_PASSWORD');
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'dunezone-app-dev-'));
  const jwt = generateJwtMaterial(temporaryDirectory);

  let vite: ChildProcess | null = null;
  let shuttingDown = false;
  let localEnv = commandEnvironment(process.env, {
    ...values,
    SITE_URL: baseUrl,
    VITE_CONVEX_URL: localUrl,
    CONVEX_SITE_URL: localSiteUrl,
    E2E_LOCAL_AUTH: 'true',
    VITE_E2E_LOCAL_AUTH: 'true',
    IS_TEST: 'true',
  });

  const cleanup = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    vite?.kill('SIGTERM');
    try {
      compose(['down'], localEnv, true);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  };
  const stop = (exitCode: number) => {
    cleanup();
    process.exit(exitCode);
  };
  process.once('SIGINT', () => stop(130));
  process.once('SIGTERM', () => stop(143));
  process.once('exit', cleanup);

  try {
    console.log('Resetting disposable local Convex data...');
    compose(['down', '-v'], localEnv, true);
    compose(['up', '-d'], localEnv);

    console.log('Waiting for local Convex...');
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`${localUrl}/version`);
        if (response.ok) {
          break;
        }
      } catch {
        // The backend is still starting.
      }
      if (attempt === 59) {
        throw new Error('Local Convex did not become healthy');
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    let adminKey = values.CONVEX_SELF_HOSTED_ADMIN_KEY;
    if (!adminKey || adminKey === 'replace-me') {
      adminKey = compose(
        ['exec', '-T', 'backend', './generate_admin_key.sh'],
        localEnv,
        true
      ).trim();
    }
    localEnv = commandEnvironment(localEnv, {
      CONVEX_SELF_HOSTED_URL: localUrl,
      CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
    });

    console.log('Configuring and deploying the local Convex backend...');
    localConvex(['env', 'set', 'SITE_URL', baseUrl], localEnv);
    localConvex(['env', 'set', 'E2E_LOCAL_AUTH', 'true'], localEnv);
    localConvex(['env', 'set', 'IS_TEST', 'true'], localEnv);
    localConvex(['env', 'set', 'JWT_PRIVATE_KEY', '--from-file', jwt.privateKeyPath], localEnv);
    localConvex(['env', 'set', 'JWKS', '--from-file', jwt.jwksPath], localEnv);
    localConvex(['env', 'set', 'JWT_PRIVATE_KEY_B64', jwt.privateKeyBase64], localEnv);
    localConvex(['env', 'set', 'JWKS_B64', jwt.jwksBase64], localEnv);
    localConvex(['deploy'], localEnv);

    console.log('Starting the app and creating the two local accounts...');
    vite = startVite(port, localEnv);
    await waitForUrl(baseUrl, vite);
    await ensureLocalAuthUser(baseUrl, ownerEmail, password);
    await ensureLocalAuthUser(baseUrl, collaboratorEmail, password);

    console.log('Reading production factions and importing them into local Convex...');
    const imported = await importProductionFactions(localUrl, ownerEmail, collaboratorEmail);
    console.log(`Local development is ready at ${baseUrl} (${imported} factions imported).`);
    console.log(`Sign in as ${ownerEmail} or ${collaboratorEmail} using the configured password.`);

    process.exitCode = await waitForExit(vite);
  } finally {
    cleanup();
  }
}

async function main() {
  const mode = parseAppDevMode(process.argv.slice(2));
  if (mode === 'help') {
    printHelp();
    return;
  }
  if (mode === 'local') {
    await runLocalDevelopment();
    return;
  }
  await runCloudDevelopment();
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

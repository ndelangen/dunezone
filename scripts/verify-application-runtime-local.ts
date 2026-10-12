import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { db, ref, refText } from '../src/app/db/storybook/database';
import { SEED_REF_TOKEN } from '../src/app/db/storybook/protocol';
import { rulebookEditionArtifactPath } from '../src/shared/rulebooks/editionArtifacts';
import { createRulebookStarterContents } from '../src/shared/rulebooks/fixtures';
import { rulebookNameKey } from '../src/shared/rulebooks/metadata';
import { projectRulebookRenderDocument } from '../src/shared/rulebooks/projectRenderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from '../src/shared/rulebooks/settings';
import { createLocalDevelopmentInstance, localDevelopmentEnvironmentOverrides } from './local-dev-instance';
import {
  backendUp,
  commandEnvironment,
  composeDown,
  configureLocalAuth,
  localApplicationEnvironment,
  pushCode,
  selfHostedEnvironment,
} from './provision';

const root = path.resolve(import.meta.dirname, '..');
const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-public-runtime-'));
const instance = createLocalDevelopmentInstance({});
const environment = commandEnvironment(localApplicationEnvironment(process.env), {
  ...localDevelopmentEnvironmentOverrides(instance),
  COMPOSE_PROFILES: 'worktree-local',
});

function run(args: string[], env = environment, quiet = false) {
  const result = spawnSync(process.execPath, ['--no-env-file', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
    timeout: 600_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Public runtime verification command failed: ${result.error?.message ?? result.stderr ?? result.status}`
    );
  }
  return result.stdout?.trim() ?? '';
}

/* Every route reads the canonical synthetic public catalogue, plus two distinct immutable Editions. */
const documents = db((baseline) => {
  const now = '2026-08-31T00:00:00.000Z';
  baseline.rulebooks.push({
    $key: 'runtime-rulebook',
    ruleset_id: ref('ruleset:classicrules'),
    name: 'Runtime manual',
    name_key: rulebookNameKey('Runtime manual'),
    slug: 'runtime-manual',
    sort_order: 0,
    current_edition_number: 2,
    created_by: ref('storybook-viewer'),
    created_at: now,
    updated_at: now,
    is_deleted: false,
    deleted_at: null,
  });
  for (const edition of [1, 2]) {
    const contents = createRulebookStarterContents();
    contents.pagesById[contents.pageOrder[0]!]!.title = `Runtime Edition ${edition}`;
    baseline.rulebook_editions.push({
      $key: `runtime-edition-${edition}`,
      rulebook_id: ref('runtime-rulebook'),
      edition_number: edition,
      created_at: now,
      created_by: ref('storybook-viewer'),
    });
    baseline.rulebook_edition_contents.push({ edition_id: ref(`runtime-edition-${edition}`), contents });
    baseline.rulebook_edition_artifacts.push({
      rulebook_id: ref('runtime-rulebook'),
      edition_id: ref(`runtime-edition-${edition}`),
      edition_number: edition,
      kind: 'html',
      status: 'ready',
      path: refText('runtime-rulebook', rulebookEditionArtifactPath(SEED_REF_TOKEN, edition, 'html')),
      failure_reason: null,
      created_at: now,
      updated_at: now,
    });
  }
}).create();

try {
  const deployment = await backendUp(environment, { url: instance.backendUrl });
  configureLocalAuth(deployment, environment, { siteUrl: instance.appUrl, artifactsDirectory: directory });
  pushCode(deployment, environment);
  const target = ['--url', deployment.url, '--admin-key', deployment.adminKey];
  const administrativeEnvironment = selfHostedEnvironment(environment, deployment);
  const executorSecret = randomBytes(32).toString('hex');
  run(
    ['x', 'convex', 'env', 'set', 'ASSET_PUBLISHER_EXECUTOR_SECRET', executorSecret, ...target],
    administrativeEnvironment,
    true
  );
  run(
    [
      'x',
      'convex',
      'run',
      'provisioning:insertSeedDocuments',
      JSON.stringify({ documents: JSON.stringify(documents) }),
      ...target,
    ],
    administrativeEnvironment,
    true
  );
  const rulebooks = JSON.parse(
    run(
      ['x', 'convex', 'data', 'rulebooks', '--format', 'json', '--limit', '10', ...target],
      administrativeEnvironment,
      true
    )
  ) as Array<{ _id: string }>;
  if (rulebooks.length !== 1) {
    throw new Error('Public runtime fixture must contain exactly one Rulebook');
  }
  run(['run', 'publisher:release:verify']);
  const runtime = await import(
    pathToFileURL(path.join(root, 'workers/publisher/runtime-generated/rulebook-html-renderer.mjs')).href
  );
  const contents = createRulebookStarterContents();
  contents.pagesById[contents.pageOrder[0]!]!.title = 'Runtime Edition 2';
  const artifactPath = rulebookEditionArtifactPath(rulebooks[0]!._id, 2, 'html');
  const html = runtime.renderRulebookHtmlDocument({
    canonicalHref: new URL(artifactPath, 'https://dune.zone').href,
    edition: { rulebookId: rulebooks[0]!._id, editionNumber: 2 },
    document: projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS, {}),
    label: 'Runtime manual',
    style: runtime.rulebookRendererCss,
    title: 'Runtime manual',
  });
  const fixtureFile = path.join(directory, 'runtime.json');
  writeFileSync(
    fixtureFile,
    JSON.stringify({
      backendUrl: instance.backendUrl,
      siteUrl: instance.siteUrl,
      rulebookId: rulebooks[0]!._id,
      storageDirectory: path.join(directory, 'storage'),
      artifactKey: artifactPath.slice('/published/'.length),
      html,
    }),
    { mode: 0o600 }
  );
  run(['run', 'publisher:application-runtime:verify'], {
    ...environment,
    APPLICATION_RUNTIME_FIXTURE: fixtureFile,
    ASSET_PUBLISHER_EXECUTOR_SECRET: executorSecret,
  });
} finally {
  try {
    composeDown(environment);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

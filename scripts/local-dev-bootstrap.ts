import path from 'node:path';

import type { PersistentManifest, PersistentSecrets } from './local-dev-persistence';
import { writePrivateJson } from './local-dev-persistence';
import { discardDownloadedSnapshot } from './local-snapshot';
import type { LocalSnapshot } from './local-snapshot';
import {
  assertLocalVolumeExists,
  backendUp,
  commandEnvironment,
  configureLocalAuth,
  finishSnapshotData,
  importSnapshotData,
  pushCode,
  runMigrationGuards,
} from './provision';

export type PersistentBootstrap = {
  manifest: PersistentManifest;
  secrets: PersistentSecrets;
  environment: NodeJS.ProcessEnv;
  snapshot: LocalSnapshot | null;
  fresh: boolean;
};

function checkpoint(manifest: PersistentManifest, status: PersistentManifest['status']) {
  manifest.status = status;
  writePrivateJson(path.join(manifest.stateDirectory, 'manifest.json'), manifest);
}

function assertBootstrapSource({ fresh, snapshot, manifest }: PersistentBootstrap) {
  if (fresh !== (snapshot !== null)) {
    throw new Error('Only first bootstrap may supply a snapshot; resume keeps authored data');
  }
  const initializing = manifest.status === 'initializing';
  if (fresh !== initializing) {
    throw new Error(
      fresh
        ? 'First bootstrap requires an initializing manifest'
        : 'Interrupted first bootstrap requires explicit reset'
    );
  }
}

/** Resume durable bootstrap stages. Only a fresh, verified snapshot can reach import. */
export async function provisionPersistentBackend(input: PersistentBootstrap) {
  assertBootstrapSource(input);
  const { manifest, secrets, snapshot, fresh } = input;
  if (!fresh) {
    assertLocalVolumeExists(input.environment);
  }
  const deployment = await backendUp(input.environment, {
    url: manifest.instance.backendUrl,
    adminKey: secrets.adminKey ?? undefined,
    preserve: true,
  });
  const environment = commandEnvironment(input.environment, {
    CONVEX_SELF_HOSTED_URL: deployment.url,
    CONVEX_SELF_HOSTED_ADMIN_KEY: deployment.adminKey,
  });
  secrets.adminKey = deployment.adminKey;
  writePrivateJson(path.join(manifest.stateDirectory, 'secrets.json'), secrets);
  if (snapshot) {
    try {
      importSnapshotData(deployment, environment, snapshot.file);
    } finally {
      discardDownloadedSnapshot(snapshot);
    }
    checkpoint(manifest, 'imported');
  }
  if (manifest.status === 'imported') {
    configureLocalAuth(deployment, environment, {
      siteUrl: manifest.instance.appUrl,
      artifactsDirectory: manifest.stateDirectory,
    });
    checkpoint(manifest, 'configured');
  }
  pushCode(deployment, environment);
  if (manifest.status === 'configured') {
    finishSnapshotData(deployment, environment);
    checkpoint(manifest, 'seeded');
  }
  runMigrationGuards(deployment, environment, 900_000);
  if (manifest.status === 'seeded') {
    checkpoint(manifest, 'provisioned');
  }
  return { deployment, environment };
}

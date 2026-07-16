import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

const repositoryRoot = new URL('../../', import.meta.url);

describe('proof deployment-safe defaults', () => {
  test('checks in only the inert annual Cron and routes both capture HTML paths through code', () => {
    const wranglerConfig = readFileSync(
      new URL('workers/proof/wrangler.jsonc', repositoryRoot),
      'utf8'
    );

    expect(wranglerConfig).toContain('"crons": ["0 0 1 1 *"]');
    expect(wranglerConfig).not.toContain('*/15 * * * *');
    expect(wranglerConfig).toContain('"/capture/proof/*"');
    expect(wranglerConfig).toContain('"/proof-capture.html"');
  });

  test('uses one bounded Queue consumer and contains no Durable Object configuration', () => {
    const wranglerConfig = readFileSync(
      new URL('workers/proof/wrangler.jsonc', repositoryRoot),
      'utf8'
    );

    expect(wranglerConfig).toContain('"binding": "PROOF_QUEUE"');
    expect(wranglerConfig.match(/"queue": "faction-sheet-one-pdf-proof"/g)).toHaveLength(2);
    expect(wranglerConfig).toContain('"max_batch_size": 1');
    expect(wranglerConfig).toContain('"max_retries": 0');
    expect(wranglerConfig).toContain('"max_concurrency": 1');
    expect(wranglerConfig).not.toContain('"retry_delay"');
    expect(wranglerConfig).not.toContain('"limits"');
    expect(wranglerConfig).not.toContain('"cpu_ms"');
    expect(wranglerConfig).not.toContain('durable_objects');
    expect(wranglerConfig).not.toContain('migrations');
    expect(wranglerConfig).not.toContain('PROOF_EXECUTOR');
  });

  test('ignores proof development secret files but preserves the example exception', () => {
    const gitignore = readFileSync(new URL('.gitignore', repositoryRoot), 'utf8');

    expect(gitignore).toContain('workers/proof/.dev.vars*');
    expect(gitignore).toContain('!workers/proof/.dev.vars.example');
  });

  test('pins the checkpoint to the DuneGen production site rather than a dev placeholder', () => {
    const wranglerConfig = readFileSync(
      new URL('workers/proof/wrangler.jsonc', repositoryRoot),
      'utf8'
    );
    const runbook = readFileSync(new URL('workers/proof/README.md', repositoryRoot), 'utf8');
    const developmentSecretsExample = readFileSync(
      new URL('workers/proof/.dev.vars.example', repositoryRoot),
      'utf8'
    );
    const productionEndpoint =
      'https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/proof/checkpoint';
    const productionEligibilityEndpoint =
      'https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/proof/eligibility';

    expect(wranglerConfig).toContain(`"CONVEX_PROOF_URL": "${productionEndpoint}"`);
    expect(wranglerConfig).toContain(
      `"CONVEX_PROOF_ELIGIBILITY_URL": "${productionEligibilityEndpoint}"`
    );
    expect(wranglerConfig).not.toContain('REPLACE_ME.convex.site');
    expect(runbook).toContain(`export CONVEX_PROOF_URL='${productionEndpoint}'`);
    expect(runbook).toContain(
      `export CONVEX_PROOF_ELIGIBILITY_URL='${productionEligibilityEndpoint}'`
    );
    expect(runbook).toContain('convex env set ASSET_PUBLISHING_PROOF_SECRET --prod');
    expect(runbook).not.toContain('--deployment dev');
    expect(runbook).not.toContain('s/^VITE_CONVEX_URL=');
    expect(wranglerConfig).not.toContain('CONVEX_DEPLOY_KEY');
    expect(wranglerConfig).not.toContain('CONVEX_DEPLOYMENT');
    expect(developmentSecretsExample).not.toContain('CONVEX_DEPLOY_KEY');
    expect(developmentSecretsExample).not.toContain('CONVEX_DEPLOYMENT');
  });

  test('keeps production Convex deployment in the ordered main-branch GitHub Action', () => {
    const runbook = readFileSync(new URL('workers/proof/README.md', repositoryRoot), 'utf8');

    expect(runbook).toContain('bunx convex deploy --dry-run --verbose');
    expect(runbook).not.toContain('bunx convex deploy --verbose --message');
    expect(runbook).toContain('Deploy production');
    expect(runbook).toContain('must merge to');
    expect(runbook).toContain('do not enable an independent\nCloudflare Git auto-deploy');
  });

  test('forbids arming a frequent Cron or running deployed failure-mode captures', () => {
    const runbook = readFileSync(new URL('workers/proof/README.md', repositoryRoot), 'utf8');

    expect(runbook).toContain('Do not arm a frequent or positive Cron');
    expect(runbook).toContain('Do not deploy a failure mode');
    expect(runbook).not.toContain("--triggers '*/15 * * * *'");
    expect(runbook).not.toContain("printf '%s' 'eligible'");
  });

  test('documents the temporary R2 one-shot marker and deletes both proof objects', () => {
    const runbook = readFileSync(new URL('workers/proof/README.md', repositoryRoot), 'utf8');

    expect(runbook).toContain('proof/default-limit-experiment.claim.json');
    expect(runbook.match(/bunx wrangler r2 object delete/g)).toHaveLength(2);
    expect(runbook).toContain('temporary proof state');
    expect(runbook).toContain('Ticket 2 replaces it with the real Convex lease');
  });
});

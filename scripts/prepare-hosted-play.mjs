import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { prepareHostedBackend } from './play-load/hosted-backend.ts';
import { prepareHostedWorkers } from './play-load/hosted-workers.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string' },
    directory: { type: 'string' },
    run: { type: 'string' },
    'game-id': { type: 'string' },
    assets: { type: 'string' },
  },
});
assert.equal(positionals.length, 1, 'Choose backend or workers.');
assert.ok(values.target && values.directory, '--target and --directory are required.');
execFileSync('/usr/bin/git', ['diff', '--exit-code', 'HEAD'], {
  stdio: 'pipe',
});
const target = JSON.parse(await readFile(values.target, 'utf8'));
if (positionals[0] === 'backend') {
  await prepareHostedBackend(values.directory, target);
  console.log(`Prepared isolated backend sources in ${values.directory}. No deployment was changed.`);
} else {
  assert.equal(positionals[0], 'workers');
  assert.ok(values.run && values['game-id'] && values.assets, 'Workers require --run, --game-id and --assets.');
  const run = JSON.parse(await readFile(values.run, 'utf8'));
  const result = await prepareHostedWorkers(values.directory, target, run, values['game-id'], values.assets);
  console.log(JSON.stringify(result, null, 2));
}

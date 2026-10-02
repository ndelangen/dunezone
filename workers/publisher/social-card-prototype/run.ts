/* This prototype has no deploy command and never contacts a backend while serving. */
const command = Bun.spawn(
  [
    'bunx',
    'wrangler',
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    '4325',
    '--inspector-port',
    '9235',
    '--config',
    'workers/publisher/social-card-prototype/wrangler.jsonc',
  ],
  {
    cwd: new URL('../../..', import.meta.url).pathname,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  }
);
process.exit(await command.exited);

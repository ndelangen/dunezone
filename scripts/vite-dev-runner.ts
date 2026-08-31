import { renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createServer } from 'vite';

const rootDirectory = path.resolve(import.meta.dirname, '..');

async function main() {
  const [portValue, readyFile] = process.argv.slice(2);
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue ?? '') || !Number.isSafeInteger(port) || port < 1 || port > 65_535 || !readyFile) {
    throw new Error('The Vite runner needs a port from 1 through 65535 and a readiness file');
  }
  const server = await createServer({
    root: rootDirectory,
    server: { host: '127.0.0.1', port, strictPort: true },
  });

  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1' || address.port !== port) {
      throw new Error(`Vite did not bind 127.0.0.1 on the requested port ${port}`);
    }
    const temporaryReadyFile = `${readyFile}.${process.pid}.tmp`;
    writeFileSync(temporaryReadyFile, JSON.stringify({ pid: process.pid, port }), { mode: 0o600 });
    renameSync(temporaryReadyFile, readyFile);
    server.printUrls();
    server.bindCLIShortcuts({ print: true });
  } catch (error) {
    await server.close();
    throw error;
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

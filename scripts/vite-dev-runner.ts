import { renameSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { createServer } from 'vite';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const invalidPortMessage = 'The Vite development port must be an integer from 1 through 65535';

function requirePortValue(value: string | undefined) {
  if (!value) {
    throw new Error(invalidPortMessage);
  }
  return value;
}

function assertDecimalPort(value: string) {
  if (![...value].every((character) => character >= '0' && character <= '9')) {
    throw new Error(invalidPortMessage);
  }
}

function assertSafeInteger(port: number) {
  if (!Number.isSafeInteger(port)) {
    throw new Error(invalidPortMessage);
  }
}

function assertPortRange(port: number) {
  if (port < 1) {
    throw new Error(invalidPortMessage);
  }
  if (port > 65_535) {
    throw new Error(invalidPortMessage);
  }
}

function parsePort(value: string | undefined) {
  const candidate = requirePortValue(value);
  assertDecimalPort(candidate);
  const port = Number(candidate);
  assertSafeInteger(port);
  assertPortRange(port);
  return port;
}

function parseArguments(): { port: number; readyFile: string } {
  const [portValue, readyFile] = process.argv.slice(2);
  if (!readyFile) {
    throw new Error('The Vite development runner needs a readiness file');
  }
  return { port: parsePort(portValue), readyFile };
}

function requireExpectedAddress(address: AddressInfo | string | null, port: number): AddressInfo {
  if (!address || typeof address === 'string') {
    throw new Error(`Vite did not bind 127.0.0.1 on the requested port ${port}`);
  }
  if (address.address !== '127.0.0.1' || address.port !== port) {
    throw new Error(`Vite did not bind 127.0.0.1 on the requested port ${port}`);
  }
  return address;
}

function publishReadiness(readyFile: string, address: AddressInfo) {
  const temporaryReadyFile = `${readyFile}.${process.pid}.tmp`;
  writeFileSync(temporaryReadyFile, `${JSON.stringify({ pid: process.pid, port: address.port })}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryReadyFile, readyFile);
}

async function main() {
  const { port, readyFile } = parseArguments();
  const server = await createServer({
    root: rootDirectory,
    server: { host: '127.0.0.1', port, strictPort: true },
  });

  try {
    await server.listen();
    const address = requireExpectedAddress(server.httpServer?.address() ?? null, port);
    publishReadiness(readyFile, address);
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

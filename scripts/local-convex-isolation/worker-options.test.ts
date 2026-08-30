import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { createTemporaryDirectory } from './runtime';
import { parseCleanupWorkerOptions, parseReservationWorkerOptions } from './worker-options';

const temporaryDirectories: string[] = [];

function createProbe() {
  const directory = createTemporaryDirectory('worker-options-');
  temporaryDirectories.push(directory);
  return directory;
}

function reservationOptions(directory: string) {
  return {
    worktreePath: path.join(directory, 'worktrees', 'fixture', 'dunezone'),
    reservationDirectory: path.join(directory, 'reservations'),
    outputPath: path.join(directory, 'result.json'),
    behavior: 'hold',
    releasePath: path.join(directory, 'release'),
    ownerPid: process.pid,
    port: 41_000,
    timeZone: 'America/New_York',
  };
}

function cleanupOptions(directory: string) {
  return {
    instancePath: path.join(directory, 'instance.json'),
    reservationDirectory: path.join(directory, 'reservations'),
    outputPath: path.join(directory, 'cleanup.json'),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('isolation worker options', () => {
  test('accepts the existing reservation and cleanup payloads inside one probe', () => {
    const directory = createProbe();
    const reservation = reservationOptions(directory);
    const cleanup = cleanupOptions(directory);

    expect(parseReservationWorkerOptions(JSON.stringify(reservation))).toEqual(reservation);
    expect(parseCleanupWorkerOptions(JSON.stringify(cleanup))).toEqual(cleanup);
  });

  test('normalizes contained paths before returning them', () => {
    const directory = createProbe();
    const options = reservationOptions(directory);
    options.outputPath = `${directory}/unused/../result.json`;

    expect(parseReservationWorkerOptions(JSON.stringify(options)).outputPath).toBe(path.join(directory, 'result.json'));
  });

  test('rejects malformed payloads and fields outside the expected shape', () => {
    const options = reservationOptions(createProbe());
    const invalidPayloads = [
      null,
      [],
      {},
      { ...options, behavior: 'background' },
      { ...options, outputPath: 42 },
      { ...options, ownerPid: 0 },
      { ...options, port: 65_536 },
      { ...options, port: 1.5 },
      { ...options, timeZone: false },
      { ...options, unexpected: true },
    ];
    for (const payload of invalidPayloads) {
      expect(() => parseReservationWorkerOptions(JSON.stringify(payload))).toThrow();
    }
    expect(() => parseReservationWorkerOptions(undefined)).toThrow('Incomplete reservation worker arguments');
    expect(() => parseReservationWorkerOptions('{')).toThrow();
    expect(() =>
      parseCleanupWorkerOptions(JSON.stringify({ ...cleanupOptions(createProbe()), extra: true }))
    ).toThrow();
  });

  test.each(['worktreePath', 'outputPath', 'releasePath'] as const)(
    'rejects traversal into a sibling probe through %s',
    (field) => {
      const directory = createProbe();
      const options = reservationOptions(directory);
      options[field] = path.join(directory, '..', path.basename(createProbe()), 'escaped');

      expect(() => parseReservationWorkerOptions(JSON.stringify(options))).toThrow('must stay inside');
    }
  );

  test.each(['instancePath', 'outputPath'] as const)('confines cleanup %s to its reservation probe', (field) => {
    const options = cleanupOptions(createProbe());
    options[field] = path.join(createProbe(), 'escaped.json');

    expect(() => parseCleanupWorkerOptions(JSON.stringify(options))).toThrow('must stay inside');
  });

  test('rejects relative paths, probe-root targets, and paths outside the private cache', () => {
    const directory = createProbe();
    const options = reservationOptions(directory);
    const invalidOutputs = ['result.json', directory, `${directory}-sibling/result.json`];
    for (const outputPath of invalidOutputs) {
      expect(() => parseReservationWorkerOptions(JSON.stringify({ ...options, outputPath }))).toThrow();
    }
    const reservationDirectory = path.resolve(directory, '..', '..', 'outside-probe');
    expect(() => parseReservationWorkerOptions(JSON.stringify({ ...options, reservationDirectory }))).toThrow(
      'must stay inside'
    );
  });

  test('requires an existing probe directory', () => {
    const directory = `${createProbe()}-missing`;

    expect(() => parseCleanupWorkerOptions(JSON.stringify(cleanupOptions(directory)))).toThrow();
  });

  test('rejects symlinked probe directories', () => {
    const target = createProbe();
    const holder = createProbe();
    const link = path.join(holder, '..', `${path.basename(holder)}-link`);
    symlinkSync(target, link, 'dir');
    temporaryDirectories.push(link);

    expect(() => parseReservationWorkerOptions(JSON.stringify(reservationOptions(link)))).toThrow('symbolic link');
  });

  test('rejects symlinked artifact directories and existing files', () => {
    const directory = createProbe();
    const target = createProbe();
    const targetFile = path.join(target, 'sentinel.json');
    writeFileSync(targetFile, 'unchanged');
    const directoryLink = path.join(directory, 'directory-link');
    const fileLink = path.join(directory, 'file-link');
    symlinkSync(target, directoryLink, 'dir');
    symlinkSync(targetFile, fileLink, 'file');

    for (const outputPath of [path.join(directoryLink, 'result.json'), fileLink]) {
      expect(() =>
        parseReservationWorkerOptions(JSON.stringify({ ...reservationOptions(directory), outputPath }))
      ).toThrow('symbolic link');
    }
    expect(() =>
      parseCleanupWorkerOptions(JSON.stringify({ ...cleanupOptions(directory), instancePath: fileLink }))
    ).toThrow('symbolic link');
  });

  test('rejects symlinks in the reservation directory and permits ordinary existing directories', () => {
    const directory = createProbe();
    const options = reservationOptions(directory);
    mkdirSync(options.reservationDirectory);
    expect(parseReservationWorkerOptions(JSON.stringify(options))).toEqual(options);

    const reservationLink = path.join(directory, 'reservation-link');
    symlinkSync(createProbe(), reservationLink, 'dir');
    expect(() =>
      parseReservationWorkerOptions(JSON.stringify({ ...options, reservationDirectory: reservationLink }))
    ).toThrow('symbolic link');
  });

  test.each([
    'reservations.sqlite',
    'reservations.sqlite-journal',
    'reservations.sqlite-wal',
    'reservations.sqlite-shm',
  ])('rejects a symlinked %s inside an ordinary reservation directory', (fileName) => {
    const directory = createProbe();
    const options = reservationOptions(directory);
    mkdirSync(options.reservationDirectory);
    const targetFile = path.join(createProbe(), fileName);
    writeFileSync(targetFile, 'unchanged');
    symlinkSync(targetFile, path.join(options.reservationDirectory, fileName), 'file');

    expect(() => parseReservationWorkerOptions(JSON.stringify(options))).toThrow('symbolic link');
    expect(() => parseCleanupWorkerOptions(JSON.stringify(cleanupOptions(directory)))).toThrow('symbolic link');
  });
});

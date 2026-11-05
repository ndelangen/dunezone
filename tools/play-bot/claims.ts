/*
 * Which harness holds which bot account, so several harnesses can run on one machine without two of them signing in as the
 * same account. A claim is a small file in the bot's folder naming the process and its page; a claim whose process has
 * ended is free again, so a harness that crashed does not lock its accounts away.
 */
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';

import type { Stack } from './seat';

export const BOTS_DIR = path.join(import.meta.dirname, 'out/bots');
const CLAIM_FILE = 'harness.claim.json';

export type Claim = { pid: number; page: string; since: number };

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    /* EPERM means it is alive but someone else's. */
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The live claim on a bot's folder, if any. */
export function claimOf(id: string, dir = BOTS_DIR): Claim | undefined {
  try {
    const claim = JSON.parse(readFileSync(path.join(dir, id, CLAIM_FILE), 'utf8')) as Claim;
    return alive(claim.pid) ? claim : undefined;
  } catch {
    return undefined;
  }
}

function tryClaim(id: string, page: string, dir: string): boolean {
  const folder = path.join(dir, id);
  const file = path.join(folder, CLAIM_FILE);
  mkdirSync(folder, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      /* `wx` fails if the file exists, so two harnesses racing for one account cannot both win. */
      const fd = openSync(file, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, page, since: Date.now() } satisfies Claim));
      closeSync(fd);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || claimOf(id, dir)) {
        return false;
      }
      /* A claim left by a process that has ended: clear it and try once more. */
      rmSync(file, { force: true });
    }
  }
  return false;
}

/**
 * Claims a bot account for this process: the one asked for (from 1), else the first free one.
 * Returns its number and folder id, or throws when none is free.
 */
export function claimAccount(stack: Stack, page: string, wanted?: number, dir = BOTS_DIR): { account: number; id: string } {
  const bots = stack.accounts.bots ?? [];
  const order = wanted ? [wanted] : bots.map((_, index) => index + 1);
  for (const account of order) {
    const bot = bots[account - 1];
    if (!bot) {
      continue;
    }
    const id = bot.email.split('@')[0]!;
    if (tryClaim(id, page, dir)) {
      return { account, id };
    }
  }
  const held = bots.map((bot) => bot.email.split('@')[0]!).filter((id) => claimOf(id, dir));
  throw new Error(
    wanted
      ? `Bot account ${wanted} is ${bots[wanted - 1] ? 'held by another harness' : 'not on the stack'}.`
      : `Every bot account is in use (${held.join(', ')}). Start the stack with more (--bots ${bots.length + 1}) or stop a bot.`
  );
}

/** Gives the account back, if this process holds it. */
export function releaseAccount(id: string, dir = BOTS_DIR) {
  const file = path.join(dir, id, CLAIM_FILE);
  try {
    const claim = JSON.parse(readFileSync(file, 'utf8')) as Claim;
    if (claim.pid === process.pid) {
      rmSync(file, { force: true });
    }
  } catch {
    /* Nothing claimed. */
  }
}

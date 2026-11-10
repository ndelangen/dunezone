import {
  biddingPublicationSchema,
  initialBiddingRevisionStamps,
  parseBiddingSnapshot,
} from '@shared/tools/biddingSession';
import type { BiddingPublication, BiddingSnapshot } from '@shared/tools/biddingSession';

import { pauseForRecovery } from './auction';

export type SavedRemoteCopy = Readonly<{ snapshot: BiddingSnapshot; receivedAt: number }>;
export type ReceivedCopy = Readonly<{
  accepted: boolean;
  changed: boolean;
  copy: SavedRemoteCopy | null;
  publication: BiddingPublication | null;
  reason: string;
}>;

function requireSnapshot(value: unknown): BiddingSnapshot {
  const parsed = parseBiddingSnapshot(value);
  if (!parsed) {
    throw new Error('No complete bidding recovery copy is available.');
  }
  return parsed;
}

/** Reload keeps its table and phone assignments, but old commands belong to an expired central instance. */
export function restoreCentralSnapshot(
  snapshot: BiddingSnapshot,
  centralInstanceId: string = crypto.randomUUID()
): BiddingSnapshot {
  const saved = requireSnapshot(snapshot);
  if (centralInstanceId === saved.centralInstanceId) {
    throw new Error('Recovery requires a new central instance.');
  }
  return requireSnapshot({
    ...saved,
    centralInstanceId,
    generation: saved.generation + 1,
    revision: saved.revision + 1,
    auction: pauseForRecovery(saved.auction),
    commandSequences: {},
    revisions: initialBiddingRevisionStamps(saved.auction, saved.revision + 1, saved.assignments),
  });
}

/** A phone copy starts a separate table; old phones and pending commands cannot follow it. */
export function promoteSnapshot(
  snapshot: BiddingSnapshot,
  address: Readonly<{ tableId: string; code: string }>,
  centralInstanceId: string = crypto.randomUUID()
): BiddingSnapshot {
  const saved = requireSnapshot(snapshot);
  if (address.tableId === saved.tableId || address.code === saved.code) {
    throw new Error('Phone recovery requires a new table identity and join code.');
  }
  return requireSnapshot({
    ...saved,
    tableId: address.tableId,
    code: address.code,
    centralInstanceId,
    generation: 1,
    revision: 0,
    auction: pauseForRecovery(saved.auction),
    assignments: {},
    commandSequences: {},
    revisions: initialBiddingRevisionStamps(saved.auction),
  });
}

/** Heartbeats refresh receipt time without turning an unchanged snapshot into a storage write. */
export function acceptBiddingPublication(
  current: SavedRemoteCopy | null,
  input: unknown,
  tableId: string,
  receivedAt: number
): ReceivedCopy {
  const reject = (reason: string): ReceivedCopy => ({
    accepted: false,
    changed: false,
    copy: current,
    publication: null,
    reason,
  });
  if (!Number.isSafeInteger(receivedAt) || receivedAt < 0) {
    return reject('The receipt time is invalid.');
  }
  const parsed = biddingPublicationSchema.safeParse(input);
  if (!parsed.success) {
    return reject('The table sent an incomplete state.');
  }
  const publication = parsed.data;
  const snapshot = parseBiddingSnapshot(publication.snapshot);
  if (!snapshot || snapshot.tableId !== tableId) {
    return reject('That state belongs to another table.');
  }
  if (current?.snapshot.tableId !== tableId) {
    return { accepted: true, changed: true, copy: { snapshot, receivedAt }, publication, reason: '' };
  }
  const prior = current.snapshot;
  if (snapshot.code !== prior.code) {
    return reject('The join code cannot change within the same table.');
  }
  if (snapshot.generation < prior.generation) {
    return reject('That state belongs to an older central instance.');
  }
  if (snapshot.generation > prior.generation) {
    return snapshot.centralInstanceId === prior.centralInstanceId
      ? reject('A new command generation must have a new central instance.')
      : { accepted: true, changed: true, copy: { snapshot, receivedAt }, publication, reason: '' };
  }
  if (snapshot.centralInstanceId !== prior.centralInstanceId) {
    return reject('That central instance has not replaced this one.');
  }
  if (snapshot.revision < prior.revision) {
    return reject('That state is older than the saved copy.');
  }
  if (snapshot.revision === prior.revision) {
    if (JSON.stringify(snapshot) !== JSON.stringify(prior)) {
      return reject('The same state revision has conflicting contents.');
    }
    return { accepted: true, changed: false, copy: { snapshot: prior, receivedAt }, publication, reason: '' };
  }
  return { accepted: true, changed: true, copy: { snapshot, receivedAt }, publication, reason: '' };
}

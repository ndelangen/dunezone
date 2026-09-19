/**
 * Sizes what each applied update changed in its recipient's view against what the room sent for it.
 * The minimal size is a merge patch of that view: nested partial objects holding only changed leaves, pieces, carries and pointers as maps by id, a removal as null.
 * It is a lower bound for a patch protocol over this view, not a proposal for one, and it excludes compression.
 */

const KEYS = { pieces: 'id', carries: 'id', pointers: 'connectionId' };
const KINDS = ['empty', 'activity', 'durable', 'both'];
const EMPTY_SAMPLES = 3;
const BYTE_COUNTERS = [
  'bytes',
  'snapshotBytes',
  'pieceBytes',
  'activityBytes',
  'minimalBytes',
  'minimalSnapshotBytes',
  'minimalPieceBytes',
  'minimalActivityBytes',
];
const COUNTERS = ['deliveries', 'acknowledged', ...BYTE_COUNTERS];

const isObject = (value) => value !== null && typeof value === 'object';
const size = (value) => (value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value)));

function same(a, b) {
  if (a === b) {
    return true;
  }
  if (!isObject(a) || !isObject(b) || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const left = Object.entries(a);
  return (
    left.length === Object.keys(b).length && left.every(([key, value]) => Object.hasOwn(b, key) && same(value, b[key]))
  );
}

function keyedPatch(key, base, next) {
  if (base.length === 0 && next.length === 0) {
    return undefined;
  }
  const before = new Map();
  for (const entry of base) {
    before.set(entry[key], entry);
  }
  const patch = {};
  let changed = false;
  for (const entry of next) {
    const previous = before.get(entry[key]);
    before.delete(entry[key]);
    const change = previous === undefined ? entry : mergePatch(previous, entry);
    if (change !== undefined) {
      patch[entry[key]] = change;
      changed = true;
    }
  }
  for (const id of before.keys()) {
    patch[id] = null;
    changed = true;
  }
  /* Surviving entries keep their relative order unless the patch says otherwise; appended entries need no order. */
  let position = 0;
  for (const entry of base) {
    if (!before.has(entry[key])) {
      if (next[position]?.[key] !== entry[key]) {
        patch.order = next.map((candidate) => candidate[key]);
        changed = true;
        break;
      }
      position++;
    }
  }
  return changed ? patch : undefined;
}

/** Undefined means no change; a key holding undefined is absent on the wire, so it equals a missing key. */
function mergePatch(base, next, name) {
  if (base === next) {
    return undefined;
  }
  if (Array.isArray(base) && Array.isArray(next) && KEYS[name]) {
    return keyedPatch(KEYS[name], base, next);
  }
  if (isObject(base) && isObject(next) && !Array.isArray(base) && !Array.isArray(next)) {
    const patch = {};
    let changed = false;
    for (const key in base) {
      const change =
        next[key] === undefined
          ? base[key] === undefined
            ? undefined
            : null
          : base[key] === undefined
            ? next[key]
            : mergePatch(base[key], next[key], key);
      if (change !== undefined) {
        patch[key] = change;
        changed = true;
      }
    }
    for (const key in next) {
      if (base[key] === undefined && next[key] !== undefined) {
        patch[key] = next[key];
        changed = true;
      }
    }
    return changed ? patch : undefined;
  }
  return same(base, next) ? undefined : next;
}

/** The revision belongs to the envelope, so it is not a changed leaf. */
function snapshotPatch(base, next) {
  const { revision: _base, ...baseSnapshot } = base;
  const { revision: _next, ...nextSnapshot } = next;
  return mergePatch(baseSnapshot, nextSnapshot);
}

/** One applied update: the recipient's view before and after it, the update as sent and the frame's byte length. */
export function sizeUpdate(before, after, update, bytes) {
  const snapshot = before.snapshot === after.snapshot ? undefined : snapshotPatch(before.snapshot, after.snapshot);
  const carries = mergePatch(before.carries, after.carries, 'carries');
  const pointers = mergePatch(before.pointers, after.pointers, 'pointers');
  const activity = carries === undefined && pointers === undefined ? undefined : { carries, pointers };
  const envelope = {
    type: 'update',
    epoch: update.epoch,
    baseSequence: update.baseSequence,
    sequence: update.sequence,
    ...(update.completedCommandId === undefined ? {} : { completedCommandId: update.completedCommandId }),
    ...(update.snapshot ? { baseRevision: update.snapshot.baseRevision, revision: update.snapshot.revision } : {}),
  };
  const snapshotBytes = size(update.snapshot);
  const minimalSnapshotBytes = size(snapshot);
  const minimalActivityBytes = size(activity);
  return {
    kind: snapshot ? (activity ? 'both' : 'durable') : activity ? 'activity' : 'empty',
    acknowledged: update.completedCommandId !== undefined,
    bytes,
    snapshotBytes,
    pieceBytes: size(update.snapshot?.pieces),
    activityBytes: size(update.activity),
    minimalBytes: size(envelope) + minimalSnapshotBytes + minimalActivityBytes,
    minimalSnapshotBytes,
    minimalPieceBytes: size(snapshot?.table?.pieces),
    minimalActivityBytes,
  };
}

const counters = () => Object.fromEntries(COUNTERS.map((name) => [name, 0]));

function add(target, source) {
  for (const name of COUNTERS) {
    target[name] += source[name];
  }
}

function sum(entries) {
  const total = counters();
  for (const entry of entries) {
    add(total, entry);
  }
  return total;
}

const share = (sent, minimal) => (sent ? Number((1 - minimal / sent).toFixed(3)) : null);

/**
 * Aggregates sized updates per recipient class and states the repeated share of each byte category.
 * The first empty updates of each class are kept whole, so the report shows what an envelope without a visible change carried.
 */
export function updateLedger() {
  const classes = Object.create(null);
  const samples = Object.create(null);
  return {
    add(recipientClass, sizing, update) {
      const kinds = (classes[recipientClass] ??= Object.fromEntries(KINDS.map((kind) => [kind, counters()])));
      add(kinds[sizing.kind], { ...sizing, deliveries: 1, acknowledged: sizing.acknowledged ? 1 : 0 });
      const kept = (samples[recipientClass] ??= []);
      if (sizing.kind === 'empty' && kept.length < EMPTY_SAMPLES) {
        kept.push(update);
      }
    },
    summary(unclassified = 0) {
      const byRecipientClass = Object.fromEntries(
        Object.entries(classes).map(([name, kinds]) => [
          name,
          { ...kinds, total: sum(Object.values(kinds)), emptySamples: samples[name] },
        ])
      );
      const total = sum(Object.values(byRecipientClass).map((entry) => entry.total));
      const empty = Object.values(byRecipientClass).reduce((count, entry) => count + entry.empty.deliveries, 0);
      return {
        limitation:
          'Minimal sizes are a merge patch of the applied view under the same envelope: a lower bound for any patch over this view, before compression. Updates that arrived during a resync are unclassified.',
        unclassified,
        total,
        emptyDeliveryShare: total.deliveries ? Number((empty / total.deliveries).toFixed(3)) : null,
        repeatedShare: {
          all: share(total.bytes, total.minimalBytes),
          snapshot: share(total.snapshotBytes, total.minimalSnapshotBytes),
          pieces: share(total.pieceBytes, total.minimalPieceBytes),
          activity: share(total.activityBytes, total.minimalActivityBytes),
        },
        byRecipientClass,
      };
    },
  };
}

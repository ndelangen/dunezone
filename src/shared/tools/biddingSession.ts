import { z } from 'zod';

const id = z.string().min(1).max(160);
const count = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const whole = count.min(1);
const biddingSecondsSchema = z.union([z.literal(0), z.number().int().min(5).max(70).multipleOf(5)]);
const biddingFactionSchema = z.strictObject({
  id,
  name: z.string().min(1).max(160),
  src: z.string().max(2048).nullable().optional(),
  color: z.string().max(80).optional(),
  hand: count,
  limit: count,
  full: z.boolean(),
  pass: z.boolean(),
  peeks: z.boolean().optional(),
  paid: z.boolean().optional(),
});
export type BiddingFaction = z.infer<typeof biddingFactionSchema>;
const biddingRulesetSchema = z.strictObject({ id, name: z.string().min(1).max(160) });
const biddingDeckSchema = z.strictObject({ name: z.string().max(160), back: z.string().max(2048) });
const resumableStage = z.enum(['setup', 'ready', 'active', 'over']);
export const auctionStateSchema = z
  .strictObject({
    seats: z.array(biddingFactionSchema).min(2).max(24),
    ruleset: biddingRulesetSchema,
    deck: biddingDeckSchema.nullable(),
    stage: z.enum(['setup', 'ready', 'active', 'paused', 'over']),
    resumeStage: resumableStage.nullable(),
    turn: id.nullable(),
    opener: id.nullable(),
    starter: id,
    high: z.strictObject({ id, amount: whole }).nullable(),
    passed: z.array(id).max(24),
    cards: count,
    cardsChosen: z.boolean(),
    card: whole,
    phase: whole,
    results: z
      .array(z.strictObject({ phase: whole, card: whole, factionId: id, name: z.string().max(160), amount: whole }))
      .max(4096),
    seconds: biddingSecondsSchema,
    opportunity: count,
    note: z.string().max(1024),
  })
  .superRefine((state, ctx) => {
    const ids = new Set(state.seats.map((seat) => seat.id));
    if (ids.size !== state.seats.length || !ids.has(state.starter)) {
      ctx.addIssue({ code: 'custom', message: 'Seats and starter must identify distinct factions.' });
    }
    if ([state.turn, state.opener, state.high?.id, ...state.passed].some((entry) => entry != null && !ids.has(entry))) {
      ctx.addIssue({ code: 'custom', message: 'The auction refers to a faction outside this table.' });
    }
    if (new Set(state.passed).size !== state.passed.length || (state.stage === 'active' && state.turn === null)) {
      ctx.addIssue({ code: 'custom', message: 'The auction has invalid passes or no current bidder.' });
    }
    if ((state.stage === 'paused') !== (state.resumeStage !== null)) {
      ctx.addIssue({ code: 'custom', message: 'Paused auctions must record their previous stage.' });
    }
    const effectiveStage = state.stage === 'paused' ? state.resumeStage : state.stage;
    if (
      effectiveStage === 'active' &&
      (state.turn === null ||
        state.opener === null ||
        !state.cardsChosen ||
        state.card > state.cards ||
        state.turn === state.high?.id ||
        state.passed.includes(state.turn))
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'An active auction must identify its bidder, starter and current card.',
      });
    }
    if (effectiveStage !== 'active' && (state.turn !== null || state.high !== null || state.passed.length > 0)) {
      ctx.addIssue({ code: 'custom', message: 'A waiting or finished auction cannot contain an active bid.' });
    }
    if (effectiveStage === 'ready' && (state.opener === null || state.card > state.cards)) {
      ctx.addIssue({ code: 'custom', message: 'The next card must follow an existing auction within this phase.' });
    }
    const resultCards = new Set(state.results.map((result) => `${result.phase}:${result.card}`));
    if (
      resultCards.size !== state.results.length ||
      state.results.some(
        (result) => result.phase > state.phase || (result.phase === state.phase && result.card >= state.card)
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Completed wins must precede the current card and identify distinct auctions.',
      });
    }
  });
export type AuctionState = z.infer<typeof auctionStateSchema>;

export const biddingActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bid'), amount: whole }),
  z.strictObject({ type: z.literal('pass') }),
  z.strictObject({ type: z.literal('start') }),
  z.strictObject({ type: z.literal('reset') }),
  z.strictObject({ type: z.literal('resume') }),
  z.strictObject({ type: z.literal('pause') }),
  z.strictObject({ type: z.literal('next-phase') }),
  z.strictObject({ type: z.literal('select-starter'), id }),
  z.strictObject({ type: z.literal('edit-hand'), id, field: z.enum(['hand', 'limit']), value: count }),
  z.strictObject({ type: z.literal('edit-status'), id, field: z.enum(['full', 'pass']), value: z.boolean() }),
  z.strictObject({
    type: z.literal('configure'),
    seats: z.array(biddingFactionSchema).min(2).max(24).optional(),
    ruleset: biddingRulesetSchema.optional(),
    deck: biddingDeckSchema.nullable().optional(),
    cards: count.optional(),
    seconds: biddingSecondsSchema.optional(),
  }),
  z.strictObject({ type: z.literal('assign'), factionId: id.nullable() }),
]);
export type BiddingAction = z.infer<typeof biddingActionSchema>;
export type AuctionAction = Exclude<BiddingAction, { type: 'assign' }>;
export const biddingIdentitySchema = z.strictObject({
  tableId: id,
  code: z.string().min(1).max(32),
  centralInstanceId: id,
  generation: whole,
});
export type BiddingIdentity = z.infer<typeof biddingIdentitySchema>;
export const biddingContextSchema = biddingIdentitySchema
  .omit({ code: true })
  .extend({ opportunity: count, revision: count });
export type BiddingContext = z.infer<typeof biddingContextSchema>;
export const biddingCommandSchema = biddingContextSchema.extend({
  type: z.literal('command'),
  commandId: id,
  sequence: whole,
  action: biddingActionSchema,
});
export type BiddingCommand = z.infer<typeof biddingCommandSchema>;
const biddingRevisionStampsSchema = z.strictObject({
  hands: z.record(id, z.strictObject({ hand: count, limit: count, full: count, pass: count })),
  factionClaims: z.record(id, count),
  deviceClaims: z.record(id, count),
  setup: count,
});
export type BiddingRevisionStamps = z.infer<typeof biddingRevisionStampsSchema>;

/** Each new central generation starts with no edits older than its first snapshot. */
export function initialBiddingRevisionStamps(
  auction: AuctionState,
  revision = 0,
  assignments: Readonly<Record<string, string>> = {}
): BiddingRevisionStamps {
  return {
    hands: Object.fromEntries(
      auction.seats.map(({ id }) => [id, { hand: revision, limit: revision, full: revision, pass: revision }])
    ),
    factionClaims: Object.fromEntries(auction.seats.map(({ id }) => [id, revision])),
    deviceClaims: Object.fromEntries(Object.keys(assignments).map((id) => [id, revision])),
    setup: revision,
  };
}
export const biddingSnapshotSchema = biddingIdentitySchema
  .extend({
    version: z.literal(1),
    revision: count,
    auction: auctionStateSchema,
    assignments: z.record(id, id),
    commandSequences: z.record(id, count),
    revisions: biddingRevisionStampsSchema,
  })
  .superRefine((snapshot, ctx) => {
    const assigned = Object.values(snapshot.assignments);
    if (
      assigned.length > 24 ||
      new Set(assigned).size !== assigned.length ||
      assigned.some((factionId) => !snapshot.auction.seats.some((seat) => seat.id === factionId))
    ) {
      ctx.addIssue({ code: 'custom', message: 'Phone assignments must each identify a different faction.' });
    }
    if (Object.keys(snapshot.commandSequences).length > 128) {
      ctx.addIssue({ code: 'custom', message: 'This table has too many command senders.' });
    }
    const seats = new Set(snapshot.auction.seats.map((seat) => seat.id));
    const revisions = snapshot.revisions;
    if (
      Object.keys(revisions.hands).length !== seats.size ||
      Object.keys(revisions.factionClaims).length !== seats.size ||
      Object.keys(revisions.hands).some((id) => !seats.has(id)) ||
      Object.keys(revisions.factionClaims).some((id) => !seats.has(id)) ||
      Object.keys(revisions.deviceClaims).length > 128 ||
      Object.keys(snapshot.assignments).some((deviceId) => !(deviceId in revisions.deviceClaims)) ||
      [
        revisions.setup,
        ...Object.values(revisions.hands).flatMap((fields) => Object.values(fields)),
        ...Object.values(revisions.factionClaims),
        ...Object.values(revisions.deviceClaims),
      ].some((revision) => revision > snapshot.revision)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Edit revisions must identify this table and its current state.' });
    }
  });
export type BiddingSnapshot = z.infer<typeof biddingSnapshotSchema>;
export const biddingResultSchema = z.strictObject({
  type: z.literal('result'),
  commandId: id,
  accepted: z.boolean(),
  reason: z.string().max(1024),
  revision: count,
  opportunity: count,
});
export type BiddingResult = z.infer<typeof biddingResultSchema>;
export const biddingPublicationSchema = z.strictObject({
  type: z.literal('state'),
  snapshot: biddingSnapshotSchema,
  deadline: count.nullable(),
  sentAt: count,
});
export type BiddingPublication = z.infer<typeof biddingPublicationSchema>;
export const BIDDING_SNAPSHOT_BYTES = 196_608;

/** Rejects oversized or incomplete snapshots before they can replace a recovery copy. */
export function parseBiddingSnapshot(value: unknown): BiddingSnapshot | null {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > BIDDING_SNAPSHOT_BYTES) {
      return null;
    }
    const parsed = biddingSnapshotSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

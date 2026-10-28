import { dealSeats, draftGates, isDraftAction, resolveFactionPool } from '@shared/play/drafting';
import type { DraftAction } from '@shared/play/drafting';
import { isSeatAction } from '@shared/play/participation';
import type { SeatAction } from '@shared/play/participation';
import type { GameSnapshot, Viewer } from '@shared/play/protocol';
import { isRemovalAction } from '@shared/play/removal';
import type { RemovalAction, RemovalVote } from '@shared/play/removal';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { TableRoster } from '@shared/play/schema';
import { isSwapAction } from '@shared/play/swapping';
import type { SwapAction } from '@shared/play/swapping';

import { ActorDirectory } from '../../../../../../workers/game/actors';
import { applyDraftAction, dealtSnapshot } from '../../../../../../workers/game/drafting';
import { PublicLog, logContext } from '../../../../../../workers/game/log';
import { ownRequests, Participation } from '../../../../../../workers/game/participation';
import { RemovalVotes } from '../../../../../../workers/game/removal';
import { TableReviews } from '../../../../../../workers/game/review';
import { SessionHistory } from '../../../../../../workers/game/sessionHistory';
import type { SetupSupply } from '../../../../../../workers/game/setup';
import { SpiceLedger } from '../../../../../../workers/game/spiceLedger';
import type { StoredSnapshot } from '../../../../../../workers/game/state';
import { Swapping } from '../../../../../../workers/game/swapping';
import { MemorySql } from './memorySql';
import type { MemoryActor } from './memorySql';
import { randomInt } from './nodeCrypto';

/*
 * The part of the game Worker's session that comes before the table: who sits where, the draft and its deal, trading, and seat requests.
 * The Worker's own `ActorDirectory`, `Participation`, `Swapping` and draft steps run on an in-memory copy of the room's storage
 * (`MemorySql`), so the tutorial's lobby chapters play by the same rules as a real game.
 * Two things differ, both because a tutorial has no catalogue server behind it:
 * the deal gives every seat what the recorded setup gave it, so the learner always plays the faction the later chapters expect,
 * whenever the drafted pool and the seats are the ones recorded; and when trading closes the game waits there,
 * since building the setup table needs the published faction content the Worker captures.
 */

/** The action families this session commits, which the table alone refuses. */
export type SessionAction = DraftAction | SeatAction | SwapAction | RemovalAction;
export const isSessionAction = (action: { kind: string }): action is SessionAction =>
  isDraftAction(action) || isSeatAction(action) || isSwapAction(action) || isRemovalAction(action);

/** A seat's faction and station as the recorded deal gave them, with the faction token trading shows. */
export type RecordedDeal = readonly { seat: string; factionId: string; position: number; token?: string }[];

export type SessionStart = Readonly<{
  stored: StoredSnapshot;
  /** Everyone at the table, spectators included, as the recording admitted them. */
  viewers: readonly Viewer[];
  players: NonNullable<GameSnapshot['controls']>['players'];
  minimumPlayers: number;
  deal: RecordedDeal;
  logOffset?: number;
}>;

/* Building the setup table needs the captured faction content, so trading ends with the game waiting at the table. */
const NO_SUPPLY = { enter: (snapshot: StoredSnapshot) => snapshot } as unknown as SetupSupply;

export class LocalSession {
  private readonly sql: MemorySql;
  readonly actors: ActorDirectory;
  readonly log: PublicLog;
  readonly history: SessionHistory;
  readonly reviews: TableReviews;
  currentSnapshot: StoredSnapshot;
  readonly participation: Participation;
  readonly swapping: Swapping;
  private readonly removal: RemovalVotes;
  private readonly minimumPlayers: number;
  private readonly deal: RecordedDeal;
  private seatCount: TableRoster['seatCount'];

  constructor(start: SessionStart) {
    const { stored } = start;
    this.currentSnapshot = stored;
    const profiles = new Map(start.players.map((player) => [player.seat, player]));
    const actors: MemoryActor[] = start.viewers.map((viewer) => ({
      user_id: viewer.userId,
      seat: viewer.viewerSeat,
      display_name: viewer.displayName,
      deleted: 0,
      avatar_url: profiles.get(viewer.viewerSeat)?.avatar ?? null,
      profile_slug: profiles.get(viewer.viewerSeat)?.slug ?? null,
    }));
    const seats = (stored.roster?.seats ?? []).map((seat) => ({
      seat: seat.id,
      position: seat.position,
      faction_id: seat.faction?.id ?? null,
      faction_name: seat.faction?.name ?? null,
      faction_color: seat.faction?.color ?? null,
    }));
    this.sql = new MemorySql(actors, seats);
    this.sql.logOffset = start.logOffset ?? 0;
    const storage = this.sql.storage();
    this.log = new PublicLog(storage, () => logContext(this.currentSnapshot));
    this.log.enabled = stored.stage !== undefined;
    this.actors = new ActorDirectory(storage, this.log);
    this.participation = new Participation(storage, this.actors);
    this.swapping = new Swapping(storage, this.actors, NO_SUPPLY, this.log);
    this.removal = new RemovalVotes(storage, this.actors, this.log);
    this.history = new SessionHistory(storage, this.actors, new SpiceLedger(storage));
    this.history.seed(stored);
    this.history.accept(0, stored);
    this.reviews = new TableReviews(storage, this.actors, this.log);
    this.minimumPlayers = start.minimumPlayers;
    this.deal = start.deal;
    this.seatCount = stored.roster?.seatCount ?? (seats.length as TableRoster['seatCount']);
  }

  /** The seat a user holds now; a spectator's is the spectator seat. */
  seatOf(userId: string): Viewer['viewerSeat'] {
    return this.actors.seatFor(userId) ?? SPECTATOR_SEAT;
  }

  /** The faction a user controls through their seat, once the deal has given seats their factions. */
  factionOf(userId: string): string | undefined {
    const seat = this.seatOf(userId);
    return this.sql.seats.find((row) => row.seat === seat)?.faction_id ?? undefined;
  }

  /** Who sits where by name and avatar, and for a spectator, which pending request is theirs, as the session adds them for each viewer. */
  forViewer(controls: NonNullable<GameSnapshot['controls']>, viewer: Viewer): NonNullable<GameSnapshot['controls']> {
    const own = viewer.viewerSeat === SPECTATOR_SEAT ? this.participation.pendingRequestId(viewer.userId) : undefined;
    return { ...controls, players: this.actors.holders(), seatRequests: ownRequests(controls.seatRequests, own) };
  }

  /** The stored state with the seating as it now stands, as the session composes every commit. */
  withRoster(snapshot: StoredSnapshot): StoredSnapshot {
    return { ...snapshot, roster: this.actors.roster(this.seatCount) };
  }

  /** The removal votes still open, as every player sees them. */
  removalVotes(): RemovalVote[] {
    return this.removal.current();
  }

  /** One drafting, seat, trading or removal command, applied as the session commits it; a completed draft deals at once. */
  commit(snapshot: StoredSnapshot, viewer: Viewer, action: SessionAction, now: number): StoredSnapshot {
    if (isRemovalAction(action)) {
      return this.withRoster(this.reconcileVotes(this.removal.apply(snapshot, viewer, action, now), now));
    }
    if (isDraftAction(action)) {
      const drafted = this.withRoster(
        applyDraftAction(snapshot, viewer, action, this.actors.seats(), this.minimumPlayers)
      );
      return this.dealIfReady(drafted, now);
    }
    if (isSwapAction(action)) {
      return this.reconcileVotes(
        this.withRoster(
          this.swapping.apply({ snapshot, viewer, action, commandId: `local-${snapshot.revision + 1}`, now })
        ),
        now
      );
    }
    const occupants = this.actors.seated();
    const plan = this.participation.plan(action, {
      viewer,
      snapshot,
      roster: this.actors.roster(this.seatCount),
      now,
    });
    const participated = plan.apply();
    const settled = this.swapping.settleParticipation(
      {
        before: snapshot,
        after: participated,
        commandId: `local-${snapshot.revision + 1}`,
        actor: viewer.userId,
        occupants,
      },
      () => now
    );
    this.seatCount = Math.max(this.seatCount, this.sql.seats.length) as TableRoster['seatCount'];
    return this.withRoster(this.reconcileVotes(settled, now));
  }

  /*
   * After every seat, trading or removal commit, as the session reconciles them: a ballot can decide a vote, a vote
   * whose target has left lapses, and a removal vacates the seat as the session's own removal does.
   */
  private reconcileVotes(snapshot: StoredSnapshot, now: number): StoredSnapshot {
    return this.removal.reconcile(snapshot, now, (before, userId, commandId) => {
      const occupants = this.actors.seated();
      const after = this.participation.remove(userId, before, now);
      return this.swapping.settleParticipation({ before, after, commandId, actor: null, occupants }, () => now);
    });
  }

  /** Trading closes on its deadline as the session's alarm closes it. */
  expireTrading(snapshot: StoredSnapshot, now: number): StoredSnapshot | undefined {
    const trading = snapshot.swapping;
    if (snapshot.stage !== 'swapping' || !trading || trading.closed || now < trading.deadline) {
      return undefined;
    }
    return this.withRoster(this.swapping.reconcile(snapshot, { commandId: 'local-deadline', now, actor: null }));
  }

  /*
   * The deal, once every gate the Worker waits on is met. A pool and seating the recording dealt are dealt as it dealt them;
   * any other draft deals at random, as a real game does.
   */
  private dealIfReady(snapshot: StoredSnapshot, now: number): StoredSnapshot {
    const draft = snapshot.draft;
    const seated = this.actors.seats();
    if (snapshot.stage !== 'drafting' || !draft) {
      return snapshot;
    }
    const gates = draftGates(draft, seated, this.minimumPlayers);
    if (!gates.minimumMet || !gates.allReady || !gates.enoughFactions) {
      return snapshot;
    }
    const random = (n: number) => randomInt(n);
    const factions = resolveFactionPool(draft, seated.length, random);
    if (!factions) {
      return snapshot;
    }
    const recorded =
      this.deal.length === seated.length &&
      this.deal.every((entry) => seated.includes(entry.seat) && factions.includes(entry.factionId));
    const deal = recorded ? this.deal : dealSeats(seated, factions, random);
    for (const entry of deal) {
      const faction = draft.factions.find((candidate) => candidate.id === entry.factionId)!;
      Object.assign(
        this.sql.seats.find((row) => row.seat === entry.seat)!,
        {
          position: entry.position,
          faction_id: faction.id,
          faction_name: faction.name,
          faction_color: faction.color,
        }
      );
    }
    this.seatCount = seated.length as TableRoster['seatCount'];
    /* The recording's tokens stand in for the faction captures a game reads them from. */
    const tokens = Object.fromEntries(
      deal.flatMap((entry) => {
        const token = this.deal.find((recordedEntry) => recordedEntry.factionId === entry.factionId)?.token;
        return token ? [[entry.seat, token]] : [];
      })
    );
    return this.withRoster(
      dealtSnapshot(snapshot, draft, deal, {
        seats: this.actors.seats(),
        tokens,
        closeRosterRequests: (controls, at) => this.participation.closeRosterRequests(controls, at),
        now,
      })
    );
  }
}

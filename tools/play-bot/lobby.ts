/*
 * The bot's part before factions are dealt, and while seats trade them. Play has no chat until a seat holds a faction, so
 * nobody can ask the bot anything yet: it follows fixed rules instead.
 * - Drafting: it picks the faction it wants (if any) and confirms Ready, again whenever a change clears its readiness.
 * - Trading: if the deal gave it another faction, it offers a swap to the seat holding the one it wants and accepts that
 *   seat's offer; once it holds what it wants (or wants nothing in particular), it keeps its faction.
 * It never creates a game, never bans, and never trades with a seat that does not hold the faction it asked for.
 */
import type { PieceAction } from '../../src/shared/play/protocol';
import type { PlayBot } from './bot';

/** A faction name matches what the bot wants when it names it, ignoring case and a publisher prefix ("GF9 Fremen"). */
export function namesFaction(name: string, want: string) {
  const plain = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
  const wanted = plain(want);
  return plain(name) === wanted || plain(name).split(' ').includes(wanted) || plain(name).endsWith(` ${wanted}`);
}

export class Lobby {
  private busy = false;
  private lastKey = '';

  constructor(
    private readonly bot: PlayBot,
    private readonly want: string | undefined
  ) {}

  /** Looks at the latest view and takes at most one lobby step; called on every view change. */
  tick() {
    if (this.busy) {
      return;
    }
    const action = this.next();
    if (!action) {
      return;
    }
    /* The same step is not repeated for the same view: a refusal waits for the table to change. */
    const key = `${this.bot.view.snapshot?.revision}:${JSON.stringify(action)}`;
    if (key === this.lastKey) {
      return;
    }
    this.lastKey = key;
    this.busy = true;
    void this.bot
      .command(action)
      .then((result) => this.bot.log(`> Lobby: ${action.kind} ${result.ok ? 'done' : `refused: ${result.message}`}`))
      .catch((error: unknown) => this.bot.log(`> Lobby: ${action.kind} failed: ${String(error)}`))
      .finally(() => {
        this.busy = false;
        this.tick();
      });
  }

  private next(): PieceAction | undefined {
    const view = this.bot.view.current;
    const seat = view?.viewer.viewerSeat;
    const snapshot = view?.snapshot;
    if (!snapshot || !seat || !snapshot.roster?.seats.some((entry) => entry.id === seat)) {
      return undefined;
    }
    if (snapshot.stage === 'drafting' && snapshot.draft) {
      const draft = snapshot.draft;
      const wanted = this.want
        ? draft.factions.find((faction) => faction.published && namesFaction(faction.name, this.want!))
        : undefined;
      if (wanted && !(draft.picks[seat] ?? []).includes(wanted.id)) {
        return { kind: 'draft-pick', factionId: wanted.id };
      }
      return draft.ready.includes(seat) ? undefined : { kind: 'draft-ready', ready: true };
    }
    if (snapshot.stage === 'swapping' && snapshot.swapping && !snapshot.swapping.closed) {
      const { round, offers, ready } = snapshot.swapping;
      const mine = snapshot.roster.seats.find((entry) => entry.id === seat)?.faction;
      const holder = this.want
        ? snapshot.roster.seats.find((entry) => entry.faction && namesFaction(entry.faction.name, this.want!))
        : undefined;
      const happy = !this.want || !holder || holder.id === seat || (mine && namesFaction(mine.name, this.want));
      if (happy) {
        return ready.includes(seat) ? undefined : { kind: 'swap-ready', round, seat, ready: true };
      }
      if (ready.includes(seat)) {
        return { kind: 'swap-ready', round, seat, ready: false };
      }
      const incoming = offers.find((offer) => offer.origin === holder.id && offer.target === seat);
      if (incoming) {
        return { kind: 'swap-accept', round, seat, offerId: incoming.id };
      }
      const sent = offers.some((offer) => offer.origin === seat && offer.target === holder.id);
      return sent ? undefined : { kind: 'swap-offer', round, seat, target: holder.id };
    }
    return undefined;
  }
}

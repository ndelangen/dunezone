import type { BiddingAction, BiddingContext, BiddingFaction, BiddingSnapshot } from '@shared/tools/biddingSession';

import type { readBiddingFaction, readBiddingSetup } from '@db/biddingTool';

import type { AuctionSetup } from './auction';
import { biddingContextOf } from './session';

type Setup = NonNullable<Awaited<ReturnType<typeof readBiddingSetup>>>;
type Faction = NonNullable<Awaited<ReturnType<typeof readBiddingFaction>>>;

function seatFrom({ initialHand, ...seat }: Faction): BiddingFaction {
  return { ...seat, hand: initialHand, limit: 4, full: initialHand >= 4, pass: false };
}

export function auctionSetupFrom(setup: Setup): AuctionSetup {
  return {
    seats: setup.seats.map(seatFrom),
    ruleset: { id: setup.ruleset.id, name: setup.ruleset.name },
    deck: setup.deck?.back ? { name: setup.deck.name, back: setup.deck.back } : null,
  };
}

/** A catalogue response belongs to the setup that requested it, even while a newer choice loads. */
export class BiddingSetupRequests {
  private request = 0;

  constructor(
    private readonly options: {
      current: () => BiddingSnapshot | null;
      apply: (action: BiddingAction, context: BiddingContext) => void;
      status: (state: { loading: boolean; error: string | null }) => void;
    }
  ) {}

  async ruleset(read: () => Promise<Setup | null>): Promise<void> {
    await this.load(read, (setup) => {
      if (!setup || setup.seats.length < 2) {
        throw new Error('This ruleset needs at least two factions.');
      }
      const configured = auctionSetupFrom(setup);
      return { type: 'configure', seats: [...configured.seats], ruleset: configured.ruleset, deck: configured.deck };
    });
  }

  async faction(read: () => Promise<Faction | null>): Promise<void> {
    await this.load(read, (faction, snapshot) => {
      if (!faction) {
        throw new Error('The faction could not be loaded.');
      }
      if (snapshot.auction.seats.some((seat) => seat.id === faction.id)) {
        return null;
      }
      return { type: 'configure', seats: [...snapshot.auction.seats, seatFrom(faction)] };
    });
  }

  private async load<T>(read: () => Promise<T>, action: (value: T, snapshot: BiddingSnapshot) => BiddingAction | null) {
    const id = ++this.request;
    const before = this.options.current();
    if (!before) {
      return;
    }
    this.options.status({ loading: true, error: null });
    try {
      const value = await read();
      if (id !== this.request) {
        return;
      }
      const current = this.options.current();
      if (
        !current ||
        current.tableId !== before.tableId ||
        current.centralInstanceId !== before.centralInstanceId ||
        current.generation !== before.generation ||
        current.revision !== before.revision
      ) {
        throw new Error('The table changed while the catalogue loaded. Choose again.');
      }
      const update = action(value, current);
      if (update) {
        this.options.apply(update, biddingContextOf(before));
      }
      this.options.status({ loading: false, error: null });
    } catch (error) {
      if (id === this.request) {
        this.options.status({
          loading: false,
          error: error instanceof Error ? error.message : 'The catalogue could not be loaded.',
        });
      }
    }
  }
}

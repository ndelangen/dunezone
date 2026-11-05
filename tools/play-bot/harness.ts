/*
 * The seat harness: one process that holds any number of seats and serves all their tools as one MCP server.
 * Joining a game takes a seat as a person's page does (the table sees the request and approves it) and hands back a
 * seat token. The agent CLI that thinks for a seat connects to this server's `/mcp` with that token in its connection
 * header, so the model acts only through its own seat and never sees the token. Each seat keeps its own memory, notes
 * and log, built only from what its seat sees; nothing tells one seat about another.
 *
 * Today it runs on this machine (the launcher page, `play:bot:watch`, hosts it). The same shape could later run in the
 * game Worker, at a per-seat address behind the seat pass, so players bring their own model.
 */
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { claudeBrain, codexBrain } from './brains';
import { claimAccount, releaseAccount } from './claims';
import { joinSeat } from './seat';
import type { Seat, Stack } from './seat';
import { serveSeatRequest } from './tool-server';

export type SeatState = {
  id: string;
  name: string;
  want: string;
  /** Why the seat is not playing: it failed to join, or the game or the person stopped it. */
  ended?: string;
};

type Held = SeatState & { token: string; seat?: Seat };

export class Harness {
  private readonly seats = new Map<string, Held>();

  /** `url` is this server's own address, which each seat's CLI connects back to. */
  constructor(private readonly url: () => string) {}

  /**
   * Takes a seat with a stack account no other harness on this machine holds (the one asked for, else the first free);
   * returns at once, and the seat's status shows how joining goes.
   */
  join(options: { stack: Stack; game: string; account?: number; want: string; brain: 'claude' | 'codex' }) {
    const { account: number, id } = claimAccount(options.stack, this.url(), options.account);
    const account = options.stack.accounts.bots![number - 1]!;
    const held: Held = { id, name: account.name, want: options.want, token: randomBytes(24).toString('base64url') };
    this.seats.set(id, held);
    const end = (why: string) => {
      held.ended ??= why;
      releaseAccount(id);
    };
    /* The CLI reaches this seat through the harness, with the seat's token in its connection header. */
    const tools = async () => ({ url: this.url(), token: held.token, close: async () => undefined });
    void joinSeat({
      stack: options.stack,
      game: options.game,
      account: number,
      want: options.want,
      brain: (workdir) => (options.brain === 'codex' ? codexBrain({ workdir, tools }) : claudeBrain({ workdir, tools })),
      onClose: (code, reason) => end(`the game closed the connection (${code}${reason ? ` ${reason}` : ''})`),
    }).then(
      (seat) => {
        held.seat = seat;
        if (held.ended) {
          seat.stop();
        }
      },
      (error: unknown) => end(error instanceof Error ? error.message : String(error))
    );
    return held;
  }

  stop(id: string) {
    const held = this.seats.get(id);
    if (held && !held.ended) {
      held.ended = 'stopped';
      held.seat?.stop();
      releaseAccount(id);
    }
  }

  stopAll() {
    for (const id of this.seats.keys()) {
      this.stop(id);
    }
  }

  /** Whether this harness already plays a seat that wants `faction`, so pressing Start twice adds no second one. */
  playing(faction: string) {
    return [...this.seats.values()].some((seat) => !seat.ended && seat.want.toLowerCase() === faction.toLowerCase());
  }

  states(): SeatState[] {
    return [...this.seats.values()].map(({ id, name, want, ended }) => ({ id, name, want, ...(ended ? { ended } : {}) }));
  }

  /** The seat's MCP and tool requests: `/mcp`, `/tools` and `/call`, each naming its seat by token. */
  serve(request: IncomingMessage, response: ServerResponse) {
    return serveSeatRequest(request, response, (token) => {
      const held = [...this.seats.values()].find((entry) => entry.token === token && !entry.ended);
      return held?.seat?.bot;
    });
  }
}

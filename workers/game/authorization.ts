import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

import {
  PLAY_AUTH_LEASE_MS,
  PLAY_AUTH_RENEWAL_MS,
  PLAY_REQUEST_TIMEOUT_MS,
  PLAY_WATCH_AUTHORIZATIONS_FUNCTION,
  playWatchAuthorizationsResultSchema,
} from '../../src/shared/play/admission';

export function gameHttpClient(url: string): ConvexHttpClient {
  return new ConvexHttpClient(url, {
    logger: false,
    fetch: async (input, init) => {
      const response = await fetch(input, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(PLAY_REQUEST_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error('Authorization unavailable.');
      }
      return response;
    },
  });
}

type Principal = { userId: string; sessionId: string };
type Authorization = Principal & { fresh: boolean; denied: boolean; expiresAt: number; leaseUntil: number };
const watch = makeFunctionReference<'query'>(PLAY_WATCH_AUTHORIZATIONS_FUNCTION);

/** Auth grants are memory-only. Both a fresh watch and an uncached validation lease are required. */
export class AuthorizationWatch {
  private readonly entries = new Map<string, Authorization>();
  private client: ConvexClient | undefined;
  private unsubscribe: (() => void) | undefined;
  private unsubscribeConnection: (() => void) | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private generation = '';
  private observation = 0;
  private requestSequence = 0;
  private acceptedRequestSequence = 0;
  private connectionCount = 0;
  private connected = false;
  private disposed = false;
  private needsFreshWatch = false;

  constructor(
    private readonly url: string,
    private readonly credentials: { gameId: string; secret: string },
    private readonly changed: () => void
  ) {}

  add(registrationId: string, principal: Principal) {
    if (this.disposed) {
      throw new Error('Authorization watch is closed.');
    }
    const previous = this.entries.get(registrationId);
    if (previous) {
      if (previous.userId !== principal.userId || previous.sessionId !== principal.sessionId || previous.denied) {
        throw new Error('Admission refused.');
      }
      return;
    }
    this.entries.set(registrationId, { ...principal, fresh: false, denied: false, expiresAt: 0, leaseUntil: 0 });
    if (!this.client) {
      this.client = new ConvexClient(this.url, {
        logger: false,
        unsavedChangesWarning: false,
        reportDebugInfoToConvex: false,
      });
      this.unsubscribeConnection = this.client.subscribeToConnectionState((state) => {
        if (this.disposed) {
          return;
        }
        this.connected = state.isWebSocketConnected;
        if (!this.connected) {
          this.suspend();
        } else if (state.connectionCount !== this.connectionCount) {
          this.connectionCount = state.connectionCount;
          this.startGeneration();
        }
      });
      this.interval = setInterval(() => {
        void this.renew();
      }, PLAY_AUTH_RENEWAL_MS);
    }
    this.startGeneration();
  }

  remove(registrationId: string) {
    if (!this.entries.delete(registrationId)) {
      return;
    }
    this.startGeneration();
  }

  status(registrationId: string, now = Date.now()): 'authorized' | 'suspended' | 'denied' {
    const entry = this.entries.get(registrationId);
    if (entry?.denied) {
      return 'denied';
    }
    return entry && this.connected && entry.fresh && now < entry.expiresAt && now < entry.leaseUntil
      ? 'authorized'
      : 'suspended';
  }

  private suspend() {
    this.needsFreshWatch = true;
    this.observation++;
    for (const entry of this.entries.values()) {
      entry.fresh = false;
      entry.leaseUntil = 0;
    }
    this.changed();
  }

  private startGeneration() {
    this.generation = crypto.randomUUID();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.suspend();
    this.needsFreshWatch = false;
    if (!this.client || !this.connected || !this.entries.size) {
      return;
    }
    const generation = this.generation;
    const registrationIds = [...this.entries.keys()].sort();
    const args = { ...this.credentials, generation, registrationIds };
    this.unsubscribe = this.client.onUpdate(
      watch,
      args,
      (raw: unknown) => {
        if (this.disposed || generation !== this.generation || !this.connected) {
          return;
        }
        this.observation++;
        this.observe(raw, generation, registrationIds);
        void this.renew();
      },
      () => {
        if (generation === this.generation) {
          this.suspend();
        }
      }
    );
    void this.renew();
  }

  private observe(raw: unknown, generation: string, ids: string[], requestStartedAt?: number) {
    const parsed = playWatchAuthorizationsResultSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.ok || parsed.data.generation !== generation) {
      this.suspend();
      return false;
    }
    const result = parsed.data.entries;
    if (
      result.length !== ids.length ||
      new Set(result.map((entry) => entry.registrationId)).size !== ids.length ||
      result.some((entry) => !ids.includes(entry.registrationId))
    ) {
      this.suspend();
      return false;
    }
    for (const value of result) {
      const entry = this.entries.get(value.registrationId);
      if (!entry || entry.denied) {
        continue;
      }
      if (
        !value.allowed ||
        value.userId !== entry.userId ||
        value.sessionId !== entry.sessionId ||
        value.authExpiresAt <= Date.now()
      ) {
        entry.denied = true;
        entry.leaseUntil = 0;
        continue;
      }
      entry.expiresAt = value.authExpiresAt;
      if (requestStartedAt === undefined) {
        entry.fresh = true;
      } else {
        entry.leaseUntil = Math.min(requestStartedAt + PLAY_AUTH_LEASE_MS, value.authExpiresAt);
      }
    }
    this.changed();
    return true;
  }

  private async renew() {
    if (this.disposed || !this.connected || !this.entries.size) {
      return;
    }
    if (this.needsFreshWatch) {
      this.startGeneration();
      return;
    }
    const generation = this.generation;
    const observation = this.observation;
    const sequence = ++this.requestSequence;
    const registrationIds = [...this.entries.keys()].sort();
    const requestStartedAt = Date.now();
    try {
      const result: unknown = await gameHttpClient(this.url).query(watch, {
        ...this.credentials,
        generation,
        registrationIds,
      });
      if (
        this.disposed ||
        !this.connected ||
        generation !== this.generation ||
        observation !== this.observation ||
        sequence !== this.requestSequence
      ) {
        return;
      }
      if (this.observe(result, generation, registrationIds, requestStartedAt)) {
        this.acceptedRequestSequence = sequence;
      }
    } catch {
      if (!this.disposed && generation === this.generation && sequence > this.acceptedRequestSequence) {
        this.suspend();
      }
    }
  }

  async close() {
    this.disposed = true;
    this.generation = '';
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.unsubscribe?.();
    this.unsubscribeConnection?.();
    await this.client?.close();
    this.entries.clear();
  }
}

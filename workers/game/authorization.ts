import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import type { ConnectionState } from 'convex/browser';
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
type AuthorizationValue = Extract<
  ReturnType<typeof playWatchAuthorizationsResultSchema.parse>,
  { ok: true }
>['entries'][number];
type AuthorizationStatus = 'authorized' | 'suspended' | 'denied';
type ValidationRequest = {
  generation: string;
  observation: number;
  sequence: number;
  registrationIds: string[];
  startedAt: number;
};
const watch = makeFunctionReference<'query'>(PLAY_WATCH_AUTHORIZATIONS_FUNCTION);

function samePrincipal(left: Principal, right: Pick<AuthorizationValue, 'userId' | 'sessionId'>) {
  return left.userId === right.userId && left.sessionId === right.sessionId;
}

class AuthorizationGrant {
  private freshRound = 0;
  private validatedRound = 0;
  private denied = false;
  private expiresAt = 0;
  private leaseUntil = 0;

  constructor(private readonly principal: Principal) {}

  canReuse(principal: Principal) {
    return !this.denied && samePrincipal(this.principal, principal);
  }

  restart(preserveGrant: boolean) {
    this.freshRound = 0;
    if (!preserveGrant) {
      this.validatedRound = 0;
      this.leaseUntil = 0;
    }
  }

  status(now: number, minimumRound: number): AuthorizationStatus {
    if (this.denied) {
      return 'denied';
    }
    if (this.validatedRound < minimumRound) {
      return 'suspended';
    }
    return now < Math.min(this.expiresAt, this.leaseUntil) ? 'authorized' : 'suspended';
  }

  observe(value: AuthorizationValue, round: number, requestStartedAt?: number) {
    if (this.denied) {
      return true;
    }
    if (!value.allowed || !samePrincipal(this.principal, value)) {
      this.denied = true;
      this.leaseUntil = 0;
      return true;
    }
    if (value.authExpiresAt <= Date.now()) {
      this.expire(round, requestStartedAt);
      return false;
    }
    this.expiresAt = value.authExpiresAt;
    this.validate(round, requestStartedAt);
    return true;
  }

  private expire(round: number, requestStartedAt?: number) {
    this.freshRound = round;
    this.validatedRound = 0;
    this.leaseUntil = 0;
    if (requestStartedAt !== undefined) {
      this.denied = true;
    }
  }

  private validate(round: number, requestStartedAt?: number) {
    if (requestStartedAt === undefined) {
      this.freshRound = round;
    } else if (this.freshRound === round) {
      this.leaseUntil = Math.min(requestStartedAt + PLAY_AUTH_LEASE_MS, this.expiresAt);
      this.validatedRound = round;
    }
  }
}

function completeAuthorizationBatch(raw: unknown, generation: string, ids: string[]) {
  const parsed = playWatchAuthorizationsResultSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.ok) {
    return null;
  }
  const result = parsed.data;
  if (result.generation !== generation || result.entries.length !== ids.length) {
    return null;
  }
  const remaining = new Set(ids);
  return result.entries.every((entry) => remaining.delete(entry.registrationId)) ? result.entries : null;
}

/** Auth grants are memory-only. Both a fresh watch and an uncached validation lease are required. */
export class AuthorizationWatch {
  private readonly entries = new Map<string, AuthorizationGrant>();
  private client: ConvexClient | undefined;
  private unsubscribe: (() => void) | undefined;
  private unsubscribeConnection: (() => void) | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private generation = '';
  private round = 0;
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
      if (!previous.canReuse(principal)) {
        throw new Error('Admission refused.');
      }
    } else {
      this.entries.set(registrationId, new AuthorizationGrant({ ...principal }));
    }
    this.ensureClient();
    this.startGeneration(true);
    return this.round;
  }

  private ensureClient() {
    if (this.client) {
      return;
    }
    this.client = new ConvexClient(this.url, {
      logger: false,
      unsavedChangesWarning: false,
      reportDebugInfoToConvex: false,
    });
    this.unsubscribeConnection = this.client.subscribeToConnectionState((state) => this.connectionChanged(state));
    this.interval = setInterval(() => {
      void this.renew();
    }, PLAY_AUTH_RENEWAL_MS);
  }

  private connectionChanged(state: ConnectionState) {
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
  }

  remove(registrationId: string) {
    if (!this.entries.delete(registrationId)) {
      return;
    }
    this.startGeneration(true);
  }

  status(registrationId: string, now = Date.now(), minimumRound = 0): AuthorizationStatus {
    const status = this.entries.get(registrationId)?.status(now, minimumRound) ?? 'suspended';
    if (status === 'authorized' && !this.connected) {
      return 'suspended';
    }
    return status;
  }

  private suspend() {
    this.needsFreshWatch = true;
    this.observation++;
    for (const entry of this.entries.values()) {
      entry.restart(false);
    }
    this.changed();
  }

  private startGeneration(preserveGrants = false) {
    this.generation = crypto.randomUUID();
    this.round++;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.observation++;
    for (const entry of this.entries.values()) {
      entry.restart(true);
    }
    if (!preserveGrants) {
      this.suspend();
    }
    this.needsFreshWatch = false;
    if (!this.client || !this.canRenew()) {
      return;
    }
    this.subscribeGeneration(this.client);
    void this.renew();
  }

  private registrationIds() {
    return [...this.entries.keys()].sort((left, right) => left.localeCompare(right));
  }

  private isConnectedGeneration(generation: string) {
    if (this.disposed || !this.connected) {
      return false;
    }
    return generation === this.generation;
  }

  private subscribeGeneration(client: ConvexClient) {
    const generation = this.generation;
    const registrationIds = this.registrationIds();
    const args = { ...this.credentials, generation, registrationIds };
    this.unsubscribe = client.onUpdate(
      watch,
      args,
      (raw: unknown) => {
        if (!this.isConnectedGeneration(generation)) {
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
  }

  private observe(raw: unknown, generation: string, ids: string[], requestStartedAt?: number) {
    const result = completeAuthorizationBatch(raw, generation, ids);
    if (!result) {
      this.suspend();
      return false;
    }
    let accepted = true;
    for (const value of result) {
      const entry = this.entries.get(value.registrationId);
      if (entry?.observe(value, this.round, requestStartedAt) === false) {
        accepted = false;
      }
    }
    this.changed();
    return accepted;
  }

  private canRenew() {
    return this.isConnectedGeneration(this.generation) && this.entries.size > 0;
  }

  private acceptsResponse(request: ValidationRequest) {
    if (!this.isConnectedGeneration(request.generation)) {
      return false;
    }
    return request.observation === this.observation && request.sequence === this.requestSequence;
  }

  private rejectRequest(request: ValidationRequest) {
    if (this.disposed || request.generation !== this.generation) {
      return;
    }
    if (request.sequence > this.acceptedRequestSequence) {
      this.suspend();
    }
  }

  private async renew() {
    if (!this.canRenew()) {
      return;
    }
    if (this.needsFreshWatch) {
      this.startGeneration();
      return;
    }
    const request = {
      generation: this.generation,
      observation: this.observation,
      sequence: ++this.requestSequence,
      registrationIds: this.registrationIds(),
      startedAt: Date.now(),
    };
    await this.validateRequest(request);
  }

  private async validateRequest(request: ValidationRequest) {
    try {
      const result: unknown = await gameHttpClient(this.url).query(watch, {
        ...this.credentials,
        generation: request.generation,
        registrationIds: request.registrationIds,
      });
      if (!this.acceptsResponse(request)) {
        return;
      }
      if (this.observe(result, request.generation, request.registrationIds, request.startedAt)) {
        this.acceptedRequestSequence = request.sequence;
      }
    } catch {
      this.rejectRequest(request);
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

import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import type { ConnectionState } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

import {
  PLAY_AUTH_LEASE_MS,
  PLAY_AUTH_RECOVERY_MS,
  PLAY_AUTH_RENEWAL_MS,
  PLAY_REQUEST_TIMEOUT_MS,
  PLAY_WATCH_AUTHORIZATIONS_FUNCTION,
  playWatchAuthorizationsResultSchema,
} from '../../src/shared/play/admission';
import type { playWatchAuthorizationsRequestSchema } from '../../src/shared/play/admission';
import type { GameDiagnostics } from './diagnostics';

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
type WatchBatch = Pick<
  ReturnType<typeof playWatchAuthorizationsRequestSchema.parse>,
  'generation' | 'registrationIds'
> & { round: number };
type GrantEvaluation = { now: number; minimumRound: number };
type AuthorizationObservation = {
  batch: WatchBatch;
  requestStartedAt?: number;
};
type ValidationRequest = AuthorizationObservation & {
  observation: number;
  sequence: number;
  requestStartedAt: number;
};
/** Production values come from the shared constants; tests pass shorter lifetimes. */
type WatchDurations = { leaseMs: number; renewalMs: number };
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

  constructor(
    private readonly principal: Principal,
    private readonly leaseMs: number
  ) {}

  canReuse(principal: Principal) {
    return !this.denied && samePrincipal(this.principal, principal);
  }

  /** The Auth deadline a quiet grant runs out at; none once denied or before any result. */
  deadline() {
    return this.denied || !this.expiresAt ? Infinity : this.expiresAt;
  }

  restart(preserveGrant: boolean) {
    this.freshRound = 0;
    if (!preserveGrant) {
      this.validatedRound = 0;
      this.leaseUntil = 0;
    }
  }

  status({ now, minimumRound }: GrantEvaluation): AuthorizationStatus {
    if (this.denied) {
      return 'denied';
    }
    if (this.validatedRound < minimumRound) {
      return 'suspended';
    }
    return now < Math.min(this.expiresAt, this.leaseUntil) ? 'authorized' : 'suspended';
  }

  observe(value: AuthorizationValue, observation: AuthorizationObservation) {
    if (this.denied) {
      return true;
    }
    if (!value.allowed || !samePrincipal(this.principal, value)) {
      this.denied = true;
      this.leaseUntil = 0;
      return true;
    }
    if (value.authExpiresAt <= Date.now()) {
      this.expire(observation);
      return false;
    }
    this.expiresAt = value.authExpiresAt;
    this.validate(observation);
    return true;
  }

  private expire({ batch, requestStartedAt }: AuthorizationObservation) {
    this.freshRound = batch.round;
    this.validatedRound = 0;
    this.leaseUntil = 0;
    if (requestStartedAt !== undefined) {
      this.denied = true;
    }
  }

  private validate({ batch, requestStartedAt }: AuthorizationObservation) {
    if (requestStartedAt === undefined) {
      this.freshRound = batch.round;
    } else if (this.freshRound === batch.round) {
      this.leaseUntil = Math.min(requestStartedAt + this.leaseMs, this.expiresAt);
      this.validatedRound = batch.round;
    }
  }
}

function completeAuthorizationBatch(raw: unknown, { generation, registrationIds }: WatchBatch) {
  const parsed = playWatchAuthorizationsResultSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.ok) {
    return null;
  }
  const result = parsed.data;
  if (result.generation !== generation || result.entries.length !== registrationIds.length) {
    return null;
  }
  const remaining = new Set(registrationIds);
  return result.entries.every((entry) => remaining.delete(entry.registrationId)) ? result.entries : null;
}

/**
 * Auth grants are memory-only.
 * Both a fresh watch and an uncached validation lease are required.
 * The watch is the prompt path for revocation;
 * the lease bounds a stalled subscription over a live transport;
 * the Convex client's own inactivity reconnect bounds a dead transport.
 * A suspension while connected restarts the watch with backoff instead of waiting for the renewal tick.
 */
export class AuthorizationWatch {
  private readonly entries = new Map<string, AuthorizationGrant>();
  private readonly leaseMs: number;
  private readonly renewalMs: number;
  private client: ConvexClient | undefined;
  private unsubscribe: (() => void) | undefined;
  private unsubscribeConnection: (() => void) | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private recovery: ReturnType<typeof setTimeout> | undefined;
  private recoveryAttempts = 0;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private expiryRetries = 0;
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
    private readonly changed: () => void,
    private readonly diagnostics?: GameDiagnostics,
    durations: Partial<WatchDurations> = {}
  ) {
    this.leaseMs = durations.leaseMs ?? PLAY_AUTH_LEASE_MS;
    this.renewalMs = durations.renewalMs ?? PLAY_AUTH_RENEWAL_MS;
  }

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
      this.entries.set(registrationId, new AuthorizationGrant({ ...principal }, this.leaseMs));
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
    }, this.renewalMs);
  }

  /*
   * A dead transport is bounded here, not by the lease: the Convex client closes and reconnects after
   * `serverInactivityThreshold` (60 seconds, hard-coded in convex 1.45.0 `web_socket_manager.js`) without
   * any server message, and the reconnect starts a new generation.
   */
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

  status(
    registrationId: string,
    { now = Date.now(), minimumRound = 0 }: Partial<GrantEvaluation> = {}
  ): AuthorizationStatus {
    const status = this.entries.get(registrationId)?.status({ now, minimumRound }) ?? 'suspended';
    if (status === 'authorized' && !this.connected) {
      return 'suspended';
    }
    return status;
  }

  private suspend() {
    this.resetGrants();
    this.scheduleRecovery();
  }

  private resetGrants() {
    this.needsFreshWatch = true;
    this.observation++;
    for (const entry of this.entries.values()) {
      entry.restart(false);
    }
    this.changed();
  }

  private scheduleRecovery() {
    if (this.recovery || this.disposed || !this.connected || !this.entries.size) {
      return;
    }
    const delay = Math.min(this.renewalMs, PLAY_AUTH_RECOVERY_MS * 2 ** this.recoveryAttempts);
    this.recovery = setTimeout(() => {
      this.recovery = undefined;
      if (this.needsFreshWatch && this.canRenew()) {
        this.recoveryAttempts++;
        this.startGeneration();
      }
    }, delay);
  }

  private clearRecovery() {
    if (this.recovery) {
      clearTimeout(this.recovery);
      this.recovery = undefined;
    }
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
      this.resetGrants();
    }
    this.needsFreshWatch = false;
    this.clearRecovery();
    if (!this.client || !this.canRenew()) {
      return;
    }
    this.subscribeGeneration(this.client);
    void this.renew();
  }

  private currentBatch(): WatchBatch {
    return {
      generation: this.generation,
      round: this.round,
      registrationIds: [...this.entries.keys()].sort((left, right) => left.localeCompare(right)),
    };
  }

  private queryArguments({ generation, registrationIds }: WatchBatch) {
    return { ...this.credentials, generation, registrationIds };
  }

  private isConnectedGeneration(generation: string) {
    if (this.disposed || !this.connected) {
      return false;
    }
    return generation === this.generation;
  }

  private subscribeGeneration(client: ConvexClient) {
    const batch = this.currentBatch();
    this.unsubscribe = client.onUpdate(
      watch,
      this.queryArguments(batch),
      (raw: unknown) => {
        if (!this.isConnectedGeneration(batch.generation)) {
          return;
        }
        this.observation++;
        if (this.observe(raw, { batch })) {
          this.recoveryAttempts = 0;
        }
        if (this.needsFreshWatch) {
          /* A rejected batch restarts through the recovery timer, with backoff, not at wire speed. */
          return;
        }
        void this.renew();
      },
      (error) => {
        if (batch.generation === this.generation) {
          this.diagnostics?.report('authorization-watch', error);
          this.suspend();
        }
      }
    );
  }

  private observe(raw: unknown, observation: AuthorizationObservation) {
    const result = completeAuthorizationBatch(raw, observation.batch);
    if (!result) {
      this.suspend();
      return false;
    }
    let accepted = true;
    for (const value of result) {
      const entry = this.entries.get(value.registrationId);
      if (entry?.observe(value, observation) === false) {
        accepted = false;
      }
    }
    this.changed();
    this.scheduleExpiryCheck(observation.requestStartedAt !== undefined);
    return accepted;
  }

  /*
   * A quiet grant runs out at its Auth deadline without any push; the local check already gates it
   * there. One uncached validation a recovery delay later turns the suspension into a denial, or into
   * a refreshed deadline, instead of waiting for the renewal tick; the delay lets a refreshed deadline
   * already in flight land first. A deadline the server still considers future backs off.
   */
  private scheduleExpiryCheck(afterValidation: boolean) {
    this.clearExpiryCheck();
    if (this.disposed) {
      return;
    }
    let earliest = Infinity;
    for (const entry of this.entries.values()) {
      earliest = Math.min(earliest, entry.deadline());
    }
    if (!Number.isFinite(earliest)) {
      return;
    }
    const remaining = earliest - Date.now();
    if (remaining > 0) {
      this.expiryRetries = 0;
    } else if (!afterValidation) {
      /* A pushed result past its deadline is validated at once by the subscription callback. */
      return;
    }
    const delay =
      remaining > 0
        ? remaining + PLAY_AUTH_RECOVERY_MS
        : Math.min(this.renewalMs, PLAY_AUTH_RECOVERY_MS * 2 ** this.expiryRetries++);
    this.expiry = setTimeout(() => {
      this.expiry = undefined;
      void this.renew();
    }, delay);
  }

  private clearExpiryCheck() {
    if (this.expiry) {
      clearTimeout(this.expiry);
      this.expiry = undefined;
    }
  }

  private canRenew() {
    return this.isConnectedGeneration(this.generation) && this.entries.size > 0;
  }

  private acceptsResponse(request: ValidationRequest) {
    if (!this.isConnectedGeneration(request.batch.generation)) {
      return false;
    }
    return request.observation === this.observation && request.sequence === this.requestSequence;
  }

  private rejectRequest(request: ValidationRequest) {
    if (this.disposed || request.batch.generation !== this.generation) {
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
      batch: this.currentBatch(),
      observation: this.observation,
      sequence: ++this.requestSequence,
      requestStartedAt: Date.now(),
    };
    await this.validateRequest(request);
  }

  private async validateRequest(request: ValidationRequest) {
    try {
      const result: unknown = await gameHttpClient(this.url).query(watch, this.queryArguments(request.batch));
      if (!this.acceptsResponse(request)) {
        return;
      }
      if (this.observe(result, request)) {
        this.acceptedRequestSequence = request.sequence;
      }
    } catch (error) {
      if (this.acceptsResponse(request)) {
        this.diagnostics?.report('authorization-renewal', error);
      }
      this.rejectRequest(request);
    }
  }

  async close() {
    this.disposed = true;
    this.generation = '';
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.clearRecovery();
    this.clearExpiryCheck();
    this.unsubscribe?.();
    this.unsubscribeConnection?.();
    await this.client?.close();
    this.entries.clear();
  }
}

import { api } from '../../convex/_generated/api';
import {
  PLAY_CONFIRMATION_RECOVERY_MS,
  PLAY_CONFIRMATION_RETRY_MS,
  playConfirmationSchema,
  playProvisioningValidationSchema,
  playProvisionRequestSchema,
} from '../../src/shared/play/admission';
import type { DraftFaction } from '../../src/shared/play/drafting';
import type { StoredSpawnContents } from '../../src/shared/play/inventory';
import { GameRejection } from '../../src/shared/play/rejection';
import type { GameCatalogue } from './catalogue';
import type { GameDiagnostics } from './diagnostics';
import { FIXTURE_TREACHERY_DECK } from './fixture';
import type { FixturePlan } from './fixture';
import type { gameHttpClient } from './gameHttpClient';
import { isLocalIsolatedRuntime } from './localRuntime';
import { provisionThroughSetup } from './provisionThroughSetup';
import type { RoomAlarm } from './roomAlarm';
import type { RoomDraft } from './roomDraft';
import { json, readRequest, refused } from './roomHttp';
import type { GameSession } from './session';

type ProvisionArgs = ReturnType<typeof playProvisionRequestSchema.parse>;
/** An attempt Convex validated: a hosted fixture or a real game. A refused one never reaches initialization. */
type ProvisioningValidation = Extract<ReturnType<typeof playProvisioningValidationSchema.parse>, { ok: true }>;

/** What creating and confirming a game needs from its room. */
export type ProvisioningHost = {
  readonly session: GameSession;
  readonly diagnostics: GameDiagnostics;
  readonly draft: RoomDraft;
  readonly alarm: RoomAlarm;
  /* The production Worker provisions only the hosted fixture; a load entry passes the load fixture's plan. */
  readonly fixturePlan: FixturePlan;
  readonly env: Parameters<typeof isLocalIsolatedRuntime>[0];
  convex(): ReturnType<typeof gameHttpClient>;
  catalogue(): GameCatalogue;
  retainRulesetCapture(rulesetId: string, options: { provisional?: boolean }): Promise<unknown>;
  advanceDeadlines(): void;
  /** The opening summary waited for confirmation: only a confirmed game is listed. */
  directoryChanged(): void;
};

/** Creates the room's game once Convex validates the attempt, then confirms it until Convex acknowledges. */
export class RoomProvisioning {
  /* Each confirmation request takes the next epoch, so only the newest request's reply settles the game. */
  private confirmationEpoch = 0;

  constructor(private readonly room: ProvisioningHost) {}

  private get metadata() {
    return this.room.session.info;
  }

  async provision(request: Request, gameId: string): Promise<Response> {
    const args = await readRequest(request, playProvisionRequestSchema);
    if (!args || args.gameId !== gameId) {
      return refused();
    }
    try {
      return (await this.create(args)) ? json({ ok: true }) : refused();
    } catch (error) {
      this.room.diagnostics.report('provision', error);
      return refused();
    }
  }

  async confirm() {
    const metadata = this.metadata;
    if (!metadata || metadata.confirmed) {
      return;
    }
    const epoch = ++this.confirmationEpoch;
    const startedAt = Date.now();
    /* Recovery stays durable while the request is pending, including when it crosses expiry. */
    await this.room.alarm.arm(
      startedAt + (startedAt < metadata.expiresAt ? PLAY_CONFIRMATION_RETRY_MS : PLAY_CONFIRMATION_RECOVERY_MS)
    );
    try {
      const raw: unknown = await this.room.convex().mutation(api.playProvisioning.confirmProvisioning, {
        gameId: metadata.gameId,
        secret: metadata.secret,
        attemptId: metadata.attemptId,
      });
      if (epoch !== this.confirmationEpoch) {
        return;
      }
      if (playConfirmationSchema.parse(raw).ok) {
        this.room.session.confirm();
      }
      await this.room.alarm.clear();
      this.room.directoryChanged();
      this.room.diagnostics.recovered('confirmation');
    } catch (error) {
      /* A superseded attempt still reports, so a first request that outlives its alarm stays visible. */
      this.room.diagnostics.report('confirmation', error, { durationMs: Date.now() - startedAt });
      /* The pre-armed alarm retries the acknowledgement without reinitializing the game. */
    }
  }

  /** A hosted fixture woken without its catalogue deck asks for it again. */
  async adoptFixtureDeck() {
    const deck = await this.captureFixtureDeck();
    if (deck) {
      this.room.session.adoptFixtureDeck(deck);
    }
  }

  /*
   * The hosted fixture deals a real treachery deck from the catalogue when the catalogue can supply
   * it, through the same capture the shared inventory spawns from. A catalogue that cannot (the
   * native peer, a backend without the deck) leaves the fixture's placeholder cards in place.
   */
  private async captureFixtureDeck(): Promise<StoredSpawnContents | undefined> {
    try {
      const deck = await this.room.catalogue().capture(FIXTURE_TREACHERY_DECK);
      /* The deal reads the pieces only; the definitions the inventory audits would bloat every metadata write. */
      return { ...deck, definitions: [] };
    } catch (error) {
      /* A catalogue without the deck is the expected refusal; only a broken read is worth a report. */
      if (!(error instanceof GameRejection)) {
        this.room.diagnostics.report('fixture-deck', error);
      }
      return undefined;
    }
  }

  /** Whether this attempt created the room's game and Convex confirmed it. */
  private async create(args: ProvisionArgs): Promise<boolean> {
    if (this.metadata) {
      return false;
    }
    const validation = await this.validate(args);
    if (!validation || !(await this.retainProvisionedRuleset(args, validation))) {
      return false;
    }
    const { factions, fixtureDeck } = await this.catalogueReads(validation);
    if (!this.initializeValidated(args, validation, factions, fixtureDeck)) {
      return false;
    }
    if ('game' in validation && validation.testStartStage === 'play') {
      await provisionThroughSetup(validation.game, {
        session: this.room.session,
        advanceDeadlines: () => this.room.advanceDeadlines(),
        settleDraft: () => this.room.draft.settle(),
      });
    }
    await this.confirm();
    return this.metadata!.confirmed;
  }

  /** The attempt as Convex validated it, or undefined when Convex refused it. */
  private async validate(args: ProvisionArgs): Promise<ProvisioningValidation | undefined> {
    const raw: unknown = await this.room.convex().mutation(api.playProvisioning.validateProvisioning, args);
    const validation = playProvisioningValidationSchema.parse(raw);
    if (!validation.ok) {
      return undefined;
    }
    this.requireLocalTestOverrides(validation);
    return validation;
  }

  /** What the new game reads from the catalogue: a real game's factions, the hosted fixture's deck. */
  private async catalogueReads(validation: ProvisioningValidation) {
    const factions =
      'game' in validation && !this.metadata ? await this.room.draft.factions(validation.game.rulesetId) : null;
    /* The hosted fixture asks the catalogue for its deck before it exists; a refusal costs nothing, a slow answer only time. */
    const fixtureDeck =
      'fixtureKey' in validation && this.room.fixturePlan.hosted && !this.metadata
        ? await this.captureFixtureDeck()
        : undefined;
    return { factions, fixtureDeck };
  }

  /* Fail closed: a game without the real phase cooldown, or provisioned past drafting, exists only in the isolated local stack. */
  private requireLocalTestOverrides(validation: ProvisioningValidation) {
    const overridden = validation.testPhaseCooldownMs !== undefined || validation.testStartStage !== undefined;
    if (overridden && !isLocalIsolatedRuntime(this.room.env)) {
      throw new Error('A test phase cooldown or start stage is refused outside the isolated local runtime.');
    }
  }

  /**
   * A real game retains its ruleset before it exists, and a ruleset that is not ready never becomes a game.
   * False when the ruleset was refused, after the refusal is reported unless another request already provisioned the room.
   */
  private async retainProvisionedRuleset(args: ProvisionArgs, validation: ProvisioningValidation): Promise<boolean> {
    if (!('game' in validation) || this.metadata) {
      return true;
    }
    try {
      await this.room.retainRulesetCapture(validation.game.rulesetId, {
        provisional: validation.provisional === true,
      });
      return true;
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        throw error;
      }
      if (!this.metadata) {
        await this.room.convex().mutation(api.playProvisioning.failProvisioning, {
          ...args,
          reason: error.message,
        });
      }
      return false;
    }
  }

  private initializeValidated(
    args: ProvisionArgs,
    validation: ProvisioningValidation,
    factions: DraftFaction[] | null,
    fixtureDeck?: StoredSpawnContents
  ): boolean {
    /*
     * Another request can finish while Convex validates this one and the ruleset is captured.
     * Keep the guard and initialization synchronous.
     */
    if (this.metadata || !matchesAttempt(args, validation)) {
      return false;
    }
    this.room.session.initialize(provisionedMetadata(args, validation, fixtureDeck), factions);
    /* A catalogue read that failed at creation is read again at once rather than on the first command. */
    this.room.draft.changed();
    return true;
  }
}

/** Whether Convex validated this very attempt, and it has not expired since. */
function matchesAttempt(args: ProvisionArgs, validation: ProvisioningValidation) {
  return (
    validation.gameId === args.gameId && validation.attemptId === args.attemptId && validation.expiresAt > Date.now()
  );
}

/** The new game's metadata, unconfirmed until Convex acknowledges it. */
function provisionedMetadata(
  args: ProvisionArgs,
  validation: ProvisioningValidation,
  fixtureDeck: StoredSpawnContents | undefined
) {
  return {
    ...args,
    expiresAt: validation.expiresAt,
    confirmed: false,
    ...('game' in validation ? { game: validation.game } : {}),
    ...('provisional' in validation && validation.provisional ? { provisional: true } : {}),
    ...(validation.testPhaseCooldownMs === undefined ? {} : { testPhaseCooldownMs: validation.testPhaseCooldownMs }),
    ...(fixtureDeck ? { fixtureDeck } : {}),
  };
}

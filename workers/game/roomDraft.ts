import type { DraftFaction } from '../../src/shared/play/drafting';
import { GameRejection } from '../../src/shared/play/rejection';
import type { GameCatalogue } from './catalogue';
import type { GameDiagnostics } from './diagnostics';
import type { SetAsideJudgement } from './drafting';
import type { GameSession } from './session';
import { NotReady, readinessProblem } from './session';

/** What the draft needs from its room. */
export type DraftRoom = {
  readonly session: GameSession;
  readonly diagnostics: GameDiagnostics;
  catalogue(): GameCatalogue;
  /** The game's ruleset, once the room holds a game. */
  rulesetId(): string | undefined;
  /** An isolated backend deals provisional content, so its picks are not judged. */
  provisional(): boolean;
  /** Retains the faction's capture for the deal; a capture that is not ready throws NotReady. */
  retainFaction(factionId: string): Promise<unknown>;
  refreshViews(): void;
  /** The deal went through, so the directory hears of the seated factions. */
  dealt(): void;
  waitUntil(work: Promise<unknown>): void;
};

/**
 * A room's draft: judging picks as they are made, refreshing the catalogue behind them, and dealing once everyone is ready.
 * Each of those runs at most once at a time.
 * A change that lands while one runs makes it go again.
 */
export class RoomDraft {
  private assigning = false;
  private draftChangedDuringAttempt = false;
  private refreshingCatalogue = false;
  /* Picks a capture found ready since the catalogue was last read, so a draft command judges each pick once. */
  private readyPicks = new Set<string>();
  private judgingPicks = false;
  private judgePicksAgain = false;
  /* Counts catalogue refreshes, so a pick judgement that straddles one is dropped. */
  private catalogueGeneration = 0;
  constructor(private readonly room: DraftRoom) {}

  /**
   * Waits for the deal a fully ready draft owes.
   * A catalogue refresh that creation started makes that attempt itself once it lands.
   * A failed attempt waits for a player's next draft change, so it fails the provisioning rather than being retried.
   * Otherwise the replay makes the attempt its last draft-ready command would have made.
   */
  async settle() {
    for (let waited = 0; waited < 500 && (this.assigning || this.refreshingCatalogue); waited++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const snapshot = this.room.session.currentSnapshot();
    if (snapshot.stage !== 'drafting') {
      return;
    }
    if (snapshot.draft?.failure) {
      throw new Error(`The deal did not complete: ${snapshot.draft.failure}`);
    }
    await this.attemptAssignment();
  }

  async factions(rulesetId: string): Promise<DraftFaction[] | null> {
    try {
      return await this.room.catalogue().draftableFactions(rulesetId);
    } catch (error) {
      /* A game opens without the list, stamped stale, and reads it on the first draft command. */
      this.room.diagnostics.report('draft-catalogue', error);
      return null;
    }
  }
  changed() {
    const status = this.room.session.draftWork();
    if (!status) {
      return;
    }
    if (this.assigning) {
      this.draftChangedDuringAttempt = true;
    }
    this.room.waitUntil(this.judgePicks().catch((error) => this.room.diagnostics.report('draft-catalogue', error)));
    if (status.refresh && !this.refreshingCatalogue) {
      this.room.waitUntil(
        this.refreshDraftCatalogue().catch((error) => this.room.diagnostics.report('draft-catalogue', error))
      );
    } else if (!this.assigning) {
      this.room.waitUntil(this.attemptAssignment().catch((error) => this.room.diagnostics.report('assignment', error)));
    }
  }

  /**
   * The latest faction data without resetting readiness (#1013): picks and readiness stay, the factions behind them are read again, and the gates are judged on what the catalogue holds now.
   */
  private async refreshDraftCatalogue() {
    const rulesetId = this.room.rulesetId();
    if (this.refreshingCatalogue || !rulesetId) {
      return;
    }
    this.refreshingCatalogue = true;
    try {
      const catalogue = this.room.catalogue();
      const factions = await catalogue.draftableFactions(rulesetId);
      const setAside = await this.judgeSetAside(catalogue, factions);
      this.room.session.updateDraftCatalogue(factions, setAside);
      this.readyPicks.clear();
      this.catalogueGeneration += 1;
      /* An attempt that ran alongside dealt from the copy before this one, so it tries again on this. */
      if (this.assigning) {
        this.draftChangedDuringAttempt = true;
      }
      this.room.refreshViews();
    } catch (error) {
      /* The copy in hand still judges the gates; the next command reads again. */
      this.room.diagnostics.report('draft-catalogue', error);
    } finally {
      this.refreshingCatalogue = false;
    }
    await this.attemptAssignment();
  }

  /**
   * A real game judges each drafted faction when it is picked, so one that is not ready is set aside with its reason before anyone readies.
   * The deal still judges every faction it captures, random fills included.
   */
  private async judgePicks() {
    if (this.room.provisional()) {
      return;
    }
    if (this.judgingPicks) {
      /* A pick made while a judgement is in flight is judged when it ends. */
      this.judgePicksAgain = true;
      return;
    }
    this.judgingPicks = true;
    try {
      do {
        this.judgePicksAgain = false;
        await this.judgePendingPicks();
      } while (this.judgePicksAgain);
    } finally {
      this.judgingPicks = false;
    }
  }

  private async judgePendingPicks() {
    const pending = this.room.session.draftedPicks().filter((id) => !this.readyPicks.has(id));
    if (!pending.length) {
      return;
    }
    const generation = this.catalogueGeneration;
    const catalogue = this.room.catalogue();
    const ready: string[] = [];
    const refused: Record<string, string> = {};
    for (const factionId of pending) {
      const problem = await this.pickProblem(catalogue, factionId);
      if (problem === undefined) {
        ready.push(factionId);
      } else if (problem !== null) {
        refused[factionId] = problem;
      }
    }
    /*
     * A refresh since judged against a newer catalogue, so these verdicts are stale.
     * The picks still pending are judged again on it, so none waits for another command.
     */
    if (generation !== this.catalogueGeneration) {
      this.judgePicksAgain = true;
      return;
    }
    ready.forEach((factionId) => this.readyPicks.add(factionId));
    if (!Object.keys(refused).length) {
      return;
    }
    this.room.session.setFactionsAside(refused, { atDeal: false });
    if (this.assigning) {
      this.draftChangedDuringAttempt = true;
    }
    this.room.refreshViews();
  }

  /** Why a pick cannot be dealt; nothing when it is ready, null when its capture could not be read, which is reported and judged again later. */
  private async pickProblem(catalogue: GameCatalogue, factionId: string): Promise<string | undefined | null> {
    try {
      return readinessProblem((await catalogue.captureFaction(factionId)).readiness)?.slice(0, 400);
    } catch (error) {
      if (error instanceof GameRejection) {
        return error.message.slice(0, 400);
      }
      this.room.diagnostics.report('draft-catalogue', error);
      return null;
    }
  }

  /** Why the deal cannot take this faction, from its capture; nothing once it is retained. */
  private async refusedFaction(factionId: string): Promise<string | undefined> {
    try {
      await this.room.retainFaction(factionId);
      return undefined;
    } catch (error) {
      if (error instanceof NotReady) {
        return error.problem.slice(0, 400);
      }
      if (error instanceof GameRejection) {
        return error.message.slice(0, 400);
      }
      throw error;
    }
  }

  /**
   * The factions set aside, judged again with the catalogue: one still listed and still refused keeps its latest reason, one ready now returns to the draft.
   * A capture that cannot be read keeps the reason it had.
   */
  private async judgeSetAside(catalogue: GameCatalogue, factions: DraftFaction[]): Promise<SetAsideJudgement> {
    const judged: string[] = [];
    const stillAside: Record<string, string> = {};
    for (const [factionId, reason] of Object.entries(this.room.session.draftSetAside())) {
      judged.push(factionId);
      if (!factions.some((faction) => faction.id === factionId)) {
        continue;
      }
      try {
        const capture = await catalogue.captureFaction(factionId);
        const problem = this.room.provisional() ? undefined : readinessProblem(capture.readiness);
        if (problem !== undefined) {
          stillAside[factionId] = problem.slice(0, 400);
        }
      } catch (error) {
        if (!(error instanceof GameRejection)) {
          this.room.diagnostics.report('draft-catalogue', error);
        }
        stillAside[factionId] = error instanceof GameRejection ? error.message.slice(0, 400) : reason;
      }
    }
    return { judged, stillAside };
  }

  /*
   * Public assignment, by itself, once the roster meets the minimum, every player is ready and the
   * pool holds enough factions: the dealt factions are captured first (a real game refuses unready
   * content, an isolated backend deals provisional content), then one transaction fixes the seat
   * count, gives every seat its faction and a random station, ends the draft and opens swapping,
   * provided nothing about the draft or the roster changed while the captures ran. A faction whose
   * capture is refused is set aside with its reason and the deal tries again from what remains; any
   * other failure before that commit leaves the draft as it was, with its reason, for a gate-checked retry.
   */
  private async attemptAssignment() {
    if (this.assigning) {
      return;
    }
    const prepared = this.room.session.prepareAssignment();
    if (!prepared) {
      return;
    }
    this.assigning = true;
    try {
      const refused: Record<string, string> = {};
      for (const faction of prepared.factions) {
        const reason = await this.refusedFaction(faction);
        if (reason !== undefined) {
          refused[faction] = reason;
        }
      }
      if (Object.keys(refused).length) {
        /* The deal never fails twice on the same faction: it is set aside, and the next attempt deals from what remains. */
        this.room.session.setFactionsAside(refused);
        this.draftChangedDuringAttempt = true;
        this.room.refreshViews();
      } else if (this.room.session.completeAssignment(prepared)) {
        this.room.dealt();
        this.room.refreshViews();
      }
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        this.room.diagnostics.report('assignment', error);
      }
      this.room.session.assignmentFailed(
        error instanceof GameRejection ? error.message : 'The deal did not go through. Try again.'
      );
      this.room.refreshViews();
    } finally {
      this.assigning = false;
    }
    if (this.draftChangedDuringAttempt) {
      this.draftChangedDuringAttempt = false;
      await this.attemptAssignment();
    }
  }
}

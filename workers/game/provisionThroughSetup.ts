import { provisionPlaceholderId } from '../../src/shared/play/admission';
import type { PieceAction } from '../../src/shared/play/protocol';
import { rosterSeat } from '../../src/shared/play/schema';
import { setupReadyRequired, setupStep } from '../../src/shared/play/setup';
import type { SetupState } from '../../src/shared/play/setup';
import type { GameSession } from './session';

/** What provisioning a game to play needs from its room. */
export type ProvisioningRoom = {
  readonly session: GameSession;
  advanceDeadlines(): void;
  /** Waits for the deal a fully ready draft owes. */
  settleDraft(): Promise<void>;
};

/** A player provisioning seats: the creator or a placeholder. */
type ProvisionPlayer = { userId: string; displayName: string };

/** Executes one action as a provisioning player would send it. */
type ProvisionCommand = (player: ProvisionPlayer, action: PieceAction) => void;

/**
 * Takes a game a synthetic backend asked for at the play stage from creation to Turn 1 with the commands its players would send (#1594).
 * Placeholders take the seats the creator does not hold and ready the draft beside the creator.
 * The deal, trading and every setup step then run exactly as they do for players, and the placeholders give up their seats.
 * Those seats stay open with their factions, so a browser flow seats its second player through a request in play, the path a replacement takes.
 * Nothing here bypasses a rule: a step the room would refuse a player fails the provisioning.
 */
export async function provisionThroughSetup(
  game: { minimumPlayers: number; creator: ProvisionPlayer },
  room: ProvisioningRoom
) {
  const creator = { userId: game.creator.userId, displayName: game.creator.displayName };
  const placeholders = Array.from({ length: game.minimumPlayers - 1 }, (_, index) => ({
    userId: provisionPlaceholderId(index + 2),
    displayName: `Placeholder for seat ${index + 2}`,
  }));
  const everyone = [creator, ...placeholders];
  let sequence = 0;
  const command: ProvisionCommand = (player, action) => {
    room.advanceDeadlines();
    sequence += 1;
    room.session.execute(room.session.provisionViewer(player.userId, player.displayName), {
      type: 'command',
      commandId: `provision-${sequence}`,
      action,
      expectedRevision: room.session.currentSnapshot().revision,
    });
  };
  for (const placeholder of placeholders) {
    command(placeholder, { kind: 'seat-request' });
    const requestId = room.session.pendingSeatRequest(placeholder.userId);
    if (!requestId) {
      throw new Error('A placeholder seat request was not filed.');
    }
    command(creator, { kind: 'seat-approve', requestId });
  }
  for (const player of everyone) {
    command(player, { kind: 'draft-ready', ready: true });
  }
  await room.settleDraft();
  provisionSwapReady(room, everyone, command);
  await provisionSetup(room, creator, everyone, command);
  for (const placeholder of placeholders) {
    command(placeholder, { kind: 'seat-depart' });
  }
}

/** Every player readies the dealt trading round, which the deal must have opened. */
function provisionSwapReady(room: ProvisioningRoom, everyone: readonly ProvisionPlayer[], command: ProvisionCommand) {
  const snapshot = () => room.session.currentSnapshot();
  for (const player of everyone) {
    const round = snapshot().swapping?.round;
    if (snapshot().stage !== 'swapping' || round === undefined) {
      const reason = snapshot().draft?.failure ?? `it is in ${snapshot().stage ?? 'no'} stage`;
      throw new Error(`The provisioned game was not dealt: ${reason}`);
    }
    command(player, { kind: 'swap-ready', ready: true, round, seat: provisionSeat(room, player) });
  }
}

/** Each setup step is done as its players would do it, and the creator moves on, until play begins. */
async function provisionSetup(
  room: ProvisioningRoom,
  creator: ProvisionPlayer,
  everyone: readonly ProvisionPlayer[],
  command: ProvisionCommand
) {
  const snapshot = () => room.session.currentSnapshot();
  for (let changes = 0; snapshot().stage === 'setup'; changes++) {
    const steps = snapshot().setup?.steps.length ?? 0;
    if (changes >= steps) {
      throw new Error(`Setup did not reach play within its ${steps} steps.`);
    }
    provisionSetupStep(room, everyone, command);
    await phaseCooldownElapsed(room);
    command(creator, { kind: 'phase', direction: 1 });
  }
  if (snapshot().stage !== 'play') {
    throw new Error(`The provisioned game did not reach play; it is in ${snapshot().stage ?? 'no'} stage.`);
  }
}

/** What the current setup step asks of the players before the creator moves on. */
function provisionSetupStep(room: ProvisioningRoom, everyone: readonly ProvisionPlayer[], command: ProvisionCommand) {
  const snapshot = room.session.currentSnapshot();
  const setup = snapshot.setup!;
  const step = setupStep(setup);
  if (step?.kind === 'prediction') {
    provisionPrediction(room, everyone, command, step);
  } else if (setupReadyRequired(setup)) {
    const ready = snapshot.controls?.ready ?? [];
    everyone
      .filter((player) => !ready.includes(provisionSeat(room, player)))
      .forEach((player) => command(player, { kind: 'ready', ready: true }));
  }
}

function provisionSeat(room: ProvisioningRoom, player: ProvisionPlayer) {
  return room.session.provisionViewer(player.userId, player.displayName).viewerSeat;
}

/* A prediction gates on its lock, never on readiness; it is revealed at once so every seat starts play with the same public view. */
function provisionPrediction(
  room: ProvisioningRoom,
  everyone: readonly ProvisionPlayer[],
  command: ProvisionCommand,
  step: SetupState['steps'][number]
) {
  const predictor = everyone.find((player) => seatFaction(room, provisionSeat(room, player)) === step.factionId);
  if (!predictor) {
    throw new Error(`No provisioned player holds the faction of ${step.title}.`);
  }
  command(predictor, {
    kind: 'prediction-lock',
    stepId: step.id,
    choice: { factionId: step.factionId!, turn: 1 },
  });
  command(predictor, { kind: 'prediction-reveal', stepId: step.id });
}

function seatFaction(room: ProvisioningRoom, seat: string) {
  return rosterSeat(room.session.currentSnapshot().roster, seat)?.faction?.id;
}

/** Setup's phase changes keep the game's cooldown, so a provisioning that runs at the real one waits it out. */
async function phaseCooldownElapsed(room: ProvisioningRoom) {
  const wait = room.session.phaseCooldownEndsAt - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

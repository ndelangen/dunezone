import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';

import { assetSupplySchema, factionDefinitionSchema, rulesetSupplySchema } from '../../src/shared/play/capture';
import { playDraftableFactionsSchema } from '../../src/shared/play/drafting';
import type { ServerMessage } from '../../src/shared/play/protocol';
import { TUTORIAL_CHECKPOINTS, TUTORIAL_RECIPE } from '../../src/shared/tutorial/recipe';
import type { TutorialCheckpoint } from '../../src/shared/tutorial/recipe';
import { JourneyRecorder, renamed } from './journey.native.fixture.ts';
import { dealTraitors, drafting, keepTraitors, predict, startingTroops, trading } from './journey.script.ts';
import { createPeer, createRuntime, eventually, provision, required } from './native-runtime.fixture.ts';

/*
 * Records the tutorial's shared setup (`src/app/routes/_app/tutorial/setup`): the recipe's game, played on the real game
 * Worker over the catalogue `bun run tutorial:pull` copied, kept as one stored table per checkpoint.
 * Every image is the live `/published/...` path the catalogue gave, under `{{origin}}`, which the page fills with its own origin,
 * so the tutorial shows the site's own art.
 * Run with `bun run tutorial:record`; without RECORD_TUTORIAL this suite is skipped.
 */

const SETUP = join(dirname(fileURLToPath(import.meta.url)), '../../src/app/routes/_app/tutorial/setup');
const ORIGIN = 'http://table.test';

const catalogueSchema = z.object({
  pulledFrom: z.string(),
  pulledAt: z.string(),
  rulesetSupply: z.unknown(),
  assetSupply: z.record(z.string(), z.unknown()),
  draftableFactions: z.unknown(),
  factionDefinitions: z.record(z.string(), z.unknown()),
});

/* The catalogue's addresses name the site it was pulled from; the recording Worker serves the same paths from its own origin. */
async function readCatalogue() {
  const text = await readFile(join(SETUP, 'catalogue.json'), 'utf8');
  return catalogueSchema.parse(JSON.parse(text.replaceAll(/https?:\/\/[^/"]+\/published\//g, '/published/')));
}

async function tutorialRuntime() {
  const catalogue = await readCatalogue();
  const supply = rulesetSupplySchema.parse(catalogue.rulesetSupply);
  const draftable = playDraftableFactionsSchema.parse(catalogue.draftableFactions);
  const peer = await createPeer();
  peer.game = {
    rulesetId: TUTORIAL_RECIPE.ruleset.id,
    minimumPlayers: TUTORIAL_RECIPE.factions.length,
    creator: { userId: 'user-a', displayName: 'Synthetic A', avatarUrl: null, profileSlug: 'synthetic-a' },
  };
  peer.rulesets.set(TUTORIAL_RECIPE.ruleset.id, supply);
  for (const [key, answer] of Object.entries(catalogue.assetSupply)) {
    peer.catalogue.set(key, assetSupplySchema.parse(answer));
  }
  peer.draftable = draftable.factions;
  /* The pull keeps each faction's definition under the recording's name for it, so the cast comes straight from them. */
  const factions = TUTORIAL_RECIPE.factions.map(({ slug }) => {
    const definition = factionDefinitionSchema.parse(catalogue.factionDefinitions[slug]);
    peer.factions.set(definition.faction.id, definition);
    return { id: definition.faction.id, slug, name: definition.faction.name };
  });
  const runtime = await createRuntime(peer, 'game');
  if ((await provision(runtime)).status !== 200) {
    throw new Error('The tutorial game did not provision.');
  }
  const ban = required(draftable.factions.find((faction) => !factions.some((chosen) => chosen.id === faction.id)));
  return new JourneyRecorder(
    peer,
    runtime,
    { factions, ban: { id: ban.id, name: ban.name } },
    new Set(['drafting', 'setup', 'play'])
  );
}

/* Each seated faction's sheet as the Worker answers a page asking for it, so the tutorial's table answers the same. */
async function factionSheets(journey: JourneyRecorder) {
  const connection = journey.players[0]!;
  const sheets: Record<string, Extract<ServerMessage, { type: 'faction' }>['faction']> = {};
  for (const { id } of journey.cast.factions) {
    const start = connection.messages.length;
    connection.send({ type: 'faction', factionId: id });
    const answer = await eventually(
      () =>
        connection.messages
          .slice(start)
          .find(
            (message): message is Extract<ServerMessage, { type: 'faction' }> =>
              message.type === 'faction' && message.factionId === id
          ),
      `the ${id} sheet`
    );
    sheets[id] = answer.faction;
  }
  return sheets;
}

/*
 * The spice card the learner turns over first in "What goes where": the top of the spice deck, which must be a territory, not Shai-Hulud.
 * Read from the stored table, since a face-down card keeps its name from every player's view.
 */
function firstSpiceCardBlows(journey: JourneyRecorder) {
  const deck = required(journey.steps.at(-1)?.stored).table.pieces.find(
    (piece) => piece.items.length > 1 && piece.items[0]?.artwork?.type === 'card-spice'
  );
  const top = deck?.items.at(-1)?.artwork?.name;
  return top !== undefined && top !== 'Shai-Hulud';
}

/*
 * The deal and the shuffles are random, but the chapters teach a fixed table: the learner plays the recipe's first faction
 * (Setup opens on the Bene Gesserit's prediction) and the first spice card names a territory. So the game is played again until it does.
 */
async function teachableGame() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const journey = await tutorialRuntime();
    const checkpoints: Partial<Record<TutorialCheckpoint, number>> = {};
    const mark = (name: TutorialCheckpoint) => {
      checkpoints[name] = journey.steps.length - 1;
    };
    await drafting(journey);
    if (journey.factionAt(0)?.id === journey.cast.factions[0]?.id) {
      /* The draft before anyone picks: every seat taken and a spectator watching, the same on every recording. */
      checkpoints.drafting = journey.steps.findIndex((step) => step.title === 'Table full');
      await trading(journey);
      mark('setup');
      await predict(journey);
      await dealTraitors(journey);
      await keepTraitors(journey);
      await startingTroops(journey);
      await journey.next(0, 'Turn 1: Storm', 'Setup ends and the first turn opens on the Storm phase.');
      mark('turn-1-storm');
      if (firstSpiceCardBlows(journey)) {
        return { journey, checkpoints };
      }
    }
    await journey.close();
  }
  throw new Error('No game in 30 dealt the learner the first faction and a territory on top of the spice deck.');
}

describe.runIf(process.env.RECORD_TUTORIAL)('The tutorial setup recording', { timeout: 600_000 }, () => {
  it('records the recipe game at every checkpoint', async () => {
    const { journey, checkpoints } = await teachableGame();
    try {
      expect(Object.keys(checkpoints)).toEqual([...TUTORIAL_CHECKPOINTS]);
      const log = { game: await journey.fullLog('game'), audit: await journey.fullLog('audit') };
      const setup = {
        recordedWith: 'bun run tutorial:record',
        catalogue: (await readCatalogue()).pulledAt,
        factions: await factionSheets(journey),
        checkpoints: Object.fromEntries(
          TUTORIAL_CHECKPOINTS.map((name) => {
            const step = required(journey.steps[required(checkpoints[name])]);
            const views = Object.values(step.views);
            return [
              name,
              {
                title: step.title,
                logSequence: step.logSequence,
                stored: required(step.stored),
                viewers: Object.fromEntries(views.map((view) => [view.viewer.viewerSeat, view.viewer])),
                players: required(step.views[TUTORIAL_RECIPE.learner]).snapshot.controls?.players ?? [],
              },
            ];
          })
        ),
        log: {
          game: log.game.filter((entry) => entry.sequence <= required(journey.steps.at(-1)).logSequence),
          audit: log.audit,
        },
      };
      await mkdir(SETUP, { recursive: true });
      await writeFile(
        join(SETUP, 'setup.json'),
        `${renamed(JSON.stringify(setup).replaceAll(`${ORIGIN}/published/`, '{{origin}}/published/'))}\n`
      );
    } finally {
      await journey.close();
    }
  });
});

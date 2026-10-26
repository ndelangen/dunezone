import type { GameSnapshot } from '@shared/play/protocol';
import { TUTORIAL_RECIPE } from '@shared/tutorial/recipe';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, pressEnter, task } from './guideChecks';

/*
 * Chapter 4, "Draft and trade": the table from the moment the last seat is taken, before anyone has drafted.
 * The learner drafts Bene Gesserit and bans the Ixians, the others draft the rest of the official six, and once everyone is ready
 * the table deals each player a faction and a station, as the recording dealt them. Then four minutes of trading:
 * the learner offers a trade, takes it back, and readies with the rest, which ends trading and starts the setup.
 */

const LEARNER = TUTORIAL_RECIPE.learner;
const DRAFT = 'Bene Gesserit';
const BAN = 'Ixians';

/** A button in the drafting list's row for a faction, by the button's own word. */
const draftButton = (faction: string, word: 'Draft' | 'Ban') => () => {
  const row = [...document.querySelectorAll('[data-drafting-panel] li')].find((item) =>
    item.textContent?.includes(faction)
  );
  return (
    [...(row?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim().startsWith(word)) ?? null
  );
};

/* The header's Ready toggle, in the draft and while trading. */
const readyButton = () =>
  [...document.querySelectorAll('header button')].find((button) => button.textContent?.trim().startsWith('Ready')) ??
  null;

const factionId = (snapshot: () => GameSnapshot, name: string) =>
  snapshot().draft?.factions.find((faction) => faction.linked && faction.name === name)?.id;

/* The others draft the factions the recording dealt them and declare themselves ready, as players at a real table would. */
function othersDraft(snapshot: () => GameSnapshot, players: TablePlayers) {
  const seats = snapshot().roster?.seats ?? [];
  const official = ['Fremen', 'House Atreides', 'House Harkonnen', 'Emperor', 'Spacing Guild'];
  players.others().forEach((seat, index) => {
    const name = official[index];
    const id = name && factionId(snapshot, name);
    if (id && seats.some((entry) => entry.id === seat)) {
      players.act(seat, { kind: 'draft-pick', factionId: id });
    }
  });
  for (const seat of players.others()) {
    players.act(seat, { kind: 'draft-ready', ready: true });
  }
}

/* The others declare themselves ready to start, which ends trading once the learner is ready too. */
function othersReady(players: TablePlayers) {
  for (const seat of players.others()) {
    const round = players.viewOf(seat).swapping?.round;
    if (round) {
      players.act(seat, { kind: 'swap-ready', round, seat, ready: true });
    }
  }
}

const myOffer = (snapshot: () => GameSnapshot) =>
  snapshot().swapping?.offers.some((offer) => offer.origin === LEARNER) ?? false;

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  return [
    task({
      id: 'table-full',
      task: 'The table is full',
      detail:
        'Every seat is taken, so the draft is on. Nobody has a faction yet: first everyone drafts the factions they want in the game and bans the ones they don’t. The bar at the top shows what the deal still waits for. Press {Enter} to go on.',
      anchor: { kind: 'page', element: element('.seated-phase-status') },
      ...pressEnter(),
    }),
    task({
      id: 'draft',
      task: `Draft ${DRAFT}`,
      detail: `The list holds the factions made for this ruleset. Press Draft beside ${DRAFT} to put it in the game. A drafted faction is not yet yours: the deal decides who plays what.`,
      anchor: { kind: 'page', element: draftButton(DRAFT, 'Draft') },
      begin: () => undefined,
      done: () => {
        const id = factionId(snapshot, DRAFT);
        return Boolean(id && snapshot().draft?.picks[LEARNER]?.includes(id));
      },
    }),
    task({
      id: 'ban',
      task: `Ban the ${BAN}`,
      detail: `Press Ban beside the ${BAN} to keep them out of this game, whoever drafts them.`,
      anchor: { kind: 'page', element: draftButton(BAN, 'Ban') },
      begin: () => undefined,
      done: () => {
        const id = factionId(snapshot, BAN);
        return Boolean(id && snapshot().draft?.bans[LEARNER]?.includes(id));
      },
    }),
    task({
      id: 'ready',
      task: 'Say you are ready',
      detail:
        'The others have drafted the rest of the six and are ready. Press Ready, top right. Once everyone is ready, the table deals each player one of the drafted factions and a place at the table, at random.',
      anchor: { kind: 'page', element: readyButton },
      begin: () => othersDraft(snapshot, players),
      done: () => snapshot().stage === 'swapping',
    }),
    task({
      id: 'dealt',
      task: 'Your faction and seat',
      detail:
        'You were dealt Bene Gesserit. Now there are four minutes to trade: anyone may swap their faction and seat with another player, if both agree. Press {Enter} to go on.',
      anchor: { kind: 'page', element: element('.seated-phase-status') },
      ...pressEnter(),
    }),
    task({
      id: 'offer',
      task: 'Offer a trade',
      detail:
        'Click the House Atreides token in the bar under the table: their window shows their faction and seat. Press Offer trade there. They see your offer as an arc across the table, and can accept it.',
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector('button[aria-label^="Offer trade to"]') ??
          document.querySelector('nav[aria-label="Chats"] button[aria-label*=", House Atreides"]'),
      },
      begin: () => undefined,
      done: () => myOffer(snapshot),
    }),
    task({
      id: 'cancel',
      task: 'Take your offer back',
      detail:
        'Changed your mind? Press Cancel offer in their window, so you keep Bene Gesserit for the chapters after this one.',
      anchor: { kind: 'page', element: element('button[aria-label^="Cancel offer to"]') },
      begin: () => undefined,
      done: () => !myOffer(snapshot),
    }),
    task({
      id: 'start',
      task: 'Start the game',
      detail:
        'The others are ready to play. Press Ready, top right: once everyone is ready, or the four minutes run out, trading ends and the setup begins.',
      anchor: { kind: 'page', element: readyButton },
      begin: () => othersReady(players),
      done: () => snapshot().swapping?.closed === true || snapshot().stage !== 'swapping',
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'A full table drafts the factions it wants and bans the ones it doesn’t',
  'Once everyone is ready, each player is dealt a drafted faction and a seat at random',
  'For four minutes after the deal, two players can trade if both agree',
  'Trading ends once everyone is ready, and the setup begins',
];

export const draftAndTrade: ChapterScript = { slug: 'draft-and-trade', checkpoint: 'drafting', tasks, learned };

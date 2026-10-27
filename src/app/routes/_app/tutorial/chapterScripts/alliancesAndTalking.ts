import { alliesOf } from '@shared/play/alliances';
import type { GameSnapshot } from '@shared/play/protocol';

import { FACTION_INFO } from '../../play/compass/windows';
import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { buttonIn, element, openedWindow, task, viaCompass, windowShown } from './guideChecks';

/*
 * Chapter 16, "Alliances and talking": a word with one player, a look at their faction, and an alliance from offer to break.
 * The chat bar under the table holds a token for every player; a token opens that player's chat, and the token in the chat's
 * title opens their faction information, where the alliance offer sits. House Atreides answers the chat and accepts the offer
 * by itself, as a player at the table would, and the ally then sits twice right on the compass.
 */

const PARTNER = 'House Atreides';
/* How long Atreides thinks over the offer before it accepts. */
const ACCEPT_AFTER_MS = 1500;
type Seat = NonNullable<GameSnapshot['roster']>['seats'][number];

/* Atreides answers each offer the learner makes to it once, a moment after it arrives; the timer stops if the task ends first. */
function atreidesAccepts(snapshot: () => GameSnapshot, players: TablePlayers, partner: () => Seat | undefined) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const answered = new Set<number>();
  const watch = setInterval(() => {
    const own = snapshot().bank?.factionId;
    const seat = partner();
    const offer = snapshot().alliances?.offers.find(
      (entry) => entry.from === own && entry.to === seat?.faction?.id && !answered.has(entry.id)
    );
    if (!offer || !seat || timer) {
      return;
    }
    answered.add(offer.id);
    timer = setTimeout(() => {
      players.act(seat.id, { kind: 'alliance-accept', factionId: offer.from, offer: offer.id });
      timer = undefined;
    }, ACCEPT_AFTER_MS);
  }, 300);
  return () => {
    clearInterval(watch);
    clearTimeout(timer);
  };
}

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const partner = () => snapshot().roster?.seats.find((seat) => seat.faction?.name === PARTNER);
  const partnerSeat = () => partner()?.id;
  const chatWindow = () => `[data-window="player:${partnerSeat()}"]`;
  const history = () => document.querySelector(`${chatWindow()} [aria-label="Conversation history"]`);
  const allies = () => alliesOf(snapshot().alliances, snapshot().bank?.factionId ?? '');
  const allied = () => allies().includes(partner()?.faction?.id ?? '');
  return [
    task({
      id: 'chat',
      task: 'Say hello to House Atreides',
      detail:
        'The chat bar under the table has a token for every player. Click the Atreides token to open a chat only the two of you read, type a message and press {Enter}.',
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector(history() ? `${chatWindow()} [aria-label="Message"]` : `[aria-label*=", ${PARTNER}"]`),
      },
      /* Conversations outlive a Reset, so only entries dated after the task began count: the learner's message and the answer. */
      begin: () => Date.now(),
      done: (start) =>
        [...(history()?.querySelectorAll('time') ?? [])].filter((time) => Date.parse(time.dateTime) >= start).length >=
        2,
    }),
    task({
      id: 'faction',
      task: 'Look up their faction',
      detail:
        'Who are you talking to? Click the Atreides token in the chat’s title. Their faction information opens: the rules they play by, their leaders and their alliance.',
      anchor: { kind: 'page', element: element(`${chatWindow()} header button[aria-label="${PARTNER} info"]`) },
      ...openedWindow(windowShown(FACTION_INFO)),
    }),
    task({
      id: 'offer',
      task: 'Offer them an alliance',
      detail:
        'In the faction information, press Offer alliance, the handshake beside their status. An arrow runs from your token to theirs until they answer, and Atreides accepts a moment later.',
      anchor: { kind: 'page', element: buttonIn(FACTION_INFO, 'Offer alliance') },
      begin: () => ({ stop: atreidesAccepts(snapshot, players, partner) }),
      done: allied,
      finish: (watch: { stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'ally-chat',
      task: 'Talk to your ally',
      detail:
        'Allies show on the table: both faction tokens now stand on coins in each other’s colour. Close the chat with the × in its title. Your ally has a place of its own on the compass, twice right, so the chat is always at hand: hold {Space}, tap {→} twice and let go, or press {F}.',
      anchor: { kind: 'page', element: viaCompass('ally') },
      ...openedWindow(() => document.querySelector(chatWindow()) !== null),
    }),
    task({
      id: 'break',
      task: 'Break the alliance',
      detail:
        'Alliances end as they start, by choice. Open the Alliances window by typing: press {Space} to open the controls, type Alliances and press {Enter}. Then press Break alliance, the broken link on your ally’s row.',
      anchor: {
        kind: 'page',
        element: () =>
          buttonIn('alliances', 'Break alliance')() ??
          document.querySelector('[aria-label="Search controls"], [data-compass-launcher]'),
      },
      begin: () => undefined,
      done: () => allies().length === 0,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'A token on the chat bar opens a private chat with that player',
  'The token in a chat’s title opens their faction information',
  'Offer alliance in the faction information; it forms once they accept',
  'Your ally sits twice right on the compass, or on {F}',
  'The Alliances window lists every alliance, and breaks yours',
];

export const alliancesAndTalking: ChapterScript = {
  slug: 'alliances-and-talking',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};

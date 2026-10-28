import { alliesOf } from '@shared/play/alliances';
import type { GameSnapshot } from '@shared/play/protocol';

import { FACTION_INFO } from '../../play/compass/windows';
import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { buttonIn, element, openedWindow, task, viaCompass, windowShown } from './guideChecks';

/*
 * "Talking & Alliances": a word with one player, a look at their faction, and an alliance from offer to break.
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
        'Click the Atreides token below the table, type a message and press {Enter}. Only the two of you can read this chat.',
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
      detail: 'Click the Atreides token beside the chat title to see their faction rules, leaders and alliance.',
      anchor: { kind: 'page', element: element(`${chatWindow()} header button[aria-label="${PARTNER} info"]`) },
      ...openedWindow(windowShown(FACTION_INFO)),
    }),
    task({
      id: 'offer',
      task: 'Offer them an alliance',
      detail: 'Press Offer alliance, the handshake beside their status. Atreides will accept your offer in a moment.',
      anchor: { kind: 'page', element: buttonIn(FACTION_INFO, 'Offer alliance') },
      begin: () => ({ stop: atreidesAccepts(snapshot, players, partner) }),
      done: allied,
      finish: (watch: { stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'ally-chat',
      task: 'Talk to your ally',
      detail:
        'The coloured rings under your faction tokens show that you are allies. Close the chat, then press {F} to open it through the ally shortcut. You can also hold {Space}, tap {→} twice and release.',
      anchor: { kind: 'page', element: viaCompass('ally') },
      ...openedWindow(() => document.querySelector(chatWindow()) !== null),
    }),
    task({
      id: 'break',
      task: 'Break the alliance',
      detail:
        'Press {Space}, type Alliances and press {Enter}. In the Alliances window, press Break alliance beside your ally.',
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

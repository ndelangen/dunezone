import { alliesOf } from '@shared/play/alliances';
import { factionTokenOf } from '@shared/play/factionToken';
import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '@app/widgets/tutorial-guide/TutorialGuide';

import { FACTION_INFO } from '../../play/compass/windows';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, buttonIn, element, openedWindow, pressEnter, task, viaCompass, windowShown } from './guideChecks';

/*
 * "Talking & Alliances": a word with one player, a look at their faction, and an alliance from offer to break.
 * The chat bar under the table holds a token for every player; a token opens that player's chat, and the token in the chat's
 * title opens their faction information. Alliances are made from a faction token's ring on the board (#2978): the learner
 * offers one to Atreides, who accepts by itself, as a player at the table would. Then Fremen offers the learner one;
 * the header's notice leads to the Alliances panel, and accepting it ends the Atreides alliance. The ally sits twice right
 * on the compass, and the learner breaks the alliance from the ally's token.
 */

const PARTNER = 'Atreides';
/* The second faction, whose offer the learner answers. */
const SUITOR = 'Fremen';
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

/* Fremen offers the learner an alliance when the task starts, unless an offer between them already stands or they are allied. */
function suitorOffers(snapshot: () => GameSnapshot, players: TablePlayers, suitor: () => Seat | undefined) {
  const own = snapshot().bank?.factionId;
  const seat = suitor();
  const from = seat?.faction?.id;
  if (!own || !seat || !from) {
    return;
  }
  const alliances = snapshot().alliances;
  const pending = alliances?.offers.some((offer) => offer.from === from && offer.to === own);
  if (pending || alliesOf(alliances, own).includes(from)) {
    return;
  }
  players.act(seat.id, { kind: 'alliance-offer', factionId: own });
}

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const seatOf = (name: string) => () => snapshot().roster?.seats.find((seat) => seat.faction?.name === name);
  const partner = seatOf(PARTNER);
  const suitor = seatOf(SUITOR);
  const chatWindow = (seat: () => Seat | undefined) => `[data-window="player:${seat()?.id}"]`;
  const history = () => document.querySelector(`${chatWindow(partner)} [aria-label="Conversation history"]`);
  const allies = () => alliesOf(snapshot().alliances, snapshot().bank?.factionId ?? '');
  const alliedWith = (seat: () => Seat | undefined) => () => allies().includes(seat()?.faction?.id ?? '');
  const tokenOf = (seat: () => Seat | undefined) => () =>
    at(factionTokenOf(snapshot().table.pieces, seat()?.faction?.id ?? ''));
  return [
    task({
      id: 'chat',
      task: 'Say hello to Atreides',
      detail:
        "Let's have a private chat. Click the Atreides token below the table, type a message and press {Enter}.\n\nOnly the two of you can read it.",
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector(
            history() ? `${chatWindow(partner)} [aria-label="Message"]` : `[aria-label*=", ${PARTNER}"]`
          ),
      },
      /* Conversations outlive a Reset, so only entries dated after the task began count: the learner's message and the answer. */
      begin: () => Date.now(),
      done: (start) =>
        [...(history()?.querySelectorAll('time') ?? [])].filter((time) => Date.parse(time.dateTime) >= start).length >=
        2,
    }),
    task({
      id: 'faction',
      task: 'Get to know Atreides',
      detail:
        'Want to check what your new friend can do? Click the Atreides token beside the chat title to see their faction rules and leaders.',
      anchor: { kind: 'page', element: element(`${chatWindow(partner)} header button[aria-label="${PARTNER} info"]`) },
      ...openedWindow(windowShown(FACTION_INFO)),
    }),
    task({
      id: 'offer',
      task: 'Offer an alliance',
      detail:
        "Let's team up! Right-click the Atreides faction token on the board and choose Offer alliance.\n\nAtreides will accept in a moment.",
      anchor: { kind: 'table', point: tokenOf(partner) },
      begin: () => ({ stop: atreidesAccepts(snapshot, players, partner) }),
      done: alliedWith(partner),
      finish: (watch: { stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'alliance-rings',
      task: 'Spot the alliance rings',
      detail:
        'The coloured rings under your faction tokens show that you are allies. They stay visible while you play.\n\nPress {Enter} to continue.',
      anchor: {
        kind: 'table',
        point: () => at(factionTokenOf(snapshot().table.pieces, snapshot().bank?.factionId ?? '')),
      },
      ...pressEnter(),
    }),
    task({
      id: 'alliance-list',
      task: 'See every alliance',
      detail:
        'The left side of the screen also shows the alliances. You can check who is teamed up without opening a panel.\n\nPress {Enter} to continue.',
      anchor: { kind: 'page', element: element('[aria-label="Alliances"]') },
      ...pressEnter(),
    }),
    task({
      id: 'incoming',
      task: 'Read an alliance offer',
      detail:
        'Fremen wants to team up with you too. Their offer shows at the top of the screen.\n\nClick Alliances in it to answer.',
      anchor: { kind: 'page', element: element('[aria-label="Alliance offer"] button') },
      begin: () => {
        suitorOffers(snapshot, players, suitor);
        return openedWindow(windowShown('alliances')).begin();
      },
      done: (watch: { was: boolean; closed: boolean }) =>
        openedWindow(windowShown('alliances')).done(watch) || alliedWith(suitor)(),
    }),
    task({
      id: 'accept',
      task: 'Switch sides',
      detail:
        "Press the alliance button beside Fremen's offer to accept it.\n\nAccepting a new alliance ends the one you have, so Atreides is on their own again.",
      anchor: { kind: 'page', element: buttonIn('alliances', 'Accept alliance') },
      begin: () => undefined,
      done: alliedWith(suitor),
    }),
    task({
      id: 'ally-chat',
      task: 'Talk to your ally',
      detail:
        'Close the Alliances panel, then press {F} to open your ally chat.\n\nYou can also hold {Space}, tap {→} twice and release.',
      anchor: { kind: 'page', element: viaCompass('ally') },
      ...openedWindow(() => document.querySelector(chatWindow(suitor)) !== null),
    }),
    task({
      id: 'break',
      task: 'End the alliance',
      detail:
        'Sometimes alliances come to an end. Close the chat, then right-click the Fremen faction token at the bottom of the table and choose Break alliance.',
      anchor: { kind: 'table', point: tokenOf(suitor) },
      begin: () => undefined,
      done: () => allies().length === 0,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'A token on the chat bar opens a private chat with that player',
  'The token in a chat’s title opens their faction information',
  'Right-click a faction token to offer an alliance; it forms once they accept',
  'An offer to you shows at the top; answer it in the Alliances panel',
  'Accepting a new alliance ends the one you had',
  'Your ally sits twice right on the compass, or on {F}',
  'Right-click your ally’s token to break the alliance',
];

export const alliancesAndTalking: ChapterScript = {
  slug: 'alliances-and-talking',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};

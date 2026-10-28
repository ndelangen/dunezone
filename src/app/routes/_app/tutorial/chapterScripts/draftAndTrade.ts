import type { GameSnapshot } from '@shared/play/protocol';
import { TUTORIAL_RECIPE } from '@shared/tutorial/recipe';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, task } from './guideChecks';

/*
 * "Draft and trade": the table from the moment the last seat is taken, before anyone has drafted.
 * The learner searches the catalogue, drafts one of three familiar factions and bans the Ixians, the others draft the rest of the official six, and once everyone is ready
 * the table deals each player a faction and a station, as the recording dealt them. Then four minutes of trading:
 * the learner offers a trade, takes it back, and readies with the rest, which ends trading and starts the setup.
 */

const LEARNER = TUTORIAL_RECIPE.learner;
const DRAFT_CHOICES = ['Emperor', 'Fremen', 'House Harkonnen'] as const;
const SEARCH = '[data-drafting-panel] input[aria-label="Search factions"]';
const search = () => document.querySelector<HTMLInputElement>(SEARCH);
const searched = (text: string) => search()?.value.trim().toLowerCase() === text.toLowerCase();
const BAN = 'Ixians';

/*
 * A button in the drafting list's row for a faction, by the button's own word. The row's name must be the faction's whole name,
 * so a search that also lists "Ixians (In Progress)" still finds the Ixians.
 */
const draftButton = (faction: string, word: 'Draft' | 'Ban') => () => {
  const row = [...document.querySelectorAll('[data-drafting-panel] li')].find(
    (item) =>
      [...item.querySelectorAll('p')].some((name) => name.textContent?.trim() === faction) &&
      [...item.querySelectorAll('p')].some((note) => note.textContent?.trim() === 'suitable for this ruleset')
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
function othersDraft(snapshot: () => GameSnapshot, players: TablePlayers, selected: string) {
  const seats = snapshot().roster?.seats ?? [];
  const official = ['Bene Gesserit', 'Fremen', 'House Atreides', 'House Harkonnen', 'Emperor', 'Spacing Guild'].filter(
    (name) => name !== selected
  );
  players.others().forEach((seat, index) => {
    const name = official[index];
    const id = name && factionId(snapshot, name);
    if (id && seats.some((entry) => entry.id === seat)) {
      players.act(seat, { kind: 'draft-pick', factionId: id });
    }
  });
  return keepOthersReady(snapshot, players);
}

/*
 * A change to a pick or ban clears everyone's readiness, so the others ready up again whenever they find themselves not ready.
 * Once the deal ends the draft there is nothing left to be ready for, so they stop rather than send what the table refuses.
 */
export function keepOthersReady(snapshot: () => GameSnapshot, players: TablePlayers) {
  const readyUp = () => {
    const { stage, draft } = snapshot();
    if (stage !== 'drafting' || !draft) {
      clearInterval(watch);
      return;
    }
    const ready = draft.ready;
    for (const seat of players.others()) {
      if (!ready.includes(seat)) {
        players.act(seat, { kind: 'draft-ready', ready: true });
      }
    }
  };
  const watch = setInterval(readyUp, 500);
  readyUp();
  return () => clearInterval(watch);
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

/* Trading ends once everyone is ready or its four minutes run out; a learner who lets them run out has nothing left to trade, so the trade tasks count as passed. */
const tradingOver = (snapshot: () => GameSnapshot) =>
  snapshot().swapping?.closed === true || snapshot().stage !== 'swapping';

/*
 * What the deal gave the learner, and whom to offer a trade. The deal follows the recording only when the draft matches it;
 * a learner who drafts or bans more is dealt at random, so the text names what the table actually dealt.
 */
const dealt = (snapshot: () => GameSnapshot) =>
  snapshot().roster?.seats.find((entry) => entry.id === LEARNER)?.faction?.name ?? 'your faction';
const PARTNER = 'House Atreides';
const partner = (snapshot: () => GameSnapshot) => {
  const others = (snapshot().roster?.seats ?? [])
    .filter((entry) => entry.id !== LEARNER)
    .flatMap((entry) => (entry.faction ? [entry.faction.name] : []));
  return others.includes(PARTNER) ? PARTNER : (others[0] ?? PARTNER);
};

function tasks(snapshot: () => GameSnapshot, players: TablePlayers, random: () => number = Math.random): GuideTask[] {
  const draft = DRAFT_CHOICES[Math.floor(random() * DRAFT_CHOICES.length)]!;
  const spokenDraft = draft.replace(/^House /, '');
  return [
    task({
      id: 'search',
      task: 'Find a faction',
      detail:
        "Everyone's here! Before factions are dealt, you choose which ones go into the pool together.\n\nThe search box helps you find them. Type atr to look for Atreides.",
      anchor: { kind: 'page', element: element(SEARCH) },
      begin: () => undefined,
      done: () => searched('atr'),
    }),
    task({
      id: 'suitability',
      task: 'Find a suitable faction',
      detail: `See "suitable for this ruleset"? That version of the faction fits the rules you're playing.\n\nA faction can appear more than once because people have made different versions. You can mix and match them, but drafting the same faction more than once gets confusing for players.\n\nLet's try ${spokenDraft}. Replace atr in the search box with ${spokenDraft}.`,
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('[data-drafting-panel] p')].find(
            (node) => node.textContent?.trim() === 'suitable for this ruleset'
          ) ?? search(),
      },
      begin: () => undefined,
      done: () => searched(spokenDraft),
    }),
    task({
      id: 'draft',
      task: `Draft ${spokenDraft}`,
      detail: `Fancy seeing ${spokenDraft} in the game? Find the version marked "suitable for this ruleset" and press Draft to add it to the pool.\n\nAnyone could be dealt this faction, including you.`,
      anchor: { kind: 'page', element: () => draftButton(draft, 'Draft')() ?? search() },
      begin: () => undefined,
      done: () => {
        const id = factionId(snapshot, draft);
        return Boolean(id && snapshot().draft?.picks[LEARNER]?.includes(id));
      },
    }),
    task({
      id: 'ban',
      task: `Ban the ${BAN}`,
      detail: `Not keen on playing against the ${BAN}? Search for Ixians, then press Ban beside the version marked "suitable for this ruleset".\n\nA banned faction can't be dealt, even if another player drafts it.`,
      anchor: { kind: 'page', element: () => draftButton(BAN, 'Ban')() ?? search() },
      begin: () => undefined,
      done: () => {
        const id = factionId(snapshot, BAN);
        return Boolean(id && snapshot().draft?.bans[LEARNER]?.includes(id));
      },
    }),
    task({
      id: 'ready',
      task: 'Ready for the deal',
      detail:
        'The other players have made their picks. Press Ready in the top right.\n\nWhen everyone is ready, each player gets a random faction and seat.',
      anchor: { kind: 'page', element: readyButton },
      begin: () => othersDraft(snapshot, players, draft),
      done: () => snapshot().stage === 'swapping',
      finish: (stop: () => void) => stop(),
    }),
    task({
      id: 'offer',
      task: 'Offer a trade',
      get detail() {
        return `You got ${dealt(snapshot)}! You have four minutes to agree on a trade, which swaps both factions and seats.\n\nWant to try? Click the ${partner(snapshot)} token below the table, then press Offer trade. They can choose whether to accept.`;
      },
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector('button[aria-label^="Offer trade to"]') ??
          document.querySelector(`nav[aria-label="Chats"] button[aria-label*=", ${CSS.escape(partner(snapshot))}"]`),
      },
      begin: () => undefined,
      done: () => myOffer(snapshot) || tradingOver(snapshot),
    }),
    task({
      id: 'cancel',
      task: 'Cancel your offer',
      get detail() {
        return `Changed your mind? Press Cancel offer in the same window to keep ${dealt(snapshot)}.`;
      },
      anchor: { kind: 'page', element: element('button[aria-label^="Cancel offer to"]') },
      begin: () => undefined,
      done: () => !myOffer(snapshot) || tradingOver(snapshot),
    }),
    task({
      id: 'start',
      task: 'Start the game',
      detail:
        'Press Ready in the top right. Setup begins when everyone is ready or the four-minute trading period ends.',
      anchor: { kind: 'page', element: readyButton },
      begin: () => othersReady(players),
      done: () => tradingOver(snapshot),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Search for a faction and check whether it suits the ruleset',
  'A full table drafts the factions it wants and bans the ones it doesn’t',
  'Once everyone is ready, each player is dealt a drafted faction and a seat at random',
  'For four minutes after the deal, two players can trade if both agree',
  'Trading ends once everyone is ready, and the setup begins',
];

export const draftAndTrade: ChapterScript = { slug: 'draft-and-trade', checkpoint: 'drafting', tasks, learned };

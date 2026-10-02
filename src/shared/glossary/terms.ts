/**
 * The game vocabulary Dune Zone prefers, and the words it avoids for the same ideas.
 * This file is the single source of truth: the public glossary page renders it, and prose inputs hint from it.
 * Product vocabulary (Groups, the catalogue, Rulebook structure) lives in CONTEXT.md;
 * this file holds the words players use about the game itself.
 */

export type GlossaryTopic = 'pieces' | 'turn' | 'battle' | 'board' | 'spice' | 'cards' | 'factions';

/**
 * Where a preferred term comes from.
 * `rulebook` means the 2019 Dune rulebook prints it;
 * `house` means Dune Zone chose it because the rulebook does not settle it.
 */
type GlossarySource = 'rulebook' | 'house';

type AvoidedWord = {
  /** The word or phrase as a person would type it; matching ignores case. */
  word: string;
  /** Other spellings and inflections of the same word, matched the same way. */
  forms?: readonly string[];
  /** Text around a match that makes it acceptable, such as the card name Cheap Hero. */
  exceptions?: readonly RegExp[];
  /** False keeps the word out of input hints because it has common meanings outside the game; the page still lists it. */
  hint?: boolean;
};

export type GlossaryTerm = {
  /** Stable anchor on the glossary page; never reuse one for a different idea. */
  id: string;
  term: string;
  topic: GlossaryTopic;
  /** What the term means, written for someone who has never played. */
  explanation: string;
  /** Why this word won over its alternatives. */
  reason: string;
  source: GlossarySource;
  avoid: readonly AvoidedWord[];
};

export const GLOSSARY_TOPICS: readonly { id: GlossaryTopic; label: string; summary: string }[] = [
  { id: 'pieces', label: 'Pieces on the board', summary: 'The tokens each faction moves around Arrakis.' },
  { id: 'turn', label: 'The turn', summary: 'How one round of play is divided into phases.' },
  { id: 'battle', label: 'Battle', summary: 'How factions settle who stays in a contested territory.' },
  { id: 'board', label: 'The board', summary: 'The places on the map of Arrakis.' },
  { id: 'spice', label: 'Spice', summary: 'The one currency of the game.' },
  { id: 'cards', label: 'Cards', summary: 'The decks every game uses.' },
  { id: 'factions', label: 'Factions and people', summary: 'Who plays, and what they play as.' },
];

export const GLOSSARY: readonly GlossaryTerm[] = [
  {
    id: 'troop',
    term: 'Troop',
    topic: 'pieces',
    explanation:
      'One of the small faction tokens you ship onto Arrakis, stack in territories and send into battle. Each faction starts with a fixed number of them.',
    reason:
      'The 2019 rulebook calls these tokens forces. Dune Zone says troop, the word its faction editor and catalogue are built on, so one name runs through the whole site.',
    source: 'house',
    avoid: [
      { word: 'force', forms: ['forces'] },
      { word: 'unit', forms: ['units'], hint: false },
      { word: 'soldier', forms: ['soldiers'] },
    ],
  },
  {
    id: 'elite-troop',
    term: 'Elite troop',
    topic: 'pieces',
    explanation:
      'A troop printed with a star that counts for more in battle, such as the Fremen Fedaykin or the Emperor’s Sardaukar.',
    reason:
      'The rulebook calls these starred forces. Elite troop follows Dune Zone’s choice of troop and names all of them at once.',
    source: 'house',
    avoid: [
      { word: 'elite force', forms: ['elite forces'] },
      { word: 'special force', forms: ['special forces'] },
      { word: 'starred force', forms: ['starred forces'] },
    ],
  },
  {
    id: 'reserves',
    term: 'Reserves',
    topic: 'pieces',
    explanation:
      'Your troops that are not on the board yet. You ship them from your reserves onto Arrakis during Shipment and Movement.',
    reason: 'The rulebook word. Off-planet and supply describe the same pile less precisely.',
    source: 'rulebook',
    avoid: [{ word: 'off-planet', forms: ['offworld', 'off-world', 'off planet'] }],
  },
  {
    id: 'tleilaxu-tanks',
    term: 'Tleilaxu Tanks',
    topic: 'pieces',
    explanation:
      'Where troops and leaders go when they die. They come back from the Tleilaxu Tanks during the Revival phase.',
    reason: 'The rulebook name. Graveyard and dead pile are borrowed from other games.',
    source: 'rulebook',
    avoid: [
      { word: 'tanks', exceptions: [/tleilaxu\s+tanks/i] },
      { word: 'graveyard', forms: ['graveyards'] },
      { word: 'dead pile' },
    ],
  },
  {
    id: 'token',
    term: 'Token',
    topic: 'pieces',
    explanation:
      'A flat cardboard component, such as a leader disc or a tech token. Troops are tokens too, but the more specific word is used whenever it applies.',
    reason: 'Dune Zone’s word for every cardboard component that is not a card.',
    source: 'house',
    avoid: [
      { word: 'chit', forms: ['chits'] },
      { word: 'counter', forms: ['counters'], hint: false },
    ],
  },
  {
    id: 'turn',
    term: 'Turn',
    topic: 'turn',
    explanation: 'One full pass through all nine phases. A game lasts a set number of turns.',
    reason: 'The rulebook only ever says turn. Round means the same thing, so it is not used.',
    source: 'rulebook',
    avoid: [{ word: 'rounds' }, { word: 'round', hint: false }],
  },
  {
    id: 'phase',
    term: 'Phase',
    topic: 'turn',
    explanation:
      'One of the nine parts of a turn, played in order: Storm, Spice Blow and Nexus, CHOAM Charity, Bidding, Revival, Shipment and Movement, Battle, Spice Harvest and Mentat Pause.',
    reason: 'The rulebook word for each part of a turn.',
    source: 'rulebook',
    avoid: [{ word: 'stage', forms: ['stages'], hint: false }],
  },
  {
    id: 'bidding',
    term: 'Bidding',
    topic: 'turn',
    explanation: 'The phase where factions spend spice to buy treachery cards, one card at a time.',
    reason: 'The rulebook phase name. Auction describes it well but is a second name for the same phase.',
    source: 'rulebook',
    avoid: [{ word: 'auction', forms: ['auctions', 'auctioned'] }],
  },
  {
    id: 'revival',
    term: 'Revival',
    topic: 'turn',
    explanation:
      'The phase where factions bring troops and leaders back from the Tleilaxu Tanks. To bring one back is to revive it.',
    reason: 'The rulebook phase name, with revive as its verb.',
    source: 'rulebook',
    avoid: [
      { word: 'resurrect', forms: ['resurrects', 'resurrected', 'resurrection'] },
      { word: 'respawn', forms: ['respawns', 'respawned'] },
    ],
  },
  {
    id: 'shipment-and-movement',
    term: 'Shipment and Movement',
    topic: 'turn',
    explanation:
      'The phase where each faction ships troops from its reserves onto the board and then moves one group of troops.',
    reason: 'The rulebook phase name, written out in full so it reads the same everywhere.',
    source: 'rulebook',
    avoid: [
      { word: 'ship & move', forms: ['ship and move', 'shipping and movement', 'ship/move'] },
      { word: 'deploy', forms: ['deploys', 'deployed', 'deployment'] },
    ],
  },
  {
    id: 'spice-harvest',
    term: 'Spice Harvest',
    topic: 'turn',
    explanation: 'The phase where troops standing on spice collect it from the board.',
    reason: 'The 2019 rulebook names the phase Spice Harvest; the older rules called it Spice Collection.',
    source: 'rulebook',
    avoid: [{ word: 'spice collection', forms: ['collection phase'] }],
  },
  {
    id: 'battle',
    term: 'Battle',
    topic: 'battle',
    explanation:
      'What happens when two factions have troops in the same territory during the Battle phase. Both secretly choose a battle plan, and the loser’s troops go to the Tleilaxu Tanks. Factions battle; they do not fight or do combat.',
    reason:
      'The rulebook uses battle for the phase, the event and the act, and never uses combat. One word for all three keeps rules text and code readable.',
    source: 'rulebook',
    avoid: [
      { word: 'combat', forms: ['combats'] },
      { word: 'combatant', forms: ['combatants', 'noncombatant', 'non-combatant'] },
      { word: 'fight', forms: ['fights', 'fighting', 'fought'] },
      { word: 'duel', forms: ['duels'] },
    ],
  },
  {
    id: 'aggressor',
    term: 'Aggressor',
    topic: 'battle',
    explanation:
      'The faction that resolves a battle first, because it comes first in storm order. The other faction in the battle is its opponent.',
    reason: 'The rulebook word. Attacker suggests the aggressor chose the battle, which it did not.',
    source: 'rulebook',
    avoid: [{ word: 'attacker', forms: ['attackers'] }],
  },
  {
    id: 'battle-plan',
    term: 'Battle plan',
    topic: 'battle',
    explanation:
      'The secret choices each faction makes for one battle: how many troops to dial, which leader to send, and which weapon and defense cards to play.',
    reason: 'The rulebook word.',
    source: 'rulebook',
    avoid: [{ word: 'battle strategy' }, { word: 'combat plan' }],
  },
  {
    id: 'battle-wheel',
    term: 'Battle wheel',
    topic: 'battle',
    explanation: 'The dial each faction turns in secret to choose how many troops it commits to a battle.',
    reason: 'The rulebook calls the component the battle wheel; dial is what you do with it.',
    source: 'rulebook',
    avoid: [{ word: 'battle dial' }, { word: 'combat wheel' }],
  },
  {
    id: 'territory',
    term: 'Territory',
    topic: 'board',
    explanation:
      'A named place on the map, such as Arrakeen or the Shield Wall. Troops move between territories, and battles happen inside one.',
    reason:
      'The rulebook word. Region already means something else in Dune Zone’s rulebook editor, and area and zone are vaguer.',
    source: 'rulebook',
    avoid: [
      { word: 'region', forms: ['regions'] },
      { word: 'zone', forms: ['zones'] },
      { word: 'area', forms: ['areas'], hint: false },
    ],
  },
  {
    id: 'sector',
    term: 'Sector',
    topic: 'board',
    explanation:
      'One of the eighteen wedges the board is divided into. The storm moves sector by sector, and one territory can span several.',
    reason: 'The rulebook word.',
    source: 'rulebook',
    avoid: [
      { word: 'wedge', forms: ['wedges'] },
      { word: 'slice', forms: ['slices'], hint: false },
    ],
  },
  {
    id: 'stronghold',
    term: 'Stronghold',
    topic: 'board',
    explanation:
      'One of the five protected territories: Arrakeen, Carthag, Sietch Tabr, Habbanya Sietch and Tuek’s Sietch. Holding enough of them wins the game.',
    reason: 'The rulebook word, used for cities and sietches alike.',
    source: 'rulebook',
    avoid: [
      { word: 'city', forms: ['cities'] },
      { word: 'fortress', forms: ['fortresses'] },
    ],
  },
  {
    id: 'storm',
    term: 'Storm',
    topic: 'board',
    explanation:
      'The great sandstorm that sweeps around the board each turn, destroying troops and spice in the sectors it passes.',
    reason: 'The rulebook word.',
    source: 'rulebook',
    avoid: [{ word: 'sandstorm', forms: ['sandstorms'], hint: false }],
  },
  {
    id: 'spice',
    term: 'Spice',
    topic: 'spice',
    explanation:
      'The currency of the game. Factions collect it from the board and spend it on cards, shipping and battles.',
    reason:
      'The rulebook word. Melange is the same substance in the novels, and credits or solari are a different currency.',
    source: 'rulebook',
    avoid: [
      { word: 'melange', hint: false },
      { word: 'credit', forms: ['credits'] },
      { word: 'solari', forms: ['solaris'] },
      { word: 'money' },
    ],
  },
  {
    id: 'spice-bank',
    term: 'Spice Bank',
    topic: 'spice',
    explanation:
      'The shared pile of spice that belongs to nobody. Spice you pay goes to the Spice Bank, and spice you collect comes from it.',
    reason: 'The rulebook word. Spice supply and spice pool describe the same pile.',
    source: 'rulebook',
    avoid: [{ word: 'spice supply' }, { word: 'spice pool' }],
  },
  {
    id: 'treachery-card',
    term: 'Treachery card',
    topic: 'cards',
    explanation:
      'A card bought during Bidding: weapons, defenses and special effects you play in battle or at other moments.',
    reason: 'The rulebook word.',
    source: 'rulebook',
    avoid: [{ word: 'trick card', forms: ['trick cards'] }],
  },
  {
    id: 'traitor-card',
    term: 'Traitor card',
    topic: 'cards',
    explanation:
      'A secret card naming a leader. If that leader is sent into battle against you, you can reveal the card to win that battle.',
    reason: 'The rulebook word.',
    source: 'rulebook',
    avoid: [],
  },
  {
    id: 'spice-card',
    term: 'Spice card',
    topic: 'cards',
    explanation:
      'A card from the spice deck, turned over during Spice Blow to show where new spice appears or when a sandworm strikes.',
    reason:
      'The rulebook word. Territory card names the card after what is printed on it rather than the deck it belongs to.',
    source: 'rulebook',
    avoid: [
      { word: 'territory card', forms: ['territory cards'] },
      { word: 'spice blow card', forms: ['spice blow cards'] },
    ],
  },
  {
    id: 'karama',
    term: 'Karama',
    topic: 'cards',
    explanation:
      'A treachery card that lets you break the rules once, usually by cancelling another faction’s advantage.',
    reason: 'The rulebook spelling.',
    source: 'rulebook',
    avoid: [{ word: 'karma' }],
  },
  {
    id: 'faction',
    term: 'Faction',
    topic: 'factions',
    explanation:
      'The side you play as, such as the Atreides or the Fremen. Each faction has its own troops, leaders and advantages.',
    reason:
      'The rulebook word. House is part of some faction names, like House Atreides, but is not a word for factions in general, because the Fremen and the Spacing Guild are not houses.',
    source: 'rulebook',
    avoid: [
      { word: 'house', forms: ['houses'], exceptions: [/[Hh]ouse\s+[A-Z]/, /great\s+houses?/i, /house\s+rules?/i] },
    ],
  },
  {
    id: 'advantage',
    term: 'Advantage',
    topic: 'factions',
    explanation:
      'A rule that only applies to one faction and breaks the normal rules in its favour. Faction sheets list each faction’s advantages.',
    reason:
      'The faction sheets call these advantages. Ability and power describe the same rules with a second and third name.',
    source: 'rulebook',
    avoid: [
      { word: 'ability', forms: ['abilities'] },
      { word: 'power', forms: ['powers'] },
      { word: 'perk', forms: ['perks'] },
    ],
  },
  {
    id: 'leader',
    term: 'Leader',
    topic: 'factions',
    explanation:
      'A named character disc a faction can send into battle to add strength. Every faction has one faction leader, shown on its shield, and a roster of supporting leaders.',
    reason: 'The rulebook word. Hero is kept only for the treachery card Cheap Hero, which stands in for a leader.',
    source: 'rulebook',
    avoid: [
      { word: 'hero', forms: ['heroes'], exceptions: [/cheap\s+hero/i] },
      { word: 'general', forms: ['generals'], hint: false },
      { word: 'commander', forms: ['commanders'] },
    ],
  },
  {
    id: 'kwisatz-haderach',
    term: 'Kwisatz Haderach',
    topic: 'factions',
    explanation:
      'The Atreides’ special token. Once the Atreides have lost enough troops, it can join a leader in battle, adding strength and stopping that leader from turning traitor.',
    reason: 'Written out in full so new players can look it up.',
    source: 'rulebook',
    avoid: [{ word: 'KH' }],
  },
  {
    id: 'alliance',
    term: 'Alliance',
    topic: 'factions',
    explanation:
      'An agreement formed during a Nexus that lets factions share a victory and some advantages. Each member is the other’s ally.',
    reason: 'The rulebook word, with ally for each member.',
    source: 'rulebook',
    avoid: [
      { word: 'team', forms: ['teams'], hint: false },
      { word: 'coalition', forms: ['coalitions'] },
    ],
  },
];

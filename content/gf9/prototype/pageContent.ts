/** Reviewed sample copy for the GF9 page-composition discussion.
 * Source metadata is authoring evidence, never a block in the printed page.
 * All visual variants consume this same copy. These are samples, not a complete book.
 */
export type PrototypeBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; title?: string; items: string[] }
  | { kind: "callout"; title: string; text: string }
  | { kind: "table"; title?: string; columns: string[]; rows: string[][] };

export type PrototypeSection = {
  id: string;
  title: string;
  blocks: PrototypeBlock[];
};

export type PrototypePage = {
  id: string;
  title: string;
  subtitle: string;
  format: "core-square" | "expansion-narrow";
  sourceReferences: string[];
  currentBookPages: number[];
  artReferences: string[];
  sections: PrototypeSection[];
};

export const battleExample = {
  game: "Basic",
  territory: "Carthag",
  aggressor: {
    faction: "Emperor",
    forcesPresent: 8,
    dial: 3,
    leader: "Caid",
    leaderStrength: 3,
    leaderMemberId: "37c58b9a-c36c-411f-9097-8876eda02ed1",
    leaderImage: "/image/leader/official/caid.png",
    weaponKey: "gf9-crysknife",
    defenseKey: "gf9-shield",
    total: 3,
    survivingForces: 5,
  },
  defender: {
    faction: "Spacing Guild",
    forcesPresent: 6,
    dial: 2,
    leader: "Staban Tuek",
    leaderStrength: 5,
    leaderMemberId: "695097f4-12fb-4004-b42c-bafe7a3ae58e",
    leaderImage: "/image/leader/official/staban.png",
    weaponKey: "gf9-chaumas",
    defenseKey: "gf9-snooper",
    total: 2,
    survivingForces: 0,
  },
  leaderReward: 8,
} as const;

export const prototypePages: PrototypePage[] = [
  {
    id: "core-setup",
    title: "Prepare to play",
    subtitle: "Basic game • Components and setup",
    format: "core-square",
    sourceReferences: ["core-manuscript: components, setup", "GF9 base book, pages 4-6, 17-18"],
    currentBookPages: [4, 6],
    artReferences: ["Faction shield, force tokens, leader discs, battle wheel and base card backs", "Original base book components spread, pages 4-5"],
    sections: [
      {
        id: "components", title: "Set out the components", blocks: [
          { kind: "text", text: "Each faction has a shield, reference sheet, player marker, twenty forces and five leader discs. A leader's printed number is its battle strength and normal revival cost. The character on a shield is not an extra leader." },
          { kind: "text", text: "Set out spice tokens, both battle wheels, the storm marker, turn counter and Destroyed Shield Wall token. In the Basic Game, starred force tokens count as ordinary forces." },
          { kind: "table", title: "Base card decks", columns: ["Deck", "Cards"], rows: [["Spice", "21"], ["Treachery", "33"], ["Traitor", "30"], ["Prediction", "16"], ["Alliance", "6"], ["Storm", "6, used by Advanced Fremen"]] },
        ],
      },
      {
        id: "setup", title: "Set up in this order", blocks: [
          { kind: "list", items: [
            "Put all spice in the Bank. Shuffle the Spice and Treachery decks separately and leave room for discards.",
            "Choose factions, randomly or by drawing numbered Prediction Cards and choosing from highest number to lowest. Players may agree to swap.",
            "Place each player marker in the circle nearest that player's shield and seat. Bene Gesserit secretly records its faction and turn prediction.",
            "Remove Traitor Cards for absent factions. Deal four to each player. Each normally keeps one and returns the others face down to the deck's bottom. Harkonnen keeps all four.",
            "Give factions their starting spice and forces. Put remaining forces in reserves.",
            "Deal one Treachery Card to each faction. Harkonnen receives two. Keep hands secret.",
            "Set the turn counter to 1 and resolve the special first-turn storm procedure.",
          ] },
          { kind: "callout", title: "Adding expansions", text: "Use the participating factions' setup instructions. Leader Skills moves the starting Treachery deal before traitor selection." },
        ],
      },
    ],
  },
  {
    id: "core-shipment", title: "Shipment and Movement",
    subtitle: "Basic game • Each player completes both actions", format: "core-square",
    sourceReferences: ["core-manuscript: shipment, movement", "GF9 base book, pages 9-10, 16"],
    currentBookPages: [17, 18],
    artReferences: ["Spice tokens and force tokens", "Shipment diagram using existing board geometry, without promising additional printed board labels"],
    sections: [
      { id: "sequence", title: "Take your complete turn", blocks: [
        { kind: "text", text: "Beginning with First Player and proceeding to the right, each faction completes its shipment, then its movement. You may decline either action. Newly shipped forces may move immediately." },
      ] },
      { id: "ship", title: "Ship reserves", blocks: [
        { kind: "text", text: "Make one shipment of any number of reserves to one sector of one territory. Identify the sector when a territory spans several sectors." },
        { kind: "table", columns: ["Destination", "Cost per force"], rows: [["Stronghold", "1 spice"], ["Other territory", "2 spice"]] },
        { kind: "text", text: "Pay the Guild if it is playing, otherwise the Bank. The Guild pays the Bank. Ordinary shipment cannot retrieve forces or transfer them between board territories. Fremen placement and Guild cross-shipment have their own rules." },
      ] },
      { id: "move", title: "Move one group", blocks: [
        { kind: "text", text: "Move any number of your forces together from one territory to one destination. You may leave forces behind. You cannot gather forces from several origins or split the group among destinations." },
        { kind: "table", columns: ["Access when movement begins", "Range"], rows: [["Ordinary movement", "1 adjacent territory"], ["Fremen", "2 territories"], ["Occupy Arrakeen or Carthag", "Up to 3 territories"]] },
        { kind: "text", text: "Ornithopters help a moving group anywhere on Arrakis. Newly shipped forces in Arrakeen or Carthag can provide them immediately. Use one range; do not add ranges together. Count territory borders, not sector lines." },
      ] },
      { id: "limits", title: "Check the route", blocks: [
        { kind: "callout", title: "Storm and strongholds", text: "Do not ship into the storm. Do not move into, out of or across it. You cannot enter or pass through a stronghold containing two other factions. The Polar Sink permits all factions and is never a battle site." },
      ] },
    ],
  },
  {
    id: "core-battle", title: "Resolve a battle", subtitle: "Basic game • Worked example", format: "core-square",
    sourceReferences: ["core-manuscript: battle-plan, battle-resolution, weapons", "base-factions: Emperor and Spacing Guild leaders", "GF9 base book, pages 10-11"],
    currentBookPages: [19, 21, 23],
    artReferences: ["Two existing BattlePlan renderers", "Caid and Staban Tuek leader discs", "Crysknife, Shield, Chaumas and Snooper cards", "Emperor and Guild force tokens"],
    sections: [
      { id: "situation", title: "Choose and reveal", blocks: [
        { kind: "text", text: "Emperor is the aggressor in Carthag with 8 forces. Guild defends with 6. Both leaders are available. Neither side calls a traitor, and no special card or faction effect changes this battle." },
        { kind: "text", text: "Each player secretly chooses a dial, one leader and up to one weapon and one defense. Both reveal together. In Basic play, each force is worth one and no spice support is required." },
        { kind: "table", columns: ["Plan", "Emperor", "Spacing Guild"], rows: [["Dial", "3", "2"], ["Leader", "Caid, strength 3", "Staban Tuek, strength 5"], ["Weapon", "Crysknife", "Chaumas"], ["Defense", "Shield", "Snooper"]] },
      ] },
      { id: "weapons", title: "Resolve weapons first", blocks: [
        { kind: "text", text: "Crysknife is a projectile weapon. Guild's Snooper stops poison, so it does not protect Staban Tuek. Chaumas is poison. Emperor's Shield stops projectiles, so it does not protect Caid. Both leaders die and contribute zero." },
      ] },
      { id: "result", title: "Compare totals and take losses", blocks: [
        { kind: "table", columns: ["Faction", "Dial + surviving leader", "Total"], rows: [["Emperor", "3 + 0", "3"], ["Spacing Guild", "2 + 0", "2"]] },
        { kind: "text", text: "Emperor wins, loses its 3 dialed forces and keeps 5 in Carthag. Guild loses all 6 forces. Put both leaders in the Tanks. Emperor takes 8 spice from the Bank for the killed leaders, 3 for Caid and 5 for Staban Tuek." },
        { kind: "text", text: "Guild discards its played cards. Emperor may keep or discard its Crysknife and Shield." },
        { kind: "callout", title: "If the totals tie", text: "The aggressor wins. A killed leader adds zero, but its force dial still counts." },
      ] },
    ],
  },
  {
    id: "core-atreides", title: "Atreides", subtitle: "Basic game • Prescience", format: "core-square",
    sourceReferences: ["core-manuscript: atreides", "base-factions: Atreides", "GF9 base book, page 17"],
    currentBookPages: [31],
    artReferences: ["/vector/logo/atreides.svg", "/image/leader/official/paul.jpg", "Atreides force and five leader discs"],
    sections: [
      { id: "start", title: "Your starting position", blocks: [
        { kind: "table", columns: ["Resource", "Start"], rows: [["Arrakeen", "10 forces"], ["Reserves", "10 forces"], ["Spice", "10"], ["Treachery Cards", "1"], ["Free revival", "2 forces"]] },
        { kind: "text", text: "Keep the Spice and Treachery decks nearby. Your prescience gives you information before other factions must decide." },
      ] },
      { id: "advantages", title: "Learn before you commit", blocks: [
        { kind: "list", items: [
          "Before bidding begins on each normal auction card, inspect it. You alone may keep written records about Treachery Cards. You may share what you learn.",
          "At the start of Shipment and Movement, before anyone moves, inspect the single top card of the Spice Deck.",
          "In each of your battles, require the opponent to reveal one element of its plan: leader, weapon, defense or dial. Asking about an absent weapon or defense still uses the question.",
        ] },
      ] },
      { id: "alliance", title: "Help your ally", blocks: [
        { kind: "text", text: "In your ally's battle, you may require its opponent to show your ally one element of the plan." },
      ] },
      { id: "leaders", title: "Your leaders", blocks: [
        { kind: "table", columns: ["Leader", "Strength"], rows: [["Lady Jessica", "5"], ["Thufir Hawat", "5"], ["Gurney Halleck", "4"], ["Duncan Idaho", "2"], ["Doctor Yueh", "1"]] },
      ] },
    ],
  },
  {
    id: "ixian-tech", title: "Tech Tokens", subtitle: "Ixians & Tleilaxu • Optional module", format: "expansion-narrow",
    sourceReferences: ["ixian-tleilaxu-manuscript: tech-token-setup", "GF9 Ixians & Tleilaxu book, pages 4-5"],
    currentBookPages: [8],
    artReferences: ["gf9-tech-axlotl-tanks", "gf9-tech-heighliners", "gf9-tech-spice-production"],
    sections: [
      { id: "setup", title: "Give out the tokens", blocks: [
        { kind: "text", text: "Keep tokens visible by shields. Tleilaxu starts with Axlotl Tanks, Ixians with Heighliners and Fremen with Spice Production. After the first storm movement, assign absent factions' tokens at random to the next factions in turn order without one." },
      ] },
      { id: "income", title: "Earn income once per phase", blocks: [
        { kind: "list", items: [
          "Axlotl Tanks triggers when a faction takes free revival, unless only Tleilaxu does so.",
          "Heighliners triggers when a faction ships from off-planet, unless only Guild does so.",
          "Spice Production triggers when a faction takes CHOAM Charity, excluding Charity taken only through Bene Gesserit and/or CHOAM advantages.",
        ] },
        { kind: "text", text: "Each qualifying token produces 1 spice per Tech Token its holder controls. Put income on the triggering token and collect it at phase end. Each token triggers only once in its phase. Inflation does not change this income." },
      ] },
      { id: "control", title: "Take tokens and claim victory", blocks: [
        { kind: "text", text: "When you defeat a token holder, take one token of your choice. One faction holding all three counts them as one stronghold. Allies cannot pool tokens." },
        { kind: "callout", title: "Two tokens, two spice", text: "You hold Axlotl Tanks and Heighliners. A qualifying free revival puts 2 spice on Axlotl Tanks. More qualifying revivals that phase add nothing." },
      ] },
    ],
  },
  {
    id: "ecaz-discovery", title: "Reveal a Discovery", subtitle: "Ecaz & Moritani • Optional module", format: "expansion-narrow",
    sourceReferences: ["ecaz-moritani-manuscript: discovery-setup-and-cards, discovering-and-entering, discovery-effects", "assets-package: gf9-discovery-spice-sihaya-ridge", "GF9 Ecaz & Moritani book, pages 12-13"],
    currentBookPages: [14, 15],
    artReferences: ["gf9-discovery-spice-sihaya-ridge", "gf9-discovery-cistern, front and back", "Existing movement/transfer visualization for parent territory and revealed location"],
    sections: [
      { id: "place", title: "Follow both locations on the card", blocks: [
        { kind: "text", text: "Add the seven Discovery module cards to the Spice Deck. Keep the eight face-down Discovery tokens mixed within their Hiereg and Smuggler types." },
        { kind: "text", text: "A Discovery blow destroys the existing spice and troops in its spice territory, then places 6 spice there unless the storm prevents it. Place the indicated type of random face-down token at the separate token location and sector printed on the card." },
        { kind: "callout", title: "Read the Sihaya Ridge card", text: "Its spice goes in Sihaya Ridge. Its face-down Hiereg token goes in Cielago East's west sector. The token does not go beside the spice." },
      ] },
      { id: "reveal", title: "Inspect during Spice Collection", blocks: [
        { kind: "text", text: "A faction with non-advisor troops in the token's territory may inspect it and choose whether to reveal it. If left hidden, the opportunity returns next Spice Collection. Fremen may inspect hidden Hiereg tokens at any time; Guild may inspect hidden Smuggler tokens at any time." },
      ] },
      { id: "enter", title: "A location must be entered", blocks: [
        { kind: "text", text: "Five tokens are locations. Revealing one does not occupy it. At the beginning of the next turn, before storm and Ixian stronghold movement, factions in the parent territory may move non-advisor troops there into the newly revealed location." },
        { kind: "text", text: "Afterward, normal movement enters the parent, then spends another movement to enter the location. Shipment uses the stronghold rate. Troops inside are immune to storm and sandworms." },
        { kind: "callout", title: "Example: Cistern", text: "While occupying Cistern during Spice Collection, take 2 spice from the Bank. Cistern is a location, but it does not count as a stronghold for victory. Jacurutu alone has that benefit." },
      ] },
    ],
  },
];

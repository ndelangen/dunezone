/*
 * Historical layout samples transcribed from the PDFs supplied for this spike.
 * These samples preserve their source's rules and do not establish current game canon.
 * Paragraph breaks and headings are adapted for structured composition.
 */

const sourceRoot = '/Users/me/Projects/Dune/dune-assets/rulesbooks/';
const tokenAsset = (name) => new URL(`./assets/location-${name}.png`, import.meta.url).href;

const fremen = {
  id: 'fremen',
  title: 'Fremen',
  subtitle: 'Faction player sheet. Historical layout sample.',
  source: 'Dune base rulebook, p. 16',
  sourceFile: `${sourceRoot}fremen.pdf`,
  emblem: '/media/vector/logo/fremen.svg',
  sections: [
    {
      id: 'fremen-setup',
      title: 'At start',
      kind: 'rules',
      items: [
        {
          id: 'fremen-starting-forces',
          title: 'Starting forces and spice',
          paragraphs: [
            '10 forces distributed as you like on Sietch Tabr, False Wall South, and False Wall West; and 10 forces in reserves, on the far side of Dune. Start with 3 spice.',
          ],
        },
        {
          id: 'fremen-free-revival',
          title: 'Free revival',
          paragraphs: ['3 forces. You cannot buy additional revivals.'],
        },
      ],
    },
    {
      id: 'fremen-advantages',
      title: 'Advantages',
      kind: 'rules',
      items: [
        {
          id: 'fremen-native-to-dune',
          title: '',
          paragraphs: ['You are native to Dune and know its ways.'],
        },
        {
          id: 'fremen-shipment',
          title: 'Shipment',
          paragraphs: [
            'During shipment, you may bring any or all of your reserves for free onto the Great Flat or onto any one territory within two territories of the Great Flat, subject to storm and occupancy rules.',
          ],
        },
        {
          id: 'fremen-movement',
          title: 'Movement',
          paragraphs: ['During movement you may move your forces two territories instead of one.'],
        },
        {
          id: 'fremen-shai-hulud',
          title: 'Shai-Hulud',
          paragraphs: [
            'If Shai-Hulud appears in a territory where you have forces, they are not devoured. Upon conclusion of the Nexus, you may ride the sandworm and move some or all of the forces in the territory to any territory subject to storm and occupancy rules. Any forces in that territory are not devoured. If Shai-Hulud appears again and you still have forces in the original territory, you may do this again.',
          ],
        },
        {
          id: 'fremen-special-victory',
          title: 'Fremen special victory condition',
          paragraphs: [
            "If no faction has won by the end of the last turn and if you, or no one, occupy Sietch Tabr and Habbanya Sietch and neither Harkonnen, Atreides nor Emperor occupies Tuek's Sietch, your plans to alter Dune have succeeded and you and any allies win the game.",
          ],
        },
      ],
    },
    {
      id: 'fremen-alliance',
      title: 'Alliance',
      kind: 'rules',
      items: [
        {
          id: 'fremen-allied-advantages',
          title: 'Shared advantages',
          paragraphs: [
            'You may decide to protect, or not protect, your allies from being devoured by sandworms and, at your discretion, may also allow them to revive 3 forces for free during revival. In addition, your allies win with you if you win with the Fremen Special Victory Condition.',
          ],
        },
      ],
    },
    {
      id: 'fremen-advanced',
      title: 'Advanced game advantages',
      kind: 'rules',
      items: [
        {
          id: 'fremen-storm-rule',
          title: 'Storm rule',
          paragraphs: [
            'Move the Storm Marker normally using the Battle Wheels on the first turn of the game. Subsequent storm movement is determined by you using your Storm Cards. You randomly select a card from the Storm Deck, secretly look at it, and place it face down on the margin of the game board.',
            "In the next Storm Phase the number on that Storm Card is revealed; the storm is moved counterclockwise that number of sectors and your Storm Card is returned to the Storm Card Deck. You then shuffle the Storm Deck, randomly select a Storm Card and look at it for the next turn's storm movement, and place it face down on the margin of the game board.",
          ],
        },
        {
          id: 'fremen-sandworms',
          title: 'Sandworms',
          paragraphs: [
            'During a Spice Blow, all additional sandworms that appear after the first sandworm can be placed by you in any sand territory you wish. Any forces there, except yours, are devoured.',
          ],
        },
        {
          id: 'fremen-storm-losses',
          title: 'Storm losses',
          paragraphs: [
            'If your forces are caught in a storm, only half of them there are killed. Any fractions are rounded up. You may also bring your reserves into a storm at half loss.',
          ],
        },
        {
          id: 'fremen-fedaykin',
          title: 'Fedaykin',
          paragraphs: [
            'Your three starred forces, Fedaykin, have a special fighting capability. They are worth two normal forces in battle and in taking losses. They are each treated as one force in revival. Only one Fedaykin force can be revived per turn.',
          ],
        },
        {
          id: 'fremen-battles',
          title: 'Battles',
          paragraphs: ['Your forces do not require spice to count at their full strength.'],
        },
      ],
    },
  ],
};

const locations = {
  id: 'locations',
  title: 'Location tokens',
  subtitle: 'Hiereg and Smuggler tokens. Historical layout sample.',
  source: 'Ecaz & Moritani expansion rulebook, p. 13',
  sourceFile: `${sourceRoot}2675E24EDC2A720CCF7B969BF7DC831DD28649D9_EcazMoritani-Rulebook-LOWRES.pdf`,
  sections: [
    {
      id: 'location-rules',
      title: 'Using locations',
      kind: 'rules',
      items: [
        {
          id: 'location-territory-within-territory',
          title: 'Movement, shipment and protection',
          paragraphs: [
            'The location itself is considered a territory within the territory where the token is located. For example, if the Jacurutu Sietch token is in Meridian, a player moving forces would need to first move into Meridian, and then move into the Jacurutu Sietch during normal movement actions.',
            'The cost to ship into a revealed location token is the same for shipping into strongholds. Forces in these locations are immune to the effects of the storm or sandworms.',
          ],
        },
      ],
    },
    {
      id: 'hiereg-tokens',
      title: 'Hiereg tokens',
      kind: 'entries',
      items: [
        {
          id: 'hiereg-inspection',
          title: 'Face-down tokens',
          paragraphs: [
            'Whenever a Hiereg token is face down on the board, the Fremen may look at it at any time without revealing it.',
          ],
        },
        {
          id: 'location-jacurutu-sietch',
          title: 'Jacurutu Sietch',
          asset: tokenAsset('jacurutu-sietch'),
          paragraphs: [
            "This counts as a normal stronghold. If you win a battle in this stronghold, gain 1 spice for each of your opponent's undialed forces that go to the Tanks.",
          ],
        },
        {
          id: 'location-cistern',
          title: 'Cistern',
          asset: tokenAsset('cistern'),
          paragraphs: [
            'If you occupy this territory during the Spice Collection phase, gain 2 spice from the Spice Bank.',
          ],
        },
        {
          id: 'location-ecological-testing-station',
          title: 'Ecological Testing Station',
          asset: tokenAsset('ecological-testing-station'),
          paragraphs: [
            'If you occupy this territory during the Storm phase, you may add or subtract the movement of the storm by 1. This has no effect on Weather Control.',
          ],
        },
        {
          id: 'location-shrine',
          title: 'Shrine',
          asset: tokenAsset('shrine'),
          paragraphs: ['If you occupy this territory, you may play Truthtrance as a Karama card, and vice versa.'],
        },
      ],
    },
    {
      id: 'smuggler-tokens',
      title: 'Smuggler tokens',
      kind: 'entries',
      items: [
        {
          id: 'smuggler-inspection',
          title: 'Face-down tokens',
          paragraphs: [
            'Whenever a Smuggler token is face down on the board, the Spacing Guild may look at it at any time without revealing it.',
          ],
        },
        {
          id: 'location-orgiz-processing-station',
          title: 'Orgiz Processing Station',
          asset: tokenAsset('orgiz-processing-station'),
          paragraphs: [
            'If you occupy this territory during the Spice Collection phase, steal 1 spice of each spice blow collected.',
          ],
        },
        {
          id: 'location-treachery-card-stash',
          title: 'Treachery Card Stash',
          asset: tokenAsset('treachery-card-stash'),
          paragraphs: [
            'Gain 1 Treachery Card. If your hand is full, gain a card then discard any card. Remove this token from the game.',
          ],
        },
        {
          id: 'location-spice-stash',
          title: 'Spice Stash',
          asset: tokenAsset('spice-stash'),
          paragraphs: ['Gain 7 spice from the Spice Bank. Remove this token from the game.'],
        },
        {
          id: 'location-ornithopter',
          title: 'Ornithopter',
          asset: tokenAsset('ornithopter'),
          paragraphs: [
            'Gain the token. You may use it on any subsequent turn to have 3 movement instead of your normal movement for one movement action. Then remove this token from the game.',
          ],
        },
      ],
    },
  ],
};

const karamaGroups = [
  [
    'atreides',
    'Atreides',
    [
      ['bidding', 'Bidding', 'May not look at next card up for bid.'],
      ['movement', 'Movement', 'May not look at Spice card.'],
      ['battle', 'Battle', "May not see part of opponent's Battle Plan."],
      ['kwisatz-haderach', 'Kwisatz Haderach', 'Does not add +2 or protect from being a traitor.'],
    ],
  ],
  [
    'bene-gesserit',
    'Bene Gesserit',
    [
      ['prediction', 'Prediction', 'No effect.'],
      ['spiritual-advisor', 'Spiritual Advisor', 'May not ship 1 force for free.'],
      ['voice', 'Voice', 'May not use Voice.'],
      ['charity', 'Charity', 'Does not collect CHOAM Charity.'],
      ['karama', 'Karama', 'May not use Worthless card as Karama.'],
      ['fighters', 'Fighters', 'Must remain advisors.'],
      ['intrusion', 'Intrusion', 'May not flip to advisors.'],
      ['battle', 'Battle', 'Must remain as advisors.'],
    ],
  ],
  [
    'emperor',
    'Emperor',
    [
      ['bidding', 'Bidding', 'Payment goes to Spice Bank.'],
      ['sardaukar', 'Sardaukar', 'Only count as one normal force.'],
    ],
  ],
  [
    'fremen',
    'Fremen',
    [
      ['shipment', 'Shipment', 'No effect.'],
      ['movement', 'Movement', 'May only move one territory.'],
      ['shai-hulud', 'Shai-Hulud', 'Forces are devoured.'],
      ['victory-condition', 'Victory condition', 'No effect.'],
      ['storm-rule', 'Storm rule', 'May not look at the storm card.'],
      ['worms', 'Worms', 'May not place additional worms this round.'],
      ['storm-losses', 'Storm losses', 'All forces are lost to storm.'],
      ['fedaykin', 'Fedaykin', 'Only count as one normal force.'],
      ['battles', 'Battles', 'Must pay spice to count full strength. Play before dialing.'],
    ],
  ],
  [
    'harkonnen',
    'Harkonnen',
    [
      ['traitors', 'Traitors', 'No effect.'],
      ['treachery', 'Treachery', 'May not gain second card when winning a bid.'],
      ['captured-leaders', 'Captured leaders', 'May not capture a leader.'],
    ],
  ],
  [
    'spacing-guild',
    'Spacing Guild',
    [
      ['payment', 'Payment', 'Payment goes to the Spice Bank.'],
      ['three-types-of-shipment', 'Three types of shipment', 'May not ship forces across the planet or to reserves.'],
      ['half-price', 'Half-price', 'Must pay full price.'],
      ['victory-condition', 'Victory condition', 'No effect.'],
      [
        'ship-and-move',
        'Ship & Move',
        'Must go in turn order. Play when Spacing Guild attempts to change order of turn.',
      ],
    ],
  ],
  [
    'ixian',
    'Ixian',
    [
      ['bidding', 'Bidding', 'May not look at Treachery cards and remove one.'],
      ['movement', 'Cyborg & Suboid movement', 'May not move more than one territory.'],
      ['cyborgs-in-battle', 'Cyborgs in battle', 'Only count as one normal force.'],
      ['suboids-in-battle', 'Suboids in battle', 'Cannot replace Cyborgs lost in battle.'],
      ['hidden-mobile-stronghold', 'Hidden Mobile Stronghold', 'May not move or collect spice.'],
      ['technology', 'Technology', 'May not replace Treachery card.'],
      ['suboid-strength', 'Suboid strength', 'No effect.'],
    ],
  ],
  [
    'tleilaxu',
    'Tleilaxu',
    [
      [
        'face-dancers',
        'Face Dancers',
        'May not replace Face Dancer during Mentat Pause; other Face Dancer effects are not affected.',
      ],
      [
        'revival',
        'Revival',
        'Limited to 3 force revival; full price for all revivals, no payment for free revival, revival payments go to Spice Bank, and may not revive leaders early.',
      ],
      ['gholas', 'Gholas', "May not revive another player's leader this turn."],
    ],
  ],
  [
    'choam',
    'CHOAM',
    [
      [
        'charity',
        'Charity',
        'Prevent from collecting spice except normal CHOAM Charity, and any other player collecting Charity does so from the Spice Bank.',
      ],
      [
        'treachery',
        'Treachery',
        'Prevent from discarding a card for spice. Prevent discarding a Worthless card in that phase for its special effect.',
      ],
      ['revival', 'Revival', 'Limit to reviving up to 3 forces regularly, and must pay 2 spice each.'],
      [
        'inflation',
        'Inflation',
        'Prevent from playing Inflation token in Mentat Pause. Does not prevent flipping if already played.',
      ],
      ['auditor', 'Auditor', 'Prevent Audit.'],
      ['forces', 'Forces', 'Prevent collecting spice payment for forces for one battle.'],
    ],
  ],
  [
    'richese',
    'Richese',
    [
      [
        'bidding',
        'Bidding',
        'Prevent from auctioning a Richese Treachery Card. Play at the start of the Bidding Round.',
      ],
      ['no-field', 'No-Field', 'Prevent from using a No-Field token to ship.'],
      ['black-market', 'Black Market', 'Prevent from selling a card from hand.'],
    ],
  ],
];

const karama = {
  id: 'karama',
  title: 'How does Karama stop abilities?',
  subtitle: 'Reference across ten factions. Historical layout sample.',
  source: 'Dune rules compilation, printed p. 46',
  sourceFile: `${sourceRoot}DuneBoardgame-RulesCompilation-Spreads.pdf`,
  emblem: '/media/vector/icon/karama.svg',
  sections: [
    {
      id: 'karama-alliance-note',
      title: 'Alliance abilities',
      kind: 'rules',
      items: [
        {
          id: 'karama-cancels-alliance',
          title: '',
          paragraphs: ['Karama cards may also be used to cancel Alliance abilities.'],
        },
      ],
    },
    ...karamaGroups.map(([id, title, rows]) => ({
      id: `karama-${id}`,
      title,
      kind: 'table',
      columns: ['Ability', 'Effect'],
      items: rows.map(([rowId, ability, effect]) => ({
        id: `karama-${id}-${rowId}`,
        title: ability,
        paragraphs: [],
        cells: [ability, effect],
      })),
    })),
  ],
};

const faq = {
  id: 'faq',
  title: 'Cards: Karama',
  subtitle: 'Questions and a complete answer by faction. Historical layout sample.',
  source: 'Dune FAQ, November 2020, pp. 7-8',
  sourceFile: `${sourceRoot}Dune-FAQ-Nov-2020.pdf`,
  sections: [
    {
      id: 'faq-karama-general',
      title: 'Using a Karama card',
      kind: 'qa',
      items: [
        {
          id: 'faq-karama-allied-shipment',
          title: 'Can Karama buy shipment for another player, such as an ally?',
          paragraphs: ['Yes, at Guild rates, paid to the Spice Bank.'],
        },
        {
          id: 'faq-karama-auction',
          title: 'How can I use a Karama card to win a card in an auction?',
          paragraphs: [
            'Holding the Karama card allows you to break the rule of not bidding more spice than you have. This would enable you to "bid up" the price of the card if you have the Karama, but not purchase it if another player outbids you, and therefore not have to play the Karama card.',
            "The Karama card also allows you to purchase a card when you've won without paying spice for the card, or, if you are allowed to bid on cards, simply play the Karama and take the current card up for bid.",
          ],
        },
        {
          id: 'faq-karama-full-hand',
          title:
            'If someone already has a full hand, and one card in their hand is a Karama, can they purchase another card using the Karama card?',
          paragraphs: ['No. Players with a full hand of treachery cards must pass.'],
        },
        {
          id: 'faq-karama-duration',
          title:
            'Can a Karama card prevent any one player advantage from being used for the duration of that game phase?',
          paragraphs: [
            "No. The Karama stops one use of a faction's ability. For example, if the Bene Gesserit are in two battles, their Voice ability can only be stopped for one battle by a Karama card.",
          ],
        },
        {
          id: 'faq-karama-alliance',
          title: 'Can a Karama card stop an alliance ability?',
          paragraphs: ['Yes.'],
        },
      ],
    },
    {
      id: 'faq-karama-faction-answer',
      title: "What faction abilities can or can't a Karama card affect?",
      kind: 'qa',
      items: [
        {
          id: 'faq-karama-answer-atreides',
          title: 'Atreides',
          paragraphs: [
            'Prevent Atreides from looking at a card up for bidding. Prevent looking at a Spice card. Prevent Atreides from knowing one part of a battle plan. In the Advanced Game, prevent the Kwisatz Haderach from being used in any one battle but must do so before battle plans are revealed. Karama has no effect on Atreides gaining the Kwisatz Haderach token after fulfilling its prerequisite.',
          ],
        },
        {
          id: 'faq-karama-answer-bene-gesserit',
          title: 'Bene Gesserit',
          paragraphs: [
            'Stop them from using the Voice in a battle. Prevent shipping a Spiritual Advisor. In the Advanced Game, prevent using a Worthless card as a Karama; the Worthless card must be discarded. Prevent Bene Gesserit from flipping tokens to or from advisors. Prevent collecting CHOAM Charity when holding 2 or more spice. Karama has no effect on the Bene Gesserit win prediction.',
          ],
        },
        {
          id: 'faq-karama-answer-emperor',
          title: 'Emperor',
          paragraphs: [
            'Prevent the Emperor from receiving payment for one Treachery Card. Prevent giving spice to an ally once during this turn. This does not prevent the Emperor from paying for cards or shipment. Prevent their ally from reviving three extra forces. In the Advanced Game, force Sardaukar to be treated as normal forces, if done before battle plans are revealed.',
          ],
        },
        {
          id: 'faq-karama-answer-fremen',
          title: 'Fremen',
          paragraphs: [
            'Limit the Fremen to the normal 1 territory movement instead of 2. Cause the Fremen to be eaten by the worm instead of being able to ride it. In the Advanced Game, prevent the Fremen from looking at the next storm card, but may not prevent the storm from moving the distance specified by the card. Before battle plans are revealed, force all Fedaykin in any one battle to be treated as normal tokens. Karama has no effect on the Fremen movement from reserves during shipping, or from enforcing their Special Victory Condition or sharing that win.',
          ],
        },
        {
          id: 'faq-karama-answer-guild',
          title: 'Guild',
          paragraphs: [
            'Prevent the Guild from receiving payment for one shipment. Prevent Guild from using half-price shipping rates once. Prevent Guild shipping rates to one ally. Prevent Guild from shipping across the planet or to reserves. In the Advanced Game, prevent Guild from taking shipment and movement action out of turn. Karama has no effect on Guild Special Victory Condition, or sharing that win.',
          ],
        },
        {
          id: 'faq-karama-answer-harkonnen',
          title: 'Harkonnen',
          paragraphs: [
            "You may not prevent the Harkonnen from revealing a traitor for their own battles, nor from having an 8 card hand. You may prevent them from revealing a traitor in their ally's battles and from gaining an extra card during bidding. In the Advanced Game, you may prevent the advanced Harkonnen advantage allowing them to capture a leader after any one battle. You may not prevent them from using a captured leader.",
          ],
        },
        {
          id: 'faq-karama-answer-ixians',
          title: 'Ixians',
          paragraphs: [
            'Prevent Ixians from looking at the treachery cards that will be part of the auction and drawing an extra card to place on top or bottom of the deck. Restrict movement of Cyborgs to one territory without ornithopters. Prevent Cyborgs from counting double in battle in the Basic Game. Prevent Suboids from replacing Cyborgs lost in battle. Prevent the Hidden Mobile Stronghold from moving and collecting spice. Stop Ixians ally from discarding a purchased treachery card. In the Advanced Game, prevent the replacement of a treachery card during Bidding. Karama has no effect on Suboid strength.',
          ],
        },
        {
          id: 'faq-karama-answer-tleilaxu',
          title: 'Tleilaxu',
          paragraphs: [
            "Prevent replacing a Face Dancer card during the Mentat Pause. Limit force revival to 3 for all players. Force Tleilaxu to pay full price for revival. Prevent payment to Tleilaxu for one revival. Prevent early revival of a leader. In the Advanced Game, prevent Tleilaxu from gaining another player's specific leader as Ghola that turn. Karama has no effect on other Face Dance effects.",
          ],
        },
      ],
    },
  ],
};

export const specimens = [fremen, locations, karama, faq];

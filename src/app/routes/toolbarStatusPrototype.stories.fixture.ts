/*
 * PROTOTYPE, #1423. Throwaway, on prototype/1423-toolbar-status-icons, which never merges.
 *
 * Two production faction rows and one production group name, read through the public query API on 2026-09-27 (factions:getBySlug).
 * House Atreides belongs to the group "dreamers" and was last published 2026-09-20 20:15 UTC.
 * House Richese has no group and was last published 2026-08-25 14:10 UTC.
 */

export const PRODUCTION_GROUP_NAME = 'dreamers';

export const houseAtreides = {
  slug: 'house-atreides',
  created_at: '2026-07-06T15:20:42.436Z',
  updated_at: '2026-09-20T20:13:07.492Z',
  published_at: 1_789_935_350_370,
  cache_token: '6841927b-138b-42c4-97dc-6c28323ab62b',
  data: {
    background: {
      colors: ['#393d05', '#5c5d10'],
      definition: 0.5,
      image: '/image/texture/082.jpg',
      influence: 1,
      invert: true,
    },
    colors: ['Green', 'Teal'],
    complexity: { calculated: 0.43870967741935485 },
    decals: [],
    hero: {
      image: '/image/leader/official/paul.jpg',
      memberId: '08bbac42-960c-476c-a46c-2b904edf2fe4',
      name: 'Paul Atreides',
    },
    leaders: [
      {
        image: '/image/leader/official/jessica.png',
        memberId: 'c537e132-7b96-4d9a-8140-61854961a70f',
        name: 'Lady Jessica',
        strength: 5,
      },
      {
        image: '/image/leader/official/thufir.png',
        memberId: 'efd456e6-2374-4a9c-a033-e700d3896c47',
        name: 'Thufir Hawat',
        strength: 5,
      },
      {
        image: '/image/leader/official/gurney.png',
        memberId: '01f1cf94-2df1-4b96-9fbf-dd757afef27b',
        name: 'Gurney Halleck',
        strength: 4,
      },
      {
        image: '/image/leader/official/duncan.png',
        memberId: 'f81ee425-dc09-4a89-a256-6946a97fe4de',
        name: 'Duncan Idaho',
        strength: 2,
      },
      {
        image: '/image/leader/official/dryeuh.png',
        memberId: 'a3711dc6-b2b9-4826-b7f9-1feb95c0629c',
        name: 'Doctor Yueh',
        strength: 1,
      },
    ],
    logo: '/vector/logo/atreides.svg',
    name: 'House Atreides',
    planet: [],
    rules: {
      advantages: [
        { text: 'You have limited Prescience.' },
        {
          karama: '(Bidding Phase) Atreides may not look at any future cards up for bid this phase.',
          text: 'During the Bidding Phase you may look at each Treachery Card as it comes up for bid. You may keep notes about cards.',
          title: 'Bidding Prescience',
        },
        {
          karama: '(Storm Phase) Atreides may not look at the top card of the Nexus Deck this turn.',
          text: 'You may look at the top card of the Nexus Deck.',
          title: 'Nexus Prescience',
        },
        {
          karama:
            '(Combat step 2.2) Atreides may not force their opponent to reveal any part of their battle plan this phase. May be done after Atreides ask, before the target answers.',
          text: 'During battle (step 2.2) you may force your opponent to reveal 1 part of their Battle Plan early (Weapon, Defense, Dial + whether Mercenaries is being played, or Leader).',
          title: 'Battle Prescience',
        },
        {
          karama: '(Combat step 2.3) Atreides may not play the Kwisatz Haderach token in any battle this phase.',
          text: 'Once you have lost 7 or more total forces in battles you gain the Kwiatz Haderach token that can be played alongside leaders in battles in one territory per turn.\nThe token adds +2 to leader strength, and the leader cannot be called traitor. The token can only be lost in a lazgun-shield explosion, after which it can be revived like a normal leader.',
          title: 'Kwisatz Haderach',
        },
        {
          karama: 'Leto’s Tithe – (Collection Phase) Atreides collects no spice from Leto’s Tithe this phase.',
          text: 'During Spice Collection phase take 2 spice from the Spice Bank if you control one stronghold. Take 3 instead if you control at least two strongholds. You permanently lose this advantage once you gain the Kwisatz Haderach token.',
          title: "Leto's Tithe",
        },
      ],
      alliance: {
        text: 'Shared Prescience: Your ally may allow you to use Battle Prescience in their battles.',
      },
      fate: {
        text: "Arrakis Fiefdom: Play your fate card at any time before Ship & Move Phase to obtain the Carryall Tech Token, which you cannot lose. The token triggers when a spice mine sends troops to reserves. You may also spawn a 3 spice mine on any sand territory that doesn't have a Spice Blow marker.",
        title: '',
      },
      revivalText: '2 forces.',
      spiceCount: 10,
      startText: '10 forces in Arrakeen and 10 in reserves. Start with 10 spice.',
    },
    themeColor: '#4a4c08',
    troops: [
      {
        count: 20,
        description: '0.5 strength when undialed, 1 strength when dialed',
        image: '/vector/troop/atreides.svg',
        name: 'Normal troop',
      },
    ],
  },
};

export const houseRichese = {
  slug: 'house-richese',
  created_at: '2026-07-06T21:01:20.013Z',
  updated_at: '2026-07-20T18:02:09.300Z',
  published_at: 1_787_667_050_352,
  cache_token: 'v1.Xt-C4Q6VzUAN-LpOKLM6Ew.TbqOU8YPidygofghxL6EKpDp3RJM0so0jsAwMWHG8_M',
  data: {
    background: {
      colors: ['#949494', '#949494'],
      definition: 0.5,
      image: '/image/texture/021.jpg',
      influence: 1,
      invert: true,
    },
    colors: ['Pink', 'Teal'],
    complexity: { calculated: 1 },
    decals: [],
    hero: {
      image: '/image/leader/official/whitemore-bludd.png',
      memberId: '98367574-b1d7-42cb-b6ca-7afe9966cd1b',
      name: 'Count Ilban Richese',
    },
    leaders: [
      {
        image: '/image/leader/official/ein-calimar.png',
        memberId: '3f883688-c263-4bd1-b218-9829bc28d5b8',
        name: 'Ein Calimar',
        strength: 5,
      },
      {
        image: '/image/leader/official/lady-helena.png',
        memberId: '66cd5e56-0b19-4f8e-a7e6-09d048106557',
        name: 'Lady Helena',
        strength: 4,
      },
      {
        image: '/image/leader/official/flinto-kinnis.png',
        memberId: '356e5238-8fcd-4f3f-a811-1be0db8dffaf',
        name: 'Flinto Kinnis',
        strength: 3,
      },
      {
        image: '/image/leader/official/haloa-rund.png',
        memberId: '0086728a-e7bf-40dd-a580-73808ac98d2c',
        name: 'Haloa Rund',
        strength: 2,
      },
      {
        image: '/image/leader/official/talis-balt.png',
        memberId: 'fc4b89d2-9d61-43ed-82d5-739c8875b92a',
        name: 'Talis Balt',
        strength: 2,
      },
    ],
    logo: '/vector/logo/richese.svg',
    name: 'House Richese',
    planet: [],
    rules: {
      advantages: [
        {
          text: 'You control No-Fields and manufacture advanced supplies for the Imperium.',
        },
        {
          karama: '(Ship & Move Phase) Richese and their ally cannot set/add to No-Fields this phase.',
          text: "Instead of shipping normally you may pay 1 spice (to the Guild) and do one of the following:\n- Set any No-Field card face down with exactly 5 forces on it (or as many as possible). \n- Add 5 forces to an already set No-Field (or many as possible).\n- Return an existing No-Field back to your deck, returning all forces on it to your reserves.\n\nYour No-Field deck contains 8 cards: One for each Stronghold, Spice Blow A, B, and Shield Wall.\n\nWhen shipping to a No-Field place a spice from the bank on it to show it's been shipped to this turn. (See: rules for revealing on Spice Blows and under Storm)",
          title: 'Shipping No-Fields',
        },
        {
          karama: 'no interaction',
          text: "No-Fields may be revealed at any point during the Shipment and Movement phase except between a player's shipment and movement. When a No-Field is revealed place the forces on it in the corresponding territory and return the card back to your No-Field deck.\n\nAny number of No-Fields may be revealed in a turn.\nNo-Field reveals ignore faction occupation limits.\nNo-Fields cannot be revealed in a location your ally has forces. No-Fields cannot be revealed in a sector under storm if that No-Field was set or added to this turn. When a Spice Blow No-Field from a previous turn is revealed return the forces on it to reserves.",
          title: 'Revealing No-Fields',
        },
        {
          karama: '(Mentat Phase) Richese cannot ship a No-Field this phase.',
          text: 'During Mentat Phase you may ship a single No-Field using normal rules.',
          title: 'Mentat Preparations',
        },
        {
          karama:
            '(Bidding) The empowered badge stays face down this turn. OR (Combat Step 2.3) Richese must pay full price to spice dial this phase.',
          text: 'You spice dial a half price, if the Richese auction this turn was sold for 4+ spice. (flip up the Empowered Badge to track this)',
          title: 'Empowered By Steel',
        },
        {
          karama:
            "(Combat Step 2.3) Richese weapons, and any faction's that has bought the weapon upgrade, act normally this phase. ",
          text: 'Whenever a weapon you play (except Lazgun) is blocked by a defense you may return the weapon to your hand for free. ',
          title: 'Boomerang Weapons',
        },
        {
          karama:
            "(Combat Step 2.3) Richese defenses, and any faction's that has bought the defenses upgrade, act normally this phase.",
          text: 'Whenever a defense you play blocks a weapon, you are considered to have played a projectile/poison weapon respectively, plus any other weapon you played.',
          title: 'Reflective Defenses',
        },
        {
          karama: '(Bidding Phase, before the Richese auction) Richese cannot preform a Richese auction this phase.',
          text: 'At the start of the Bidding Phase before the number of cards going up for bid is determined, you may auction an item from your cache face up (normal Treachery Cards can be auctioned face down). The auction is a normal bidding round beginning with the first player in Storm Order. You receive the spice paid for auction. If all factions pass on a Richese auction the item is returned and bidding begins for normal cards.\n\nKarama cannot be played to buy from a Richese auction. \n\nIx looks at/splits piles after your card or token has been bought.\nHarkonnen draw their extra Treachery Card only when they buy a Treachery Card from your auction.',
          title: 'Bidding Supplier',
        },
        {
          karama:
            "The following is a list of the 12 items that begins the game in the cache. (Tokens don't take a hand slot)",
          text: '',
        },
        { karama: '6 random cards from the Treachery Deck ', text: '' },
        {
          karama: 'Signet Ring Token: Can be discarded as a fate or played by BG as a worthless card.',
          text: '',
        },
        {
          karama: 'Richese Karama Token: Can’t target Richese and can’t be used in the combat phase.',
          text: '',
        },
        { karama: 'Truthtrance Token.', text: '' },
        {
          karama:
            'Boomerang Weapons Upgrade Token: Richese share their boomerang weapons ability permanently with you.',
          text: '',
        },
        {
          karama:
            'Reflective Defense Upgrade Token: Richese share their reflective defenses ability permanently with you.',
          text: '',
        },
        {
          karama: 'Once/game Richese may pick a Treachery Card from the discard to auction.',
          text: '',
        },
      ],
      alliance: {
        text: 'Shared No-Fields: Your ally may ship using No Fields. You do this by giving your ally full control of the No-Field(s) you allow them to ship with. Your ally pays stronghold rates for each troop they send. You cannot coexist with your ally on a No-Field. If the alliance breaks, immediately reveal their troops using normal rules. If their forces would be placed in the same territory as forces of their new ally return the troops that were on the No-Field to reserves. ',
      },
      fate: {
        text: 'Emergency Auction: Play your fate at any time. (If during combat, step 1.1) Start an auction for an item from your cache. ',
        title: '',
      },
      revivalText: '2 forces.',
      spiceCount: 5,
      startText: '20 forces in reserves. 5 spice. Take 6 random Treachery Cards into your cache.',
    },
    themeColor: '#949494',
    troops: [],
  },
};

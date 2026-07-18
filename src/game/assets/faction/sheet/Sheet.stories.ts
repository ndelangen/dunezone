import preview from '@sb/preview';

import { FactionSheet } from './Sheet';

const meta = preview.meta({
  component: FactionSheet,
  parameters: {
    layout: 'fullscreen',
  },
  globals: {
    viewport: {
      value: 'page',
    },
  },
});

export const Default = meta.story({
  args: {
    name: 'Atreides',
    logo: '/vector/logo/atreides.svg',
    themeColor: '#730a8e',
    background: {
      image: '/image/texture/021.jpg',
      colors: ['red', 'blue'],
      opacity: 0,
      strength: 0,
    },
    troops: [
      {
        image: '/vector/troop/atreides.svg',
        name: 'Regular troop',
        description: 'Atreides regular troop',
        striped: false,
        count: 1,
      },
    ],
    rules: {
      startText: '10 troops in Arrakeen and 10 in reserve *(off planet)*. Start with 10 spice.',
      revivalText: '2 troop free.',
      spiceCount: 10,
      advantages: [
        {
          text: 'You have limited prescience.',
        },
        {
          title: 'BIDDING prescience',
          text: `During each bidding round you may look at each Treachery Card as it comes up for bid.`,
          karama:
            'You can no longer look at the cards as they are up for bid. This lasts until the end of the turn.',
        },
        {
          title: 'Information broker',
          text: [
            `You can sell information on the next card for auction to another player. You can set the price and the information must be true.`,
            `The price you set is paid to you as a bribe.`,
          ].join('\n\n'),
        },
        {
          title: 'Notes',
          text: `You may keep written notes about Treachery Cards.`,
        },
        {
          title: 'BATTLE PRESCIENCE',
          text: `During battle *(step 2.2)* you may force your opponent to reveal 1 part of their battle-plan early. *(Weapon, Defense, Leader, or Dial + Mercenaries)*.`,
          karama: `You opponent does not have to reveal a part of their battle-plan early. This lasts until the end of the turn.`,
        },
        {
          title: "LETO'S TITHE",
          text: [
            `During Spice Collection phase take 2 spice from the spice bank if you control one stronghold. Take 3 instead if you control at least two strongholds.`,
            `You permanently lose this advantage once you gain the Kwisatz Haderach token.`,
          ].join('\n\n'),
        },
        {
          title: 'KWISATZ HADERACH',
          text: [
            `Once you have lost 7 or more total troops in battles you gain a token that can be played alongside one leader per turn to add +2 strength to that leader and that leader cannot be called traitor.`,
            `The token can only be lost in a lasgun-shield explosion, and can be revived like a normal leader.`,
          ].join('\n\n'),
          karama: `You are not allowed to add the Kwisatz Haderach token to a leader. This lasts until the end of the turn.`,
        },
      ],
      fate: {
        title: 'ARRAKIS FIEFDOM',
        text: `Play your fate card at any time before Ship & Move phase to obtain the Carryall Tech-Token, which you cannot lose. The token triggers when a spice mine sends troops to reserves. You may also spawn a 3 spice mine on any sand territory that doesn't have a spice-blow marker:`,
      },
      alliance: {
        text: `You may assist your ally by forcing their opponent to show 1 element of their battle-plan, see the "battle prescience"-advantage.`,
      },
    },
    leaders: [
      {
        name: 'Dr. Yueh',
        image: '/image/leader/official/dryeuh.png',
        strength: '1',
      },
      {
        name: 'Duncan Idaho',
        image: '/image/leader/official/duncan.png',
        strength: '2',
      },
      {
        name: 'Gurney Halleck',
        image: '/image/leader/official/gurney.png',
        strength: '4',
      },
      {
        name: 'Thufir Hawat',
        image: '/image/leader/official/thufir.png',
        strength: '5',
      },
      {
        name: 'Lady Jessica',
        image: '/image/leader/official/jessica.png',
        strength: '5',
      },
    ],
  },
});

import { recalculateFactionComplexity } from '@shared/factions/complexity';
import { FactionInputSchema } from '@shared/factions/schema';
import type { FactionInput } from '@shared/factions/schema';

/*
 * House Atreides as dune.zone shows it at /factions/house-atreides, copied on 2026-10-17, so the post's figures match the faction page.
 * It is a copy rather than a live read, because a blog post is a fixed piece of writing and should not change when the faction does.
 * Images are the media pipeline's source keys for the files the page serves; the rule text keeps the page's own wording, typos included.
 * The page does not show the background's invert, definition and influence, so those are the editor's defaults.
 */
export const HOUSE_ATREIDES: FactionInput = FactionInputSchema.parse(
  recalculateFactionComplexity({
    name: 'House Atreides',
    logo: '/vector/logo/atreides.svg',
    colors: ['Green', 'Teal'],
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#393d05', '#5c5d10'],
      invert: false,
      definition: 1,
      influence: 0.5,
    },
    themeColor: '#778042',
    factionLeader: { name: 'Paul Atreides', image: '/image/leader/official/paul.jpg' },
    leaders: [
      { name: 'Lady Jessica', image: '/image/leader/official/jessica.png', strength: '5' },
      { name: 'Thufir Hawat', image: '/image/leader/official/thufir.png', strength: '5' },
      { name: 'Gurney Halleck', image: '/image/leader/official/gurney.png', strength: '4' },
      { name: 'Duncan Idaho', image: '/image/leader/official/duncan.png', strength: '2' },
      { name: 'Doctor Yueh', image: '/image/leader/official/dryeuh.png', strength: '1' },
    ],
    decals: [],
    troops: [{ name: 'Normal troop', image: '/vector/troop/atreides.svg', description: '', count: 20 }],
    rules: {
      startText: '10 forces in Arrakeen and 10 in reserves. Start with 10 spice.',
      revivalText: '2 forces.',
      spiceCount: 10,
      advantages: [
        { text: 'You have limited Prescience.' },
        {
          title: 'Bidding Prescience',
          text: 'During the Bidding Phase you may look at each Treachery Card as it comes up for bid. You may keep notes about cards.',
          karama: '(Bidding Phase) Atreides may not look at any future cards up for bid this phase.',
        },
        {
          title: 'Nexus Prescience',
          text: 'You may look at the top card of the Nexus Deck.',
          karama: '(Storm Phase) Atreides may not look at the top card of the Nexus Deck this turn.',
        },
        {
          title: 'Battle Prescience',
          text: 'During battle (step 2.2) you may force your opponent to reveal 1 part of their Battle Plan early (Weapon, Defense, Dial + whether Mercenaries is being played, or Leader).',
          karama:
            '(Combat step 2.2) Atreides may not force their opponent to reveal any part of their battle plan this phase. May be done after Atreides ask, before the target answers.',
        },
        {
          title: 'Kwisatz Haderach',
          text: 'Once you have lost 7 or more total forces in battles you gain the Kwiatz Haderach token that can be played alongside leaders in battles in one territory per turn.\nThe token adds +2 to leader strength, and the leader cannot be called traitor. The token can only be lost in a lazgun-shield explosion, after which it can be revived like a normal leader.',
          karama: '(Combat step 2.3) Atreides may not play the Kwisatz Haderach token in any battle this phase.',
        },
        {
          title: "Leto's Tithe",
          text: 'During Spice Collection phase take 2 spice from the Spice Bank if you control one stronghold. Take 3 instead if you control at least two strongholds. You permanently lose this advantage once you gain the Kwisatz Haderach token.',
          karama: 'Leto’s Tithe – (Collection Phase) Atreides collects no spice from Leto’s Tithe this phase.',
        },
      ],
      alliance: { text: 'Shared Prescience: Your ally may allow you to use Battle Prescience in their battles.' },
      fate: {
        label: 'karama',
        title: 'Arrakis Fiefdom',
        text: "Play your fate card at any time before Ship & Move Phase to obtain the Carryall Tech Token, which you cannot lose. The token triggers when a spice mine sends troops to reserves. You may also spawn a 3 spice mine on any sand territory that doesn't have a Spice Blow marker.",
      },
    },
  })
);

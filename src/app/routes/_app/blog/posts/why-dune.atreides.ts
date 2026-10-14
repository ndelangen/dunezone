import type { FactionCatalogueEntry } from '@db/factions';

/**
 * The Dreamrules House Atreides faction as its catalogue entry read on 14 October 2026, for the "Why Dune?" post.
 * A post is a fixed piece of writing and its page renders without a database, so the card draws this copy rather than reading the live faction.
 */
export const dreamrulesAtreides = {
  _id: 'k17ag3gr1h60n7mmh88kj56avs8a1j7x',
  _creationTime: 1_783_351_242_436.354,
  owner_id: 'm173wz641c341r1mn5vr18egws84prr0',
  slug: 'house-atreides',
  group_id: 'kh7dc206m3s3vprfesg33k0t6h848f6r',
  created_at: '2026-07-06T15:20:42.436Z',
  updated_at: '2026-09-20T20:13:07.492Z',
  is_deleted: false,
  rulesets: [
    {
      id: 'kx7banekz1ft7w9wtka1w6rxh584832y',
      slug: 'dreamrules',
      name: 'Dreamrules',
    },
  ],
  data: {
    name: 'House Atreides',
    logo: '/vector/logo/atreides.svg',
    background: {
      colors: ['#393d05', '#5c5d10'],
      definition: 0.5,
      image: '/image/texture/082.jpg',
      influence: 1.0,
      invert: true,
    },
    factionLeader: {
      image: '/image/leader/official/paul.jpg',
      memberId: '08bbac42-960c-476c-a46c-2b904edf2fe4',
      name: 'Paul Atreides',
    },
    leaders: [
      {
        image: '/image/leader/official/jessica.png',
        memberId: 'c537e132-7b96-4d9a-8140-61854961a70f',
        name: 'Lady Jessica',
        strength: 5.0,
      },
      {
        image: '/image/leader/official/thufir.png',
        memberId: 'efd456e6-2374-4a9c-a033-e700d3896c47',
        name: 'Thufir Hawat',
        strength: 5.0,
      },
      {
        image: '/image/leader/official/gurney.png',
        memberId: '01f1cf94-2df1-4b96-9fbf-dd757afef27b',
        name: 'Gurney Halleck',
        strength: 4.0,
      },
      {
        image: '/image/leader/official/duncan.png',
        memberId: 'f81ee425-dc09-4a89-a256-6946a97fe4de',
        name: 'Duncan Idaho',
        strength: 2.0,
      },
      {
        image: '/image/leader/official/dryeuh.png',
        memberId: 'a3711dc6-b2b9-4826-b7f9-1feb95c0629c',
        name: 'Doctor Yueh',
        strength: 1.0,
      },
    ],
    complexity: {
      calculated: 0.43870967741935485,
    },
  },
} as unknown as FactionCatalogueEntry;

/*
 * PROTOTYPE (#1146): the leaders of the six demo factions, from the same production read as catalogue.fixture.ts (2026-09-12).
 * Display only, never merged; strengths and portrait ids as the catalogue stores them.
 */
import type { LeaderToken } from '@game/assets/faction/leader/Leader';
import type { ComponentProps } from 'react';

export type LeaderFixture = {
  name: string;
  strength: number;
  image: ComponentProps<typeof LeaderToken>['image'];
  memberId: string;
};

export type FactionLeadersFixture = { slug: string; id: string; leaders: LeaderFixture[] };

export const FACTION_LEADERS: readonly FactionLeadersFixture[] = [
  {
    slug: 'fremen',
    id: 'k176nq542xz747341fc42341e18a0t45',
    leaders: [
      { name: 'Stilgar', strength: 7, image: '/image/leader/official/stilgar.png', memberId: 'a6db2c21-0832-4093-a531-3d84a7bf8595' },
      { name: 'Chani', strength: 6, image: '/image/leader/official/chani.png', memberId: '4423c0f7-b4f5-4402-aab2-3f893227c73f' },
      { name: 'Otheym', strength: 5, image: '/image/leader/official/otheym.png', memberId: '8a455597-cc9c-4341-a4c5-5567e5cdc8a7' },
      { name: 'Shaddout Mapes', strength: 3, image: '/image/leader/official/mapes.png', memberId: '150920d2-e2a0-4389-8851-876cdabfdfcf' },
      { name: 'Jamis', strength: 2, image: '/image/leader/official/jamis.png', memberId: '14bd2aa8-e1fc-4a42-a789-84c2dc64ed98' },
    ],
  },
  {
    slug: 'house-atreides',
    id: 'k17ag3gr1h60n7mmh88kj56avs8a1j7x',
    leaders: [
      { name: 'Lady Jessica', strength: 5, image: '/image/leader/official/jessica.png', memberId: 'c537e132-7b96-4d9a-8140-61854961a70f' },
      { name: 'Thufir Hawat', strength: 5, image: '/image/leader/official/thufir.png', memberId: 'efd456e6-2374-4a9c-a033-e700d3896c47' },
      { name: 'Gurney Halleck', strength: 4, image: '/image/leader/official/gurney.png', memberId: '01f1cf94-2df1-4b96-9fbf-dd757afef27b' },
      { name: 'Duncan Idaho', strength: 2, image: '/image/leader/official/duncan.png', memberId: 'f81ee425-dc09-4a89-a256-6946a97fe4de' },
      { name: 'Doctor Yueh', strength: 1, image: '/image/leader/official/dryeuh.png', memberId: 'a3711dc6-b2b9-4826-b7f9-1feb95c0629c' },
    ],
  },
  {
    slug: 'house-harkonnen',
    id: 'k174k8mvjqapvgccxtbp9qwh5h8a01b4',
    leaders: [
      { name: 'Feyd Rautha', strength: 6, image: '/image/leader/official/feyd.png', memberId: '773ba210-69e1-4bcb-9ea8-2b5419ecd35e' },
      { name: 'Beast Rabban', strength: 4, image: '/image/leader/official/beast.png', memberId: 'ec5de698-b13b-438b-95ff-8bf0ce6670c8' },
      { name: 'Piter De Vries', strength: 3, image: '/image/leader/official/piter.png', memberId: '34669bf1-af9b-40a6-95eb-78ef4c4ca949' },
      { name: 'Cpt. Iakin Nefud', strength: 2, image: '/image/leader/official/nafud.png', memberId: '1423d459-65bd-4f38-8859-52f69a5b3e2b' },
      { name: 'Umman Kudu', strength: 1, image: '/image/leader/official/uman.png', memberId: 'c93c96d8-a6f8-434b-98b3-e924e532d6cf' },
    ],
  },
  {
    slug: 'emperor',
    id: 'k17dhptwywynwmpvx18965b97h8a0abp',
    leaders: [
      { name: 'Hasimir Fenring', strength: 6, image: '/image/leader/official/hasimir.png', memberId: 'e445cf95-3067-4260-a962-fe5d29f63f53' },
      { name: 'Cpt. Aramsham', strength: 5, image: '/image/leader/official/aramsham.png', memberId: '5231cb41-ceea-4405-95d1-1822541a63e3' },
      { name: 'Caid', strength: 3, image: '/image/leader/official/caid.png', memberId: '3fbddb6f-f500-40aa-91c6-fb7a1d154c34' },
      { name: 'Burseg', strength: 3, image: '/image/leader/official/burseg.png', memberId: '4c5f3e11-0636-4b59-885f-a1a55296f3b1' },
      { name: 'Bashar', strength: 2, image: '/image/leader/official/bashar.png', memberId: '826f5779-ac89-4cd8-9da7-b345537b5e73' },
    ],
  },
  {
    slug: 'spacing-guild',
    id: 'k175bxsjh069ksf64a189360f58a0eck',
    leaders: [
      { name: 'Stabban Tuek', strength: 5, image: '/image/leader/official/staban.png', memberId: '53bd6754-b442-470c-b8da-2af998f349e0' },
      { name: 'Esmar Tuek', strength: 3, image: '/image/leader/official/esmar.png', memberId: 'bc2c7eba-69f8-4725-a243-6976b5b5a7ff' },
      { name: 'Master Bewt', strength: 3, image: '/image/leader/official/bewt.png', memberId: '1102e32c-e145-455a-8f89-1295797bc502' },
      { name: 'Soo Soo Sook', strength: 2, image: '/image/leader/official/soo-soo-sook.png', memberId: 'b009e068-3f74-4f0f-8227-cbb197a973b0' },
      { name: 'Guild Rep.', strength: 1, image: '/image/leader/official/guildrep.png', memberId: '10cb0e82-70ee-45ce-aeb0-162f0f933530' },
    ],
  },
  {
    slug: 'bene-gesserit',
    id: 'k17fybprvb614pr3r0bpy410q58a086q',
    leaders: [
      { name: 'Alia', strength: 5, image: '/image/leader/official/alia.png', memberId: 'fcd6c3b3-2f8e-42f8-8d1b-9eb24fdad094' },
      { name: 'Princess Irulan', strength: 5, image: '/image/leader/official/irulan.png', memberId: 'c5e76313-8b28-480b-afe5-442a47a8bb42' },
      { name: 'Mother Romallo', strength: 5, image: '/image/leader/official/ramallo.png', memberId: 'bcbf7253-ac76-4d05-a94c-56c17b9ca1c5' },
      { name: 'Wanna Yueh', strength: 5, image: '/image/leader/official/wanna.png', memberId: 'cbee9874-6ab4-42e0-9db2-d015213a9a84' },
      { name: 'Margot Lady Fenring', strength: 5, image: '/image/leader/official/lady-fenring.png', memberId: '92a4d717-bc56-4dd5-b4f0-95df1ae742b2' },
    ],
  },
];

export function leadersOf(slug: string): LeaderFixture[] {
  return FACTION_LEADERS.find((faction) => faction.slug === slug)?.leaders ?? [];
}

export function leaderByName(name: string): { leader: LeaderFixture; faction: string } {
  for (const faction of FACTION_LEADERS) {
    const leader = faction.leaders.find((candidate) => candidate.name === name);
    if (leader) {
      return { leader, faction: faction.slug };
    }
  }
  throw new Error(`Unknown leader ${name}`);
}

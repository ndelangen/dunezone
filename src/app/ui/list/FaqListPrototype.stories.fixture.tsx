import type { RelatedFaqItem } from '@db/faq';

export type PrototypePerson = { name: string; slug: string; image: string | null };
export type PrototypeFaqItem = RelatedFaqItem & {
  answerPeople: Record<string, PrototypePerson>;
  relatedAssets: { name: string; href: string }[];
};

const person = (name: string, slug: string): PrototypePerson => ({ name, slug, image: null });
const stilgar = person('Stilgar', 'stilgar');
const chani = person('Chani', 'chani');
const liet = person('Liet Kynes', 'liet-kynes');
const duncan = person('Duncan Idaho', 'duncan-idaho');
const jessica = person('Lady Jessica', 'lady-jessica');
const thufir = person('Thufir Hawat', 'thufir-hawat');

const examples = [
  {
    question: 'Can leaders move through the storm?',
    tags: ['rules'],
    ruleset: { name: 'Dreamrules', slug: 'dreamrules' },
    author: stilgar,
    answers: [
      {
        person: liet,
        text: 'Only when the ruleset explicitly allows it. Check the timing and the exception on the faction sheet before moving anything into the storm. An advantage that changes shipment does not automatically change movement, so read the two steps separately.',
      },
      { person: jessica, text: 'Check the exception on the faction sheet.' },
    ],
    accepted: true,
    relatedAssets: [
      { name: 'Storm deck', href: '/assets/deck/storm-deck' },
      { name: 'Arrakis board', href: '/assets/board/arrakis' },
    ],
  },
  {
    question: 'When do reserve forces enter play?',
    tags: ['strategy', 'army_list'],
    ruleset: { name: 'ClassicRules', slug: 'classicrules' },
    author: chani,
    answers: [],
    accepted: false,
    relatedAssets: [{ name: 'Fremen troop tokens', href: '/assets/token-disc/fremen-troops' }],
  },
  {
    question:
      'How does the Shield and Lasgun interaction resolve when a faction replaces its leader during the reveal?',
    tags: ['rules', 'other'],
    ruleset: { name: 'GF9', slug: 'gf9' },
    author: duncan,
    answers: [
      { person: liet, text: 'We have two interpretations at our table.' },
      { person: jessica, text: 'Does the faction exception change the timing?' },
    ],
    accepted: false,
    relatedAssets: [
      { name: 'Lasgun', href: '/assets/card-treachery/lasgun' },
      { name: 'Shield', href: '/assets/card-treachery/shield' },
      { name: 'Treachery deck', href: '/assets/deck/treachery' },
    ],
  },
  {
    question: 'Is there a Richese faction in the works for KISS rules?',
    tags: ['other'],
    ruleset: { name: 'KISS', slug: 'kiss' },
    author: null,
    answers: [],
    accepted: false,
    relatedAssets: [],
  },
  {
    question: "Can an alliance use both factions' shipping advantages in the same phase?",
    tags: ['rules', 'strategy'],
    ruleset: { name: 'The Unofficial Revised Dune Rulebook', slug: 'unofficial-revised' },
    author: jessica,
    answers: [
      {
        person: thufir,
        text: 'Apply the alliance text printed in this ruleset. A faction advantage is shared only when it says so. When both advantages change the same step, resolve their timing before paying for shipment, and distinguish the acting faction from its ally.',
      },
    ],
    accepted: true,
    relatedAssets: [
      { name: 'Guild troop tokens', href: '/assets/token-disc/guild-troops' },
      { name: 'Arrakis board', href: '/assets/board/arrakis' },
    ],
  },
];

/** Illustrative content shared by the three revised prototypes. */
export const prototypeFaqItems = examples.map((example, index) => {
  const id = 'prototype-question-' + index;
  const created = '2026-10-' + String(21 - index).padStart(2, '0') + 'T10:00:00.000Z';
  return {
    _id: id,
    _creationTime: Date.parse(created),
    ruleset_id: 'prototype-ruleset-' + index,
    slug: id,
    question: example.question,
    tags: example.tags,
    ruleset: example.ruleset,
    asked_by: 'prototype-user-' + index,
    created_at: created,
    updated_at: created,
    accepted_answer_id: example.accepted ? id + '-answer-0' : null,
    faq_answers: example.answers.map((answer, answerIndex) => ({
      _id: id + '-answer-' + answerIndex,
      _creationTime: Date.parse(created),
      faq_item_id: id,
      answer: answer.text,
      answered_by: answer.person.slug,
      created_at: created,
    })),
    answerPeople: Object.fromEntries(example.answers.map((answer) => [answer.person.slug, answer.person])),
    relatedAssets: example.relatedAssets,
    asker_profile: example.author
      ? {
          id: 'prototype-user-' + index,
          slug: example.author.slug,
          username: example.author.name,
          avatar_url: example.author.image,
        }
      : null,
  };
}) as unknown as PrototypeFaqItem[];

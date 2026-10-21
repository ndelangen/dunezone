import type { RelatedFaqItem } from '@db/faq';

/** Illustrative questions shared by all five design prototypes. */
const examples = [
  {
    question: 'Can leaders move through the storm?',
    tags: ['rules'],
    ruleset: { name: 'Dreamrules', slug: 'dreamrules' },
    author: 'Stilgar',
    answers: ['Only when the ruleset explicitly allows it.', 'Check the exception on the faction sheet.'],
    accepted: true,
  },
  {
    question: 'When do reserve forces enter play?',
    tags: ['strategy', 'army_list'],
    ruleset: { name: 'ClassicRules', slug: 'classicrules' },
    author: 'Chani',
    answers: [],
    accepted: false,
  },
  {
    question:
      'How does the Shield and Lasgun interaction resolve when a faction replaces its leader during the reveal?',
    tags: ['rules', 'other'],
    ruleset: { name: 'GF9', slug: 'gf9' },
    author: 'Duncan Idaho',
    answers: ['We have two interpretations at our table.', 'Does the faction exception change the timing?'],
    accepted: false,
  },
  {
    question: 'Is there a Richese faction in the works for KISS rules?',
    tags: ['other'],
    ruleset: { name: 'KISS', slug: 'kiss' },
    author: null,
    answers: [],
    accepted: false,
  },
  {
    question: "Can an alliance use both factions' shipping advantages in the same phase?",
    tags: ['rules', 'strategy'],
    ruleset: { name: 'The Unofficial Revised Dune Rulebook', slug: 'unofficial-revised' },
    author: 'Lady Jessica',
    answers: ['Apply the alliance text printed in this ruleset. A faction advantage is shared only when it says so.'],
    accepted: true,
  },
];

export const prototypeFaqItems = examples.map((example, index) => {
  const id = `prototype-question-${index}`;
  const created = `2026-10-${String(21 - index).padStart(2, '0')}T10:00:00.000Z`;
  return {
    _id: id,
    _creationTime: Date.parse(created),
    ruleset_id: `prototype-ruleset-${index}`,
    slug: `prototype-question-${index}`,
    question: example.question,
    tags: example.tags,
    ruleset: example.ruleset,
    asked_by: `prototype-user-${index}`,
    created_at: created,
    updated_at: created,
    accepted_answer_id: example.accepted ? `${id}-answer-0` : null,
    faq_answers: example.answers.map((answer, answerIndex) => ({
      _id: `${id}-answer-${answerIndex}`,
      _creationTime: Date.parse(created),
      faq_item_id: id,
      answer,
      answered_by: 'prototype-answerer',
      created_at: created,
    })),
    asker_profile: example.author
      ? { id: `prototype-user-${index}`, slug: `prototype-author-${index}`, username: example.author, avatar_url: null }
      : null,
  };
}) as unknown as RelatedFaqItem[];

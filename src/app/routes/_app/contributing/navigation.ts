import { CONTRIBUTING_INTRO_PAGES, CONTRIBUTING_LESSONS } from '@shared/recordlessPublicPages';

export type GuideSubject = 'start' | 'code' | 'data' | 'ui' | 'deployment' | 'glossary' | 'decisions';
export type GuideSearch = Partial<Record<GuideSubject, string>>;
type GuideTopic = { slug: string; title: string };
export const SUBJECTS: readonly {
  id: GuideSubject;
  title: string;
  topics: readonly GuideTopic[];
}[] = [
  {
    id: 'start',
    title: 'Start here',
    topics: [{ slug: 'intro', title: 'Overview' }, ...CONTRIBUTING_INTRO_PAGES],
  },
  {
    id: 'code',
    title: 'Codebase',
    topics: [
      { slug: 'repository', title: 'Repository map' },
      ...CONTRIBUTING_LESSONS.code.filter((topic) => topic.slug === 'testing'),
    ],
  },
  {
    id: 'data',
    title: 'Data',
    topics: [
      {
        slug: 'queries',
        title: 'Public and private',
      },
      {
        slug: 'lifecycle',
        title: 'Reads and saves',
      },
    ],
  },
  {
    id: 'ui',
    title: 'Interface',
    topics: [
      { slug: 'page', title: 'Page anatomy' },
      {
        slug: 'membrane',
        title: 'Props and callbacks',
      },
    ],
  },
  {
    id: 'deployment',
    title: 'How it ships',
    topics: [{ slug: 'release', title: 'Release process' }, ...CONTRIBUTING_LESSONS.deployment],
  },
  {
    id: 'glossary',
    title: 'Technical glossary',
    topics: CONTRIBUTING_LESSONS.glossary.filter((topic) => topic.slug !== 'page' && topic.slug !== 'board'),
  },
  {
    id: 'decisions',
    title: 'Design decisions',
    topics: [{ slug: 'reading', title: 'About these rules' }, ...CONTRIBUTING_LESSONS.decisions],
  },
];

function validTopic(subject: (typeof SUBJECTS)[number], value: unknown): value is string {
  return subject.topics.some((topic) => topic.slug === value);
}

function legacySearch(raw: Record<string, unknown>): GuideSearch {
  const search: GuideSearch = {};
  if (raw.glossary === 'board') {
    search.glossary = 'board';
  }
  if (raw.code === 'data') {
    search.data = 'queries';
  }
  if (raw.code === 'interface') {
    search.ui = 'page';
  }
  if (raw.glossary === 'page') {
    search.ui = 'page';
  }
  return search;
}

export function validateGuideSearch(raw: Record<string, unknown>): GuideSearch {
  const search = legacySearch(raw);
  for (const subject of SUBJECTS) {
    const value = raw[subject.id];
    if (validTopic(subject, value)) {
      search[subject.id] = value;
    }
  }
  return search;
}

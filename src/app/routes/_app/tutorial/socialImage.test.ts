import { TUTORIAL_PAGES } from '@shared/recordlessPublicPages';
import { socialArtwork } from '@shared/socialCard';
import { expect, test } from 'vite-plus/test';

import { CREATOR_TUTORIALS, creatorArt } from '../create/creatorTutorials';
import { chapterArt, chapterCardText, TUTORIAL_CHAPTERS } from './chapters';
import { tutorialSocialImage } from './socialImage';

/* A still the media lock does not list would resolve to a path the card renderer refuses, and the card would fall back to its monogram. */
test('every indexed tutorial has a still the social card renderer can read', () => {
  const stills = [
    ...TUTORIAL_CHAPTERS.filter((chapter) => TUTORIAL_PAGES.includes(`/tutorial/${chapter.slug}`)).map(chapterArt),
    ...CREATOR_TUTORIALS.filter((tutorial) => tutorial.page).map(creatorArt),
  ];
  expect(stills.length).toBeGreaterThan(1);
  for (const still of stills) {
    expect(socialArtwork(tutorialSocialImage(still)), still).not.toBeNull();
  }
});

test('every chapter card text fits the wide card', () => {
  for (const chapter of TUTORIAL_CHAPTERS) {
    expect(Array.from(chapterCardText(chapter)).length, chapter.slug).toBeLessThanOrEqual(120);
  }
});

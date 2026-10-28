import preview from '@sb/preview';

import { db, refText, SEED_REF_TOKEN } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * "Bring your own pieces", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the rail beside it giving one task at a time. Its art comes from the recorded tutorial setup.
 * The catalogue is the story database's, whose Karama token is published here, as the chapter's search finds it published on the site.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Bring your own pieces',
  args: { path: '/tutorial/bring-your-own-pieces' },
  globals: chapterGlobals,
});

const karamaPublished = db((baseline) => {
  baseline.publication_assets.push({
    asset_type: 'token-disc',
    asset_id: refText('asset:token-disc:karama', SEED_REF_TOKEN),
    cache_token: 'story',
    published_at: Date.parse('2026-01-01T12:00:00.000Z'),
  });
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: { ...chapterParameters, database: karamaPublished },
  play: playChapter('Chapter 18: Bring your own pieces', 'Open the Shared table inventory'),
});

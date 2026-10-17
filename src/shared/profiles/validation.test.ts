import { describe, expect, it } from 'vite-plus/test';

import { profileSlugBaseFromName, profileUserEditFormSchema } from './validation';

describe('profileSlugBaseFromName', () => {
  it('keeps only lowercased letters and digits', () => {
    expect(profileSlugBaseFromName('  Storybook Viewer 2! ')).toBe('storybookviewer2');
  });

  it.each(['', '   ', '-_- !'])('throws when %j leaves nothing to slug', (name) => {
    expect(() => profileSlugBaseFromName(name)).toThrow('Failed to generate slug from display name');
  });
});

describe('profileUserEditFormSchema', () => {
  const valid = { username: 'StorybookViewer', avatar_url: 'https://example.com/avatar.png' };

  it('accepts a valid draft and normalises the BoardGameGeek link', () => {
    const parsed = profileUserEditFormSchema.parse({
      ...valid,
      bgg_profile_url: 'https://www.boardgamegeek.com/user/dune/',
    });
    expect(parsed.bgg_profile_url).toBe('https://boardgamegeek.com/user/dune');
  });

  it.each([
    ['', 'Display name is required'],
    ['Abc', 'Display name must be at least 5 characters'],
    ['Story-Viewer', 'Display name may only contain letters and numbers'],
    ['SHOUTING', 'Display name cannot be all capitals'],
  ])('rejects the display name %j', (username, message) => {
    const result = profileUserEditFormSchema.safeParse({ ...valid, username });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});

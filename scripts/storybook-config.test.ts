import { describe, expect, test } from 'vitest';

import { appStaticDirs } from '../.storybook/main';

type StorybookConfigType = 'DEVELOPMENT' | 'PRODUCTION';

async function resolveStaticDirs(existing: string[], configType: StorybookConfigType) {
  return await appStaticDirs(existing, {
    configType,
  } as Parameters<typeof appStaticDirs>[1]);
}

describe('Storybook static asset ownership', () => {
  test('serves application public assets from the standalone development server', async () => {
    await expect(resolveStaticDirs([], 'DEVELOPMENT')).resolves.toEqual(['../public']);
  });

  test('leaves application public assets to the publisher in production builds', async () => {
    await expect(resolveStaticDirs(['addon-static'], 'PRODUCTION')).resolves.toEqual([
      'addon-static',
    ]);
  });
});

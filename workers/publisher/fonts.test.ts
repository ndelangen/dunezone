import { describe, expect, test, vi } from 'vitest';

import {
  assertPublisherFontFaces,
  assertRequiredPublisherFonts,
  requiredPublisherFontFaces,
} from '../../src/shared/asset-publishing/publisher-fonts';
import type { PublisherFontFaceSet } from '../../src/shared/asset-publishing/publisher-fonts';

function fontSet(missing?: (typeof requiredPublisherFontFaces)[number]): PublisherFontFaceSet {
  return {
    load: vi.fn(async (shorthand: string) => {
      const isMissing =
        missing &&
        shorthand.includes(`"${missing.family}"`) &&
        shorthand.includes(missing.weight) &&
        shorthand.startsWith(missing.style);
      const required = requiredPublisherFontFaces.find(
        (face) =>
          shorthand.includes(`"${face.family}"`) && shorthand.includes(face.weight) && shorthand.startsWith(face.style)
      );
      return isMissing || !required
        ? []
        : [
            {
              family: `"${required.family}"`,
              weight: required.weight,
              style: required.style,
              status: 'loaded',
            },
          ];
    }),
    check: vi.fn((shorthand: string) =>
      requiredPublisherFontFaces
        .filter((face) => face !== missing)
        .some(
          (face) =>
            shorthand.includes(`"${face.family}"`) &&
            shorthand.includes(face.weight) &&
            shorthand.startsWith(face.style)
        )
    ),
  };
}

describe('publisher self-hosted font readiness', () => {
  test('requires every sheet family, weight, and style to be loaded', async () => {
    await expect(assertRequiredPublisherFonts(fontSet())).resolves.toBeUndefined();
    await expect(assertRequiredPublisherFonts(fontSet(requiredPublisherFontFaces[3]))).rejects.toThrow(
      /Caladea 700 italic/
    );
  });

  test('rejects Chromium-style substitution even when check reports true', async () => {
    const substituted = fontSet();
    substituted.load = async () => [{ family: 'C_Advokat_Modern', weight: '400', style: 'normal', status: 'loaded' }];
    await expect(
      assertPublisherFontFaces(substituted, [{ family: 'C_Advokat_Modern', weight: '400', style: 'italic' }])
    ).rejects.toThrow(/exactly/);
  });
});

export const requiredPublisherFontFaces = [
  { family: 'Caladea', weight: '400', style: 'normal' },
  { family: 'Caladea', weight: '400', style: 'italic' },
  { family: 'Caladea', weight: '700', style: 'normal' },
  { family: 'Caladea', weight: '700', style: 'italic' },
  { family: 'C_Copperplate_Gothic', weight: '400', style: 'normal' },
  { family: 'C_Copperplate_Gothic_Heavy', weight: '400', style: 'normal' },
  { family: 'C_Desdemona', weight: '400', style: 'normal' },
  { family: 'C_Candara', weight: '400', style: 'normal' },
  { family: 'C_Advokat_Modern', weight: '400', style: 'normal' },
  { family: 'C_Busorama', weight: '400', style: 'normal' },
  { family: 'C_Trebuchet', weight: '400', style: 'normal' },
] as const;

export type PublisherFontFaceSet = {
  load(
    font: string,
    text?: string
  ): Promise<Iterable<{ family: string; weight: string; style: string; status: string }>>;
  check(font: string, text?: string): boolean;
};

function normalizedFamily(value: string): string {
  return value.replaceAll(/["']/g, '').trim();
}

function normalizedWeight(value: string): string {
  return value === 'normal' ? '400' : value === 'bold' ? '700' : value;
}

export async function assertPublisherFontFaces(
  fonts: PublisherFontFaceSet,
  requiredFaces: readonly { family: string; weight: string; style: string }[]
): Promise<void> {
  for (const required of requiredFaces) {
    const shorthand = `${required.style} ${required.weight} 16px "${required.family}"`;
    const matchingFaces = Array.from(await fonts.load(shorthand, 'Publisher font readiness'));
    const exact = matchingFaces.some(
      (face) =>
        face.status === 'loaded' &&
        normalizedFamily(face.family) === required.family &&
        normalizedWeight(face.weight) === required.weight &&
        face.style === required.style
    );
    if (!exact || !fonts.check(shorthand, 'Publisher font readiness')) {
      throw new Error(
        `Required publisher font failed to load exactly: ${required.family} ${required.weight} ${required.style}`
      );
    }
  }
}

export async function assertRequiredPublisherFonts(fonts: PublisherFontFaceSet): Promise<void> {
  await assertPublisherFontFaces(fonts, requiredPublisherFontFaces);
}

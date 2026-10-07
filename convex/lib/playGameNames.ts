/** Print spellings are authored independently of URL spellings, so lore has one agreed address form. */
const LORE = [
  { print: 'Arrakeen', url: 'arrakeen' },
  { print: 'Gom Jabbar', url: 'gomjabbar' },
  { print: "Paul's", url: 'pauls' },
  { print: 'Hasimir', url: 'hasimir' },
  { print: 'Shai-Hulud', url: 'shai-hulud' },
  { print: 'Giedi Prime', url: 'giedi-prime' },
  { print: 'Bene Gesserit', url: 'bene-gesserit' },
  { print: "Muad'Dib", url: 'muaddib' },
  { print: 'Caladan', url: 'caladan' },
  { print: 'Kwisatz Haderach', url: 'kwisatz-haderach' },
] as const;

const SCENES = [
  'surprise party',
  'accident',
  'atomics battle',
  'wedding traitor',
  'picnic',
  'lost invitation',
  'tea break',
  'birthday conspiracy',
  'dance rehearsal',
  'sandwich dispute',
  'holiday mixup',
  'dinner ambush',
] as const;
const MODIFIERS = ['', 'Family', 'Unexpected', 'Secret', 'Midnight', 'Annual', 'Awkward'] as const;

/** All 840 complete phrases and their URL forms can be inspected without sampling. */
export function playGameNameVocabulary() {
  return LORE.flatMap((lore) =>
    MODIFIERS.flatMap((modifier) =>
      SCENES.map((scene) => ({
        name: [modifier, lore.print, scene].filter(Boolean).join(' '),
        slug: [modifier.toLowerCase(), lore.url, scene.replaceAll(' ', '-')].filter(Boolean).join('-'),
      }))
    )
  );
}

/** Draw inside a mutation so Convex replays the random source with the transaction. */
export function generatePlayGameName(): string {
  const pick = <T>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)]!;
  return [pick(MODIFIERS), pick(LORE).print, pick(SCENES)].filter(Boolean).join(' ');
}

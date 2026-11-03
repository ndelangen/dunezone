import creditIndex from './credits.generated.json';
import credits from './credits.json';

/** How a stock file came to be, which decides how its credit reads. */
export const creditMethods = [
  'official',
  'restored',
  'recreated',
  'traced',
  'ai-restored',
  'ai-adapted',
  'ai',
  'blog',
  'online',
  'unknown',
] as const;
type CreditMethod = (typeof creditMethods)[number];

export interface MediaCredit {
  method: CreditMethod;
  /** Who drew or designed the original artwork. */
  artist?: string;
  /** Whether the artist is credited for the illustration or the graphic design. */
  artistRole?: 'art' | 'design';
  /** The published work or reference the file comes from. */
  source?: string;
  /** The look that AI-made artwork was asked to match. */
  style?: string;
  /** Who restored, traced or recreated the file. */
  by?: string;
}

export type CreditId = keyof typeof credits;

/** The JSON is checked against this shape by the credits test. */
export const creditDefinitions = credits as Record<string, MediaCredit>;

export function isCreditId(id: string): id is CreditId {
  return Object.hasOwn(creditDefinitions, id);
}

function artistPhrase({ artist, artistRole }: MediaCredit, start = true) {
  const role = artistRole === 'design' ? 'design' : 'art';
  return `${start ? role.charAt(0).toUpperCase() + role.slice(1) : role} by ${artist}`;
}

function styleSuffix({ style }: MediaCredit) {
  return style ? `, in the style of ${style}` : '';
}

function origin(credit: MediaCredit) {
  return credit.artist ? `${artistPhrase(credit)} for ${credit.source}` : `artwork from ${credit.source}`;
}

function recreated(credit: MediaCredit) {
  const artist = credit.artist ? `. ${artistPhrase(credit)}` : '';
  return `recreated by ${credit.by} from ${credit.source}${artist}`;
}

function traced(credit: MediaCredit) {
  const by = credit.by ? ` by ${credit.by}` : '';
  const artist = credit.artist ? `, ${artistPhrase(credit, false)}` : '';
  return `traced${by} from ${credit.source}${artist}`;
}

/* Each method words its credit; the artist, the preparer and the style are optional parts. */
const phrases: Record<CreditMethod, (credit: MediaCredit) => string> = {
  official: origin,
  restored: (credit) => `${origin(credit)}, cleaned up by ${credit.by}`,
  recreated,
  traced,
  'ai-restored': (credit) => `${origin(credit)}, restored with AI image tools`,
  'ai-adapted': (credit) => `made with AI image tools, based on ${credit.source}${styleSuffix(credit)}`,
  ai: (credit) => `made with AI image tools for Dune Zone${styleSuffix(credit)}`,
  blog: () => 'a picture from the Dune Zone blog',
  online: () => 'found online. The original source is still being traced',
  unknown: (credit) => `artist not yet recorded${credit.source ? `. From ${credit.source}` : ''}`,
};

/** One readable line that says who made the artwork and how this copy was made. */
export function creditText(credit: MediaCredit, detail?: string): string {
  const phrase = phrases[credit.method](credit);
  const text = `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`;
  return detail ? `${text} ${detail}` : text;
}

/* The generated index groups paths by credit and folder, which keeps it small enough for the pickers. */
const creditByPath = new Map<string, CreditId>();
for (const [id, folders] of Object.entries(creditIndex.files)) {
  for (const [folder, names] of Object.entries(folders)) {
    for (const name of names) {
      creditByPath.set(`${folder}${name}`, id as CreditId);
    }
  }
}
const details: Record<string, string> = creditIndex.details;

/** The credit line for a stock file, or undefined when the path is not stock artwork. */
export function mediaCreditText(path: string): string | undefined {
  const id = creditByPath.get(path);
  return id ? creditText(creditDefinitions[id]!, details[path]) : undefined;
}

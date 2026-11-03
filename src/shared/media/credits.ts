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
const definitions = creditDefinitions;

export function isCreditId(id: string): id is CreditId {
  return Object.hasOwn(definitions, id);
}

function artistPhrase({ artist, artistRole }: MediaCredit, start = true) {
  const role = artistRole === 'design' ? 'design' : 'art';
  return `${start ? role.charAt(0).toUpperCase() + role.slice(1) : role} by ${artist}`;
}

function sentence(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function withStyle(text: string, style?: string) {
  return style ? `${text}, in the style of ${style}` : text;
}

function origin(credit: MediaCredit) {
  return credit.artist ? `${artistPhrase(credit)} for ${credit.source}` : `artwork from ${credit.source}`;
}

function suffix(condition: unknown, text: string) {
  return condition ? text : '';
}

/* Each method words its credit; the artist, the preparer and the style are optional parts. */
const phrases: Record<CreditMethod, (credit: MediaCredit) => string> = {
  official: origin,
  restored: (credit) => `${origin(credit)}, cleaned up by ${credit.by}`,
  recreated: (credit) =>
    `recreated by ${credit.by} from ${credit.source}${suffix(credit.artist, `. ${artistPhrase(credit)}`)}`,
  traced: (credit) =>
    `traced${suffix(credit.by, ` by ${credit.by}`)} from ${credit.source}${suffix(credit.artist, `, ${artistPhrase(credit, false)}`)}`,
  'ai-restored': (credit) => `${origin(credit)}, restored with AI image tools`,
  'ai-adapted': (credit) => withStyle(`made with AI image tools, based on ${credit.source}`, credit.style),
  ai: (credit) => withStyle('made with AI image tools for Dune Zone', credit.style),
  blog: () => 'a picture from the Dune Zone blog',
  online: () => 'found online. The original source is still being traced',
  unknown: (credit) => `artist not yet recorded${suffix(credit.source, `. From ${credit.source}`)}`,
};

/** One readable line that says who made the artwork and how this copy was made. */
export function creditText(credit: MediaCredit, detail?: string): string {
  const text = sentence(phrases[credit.method](credit));
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
  return id ? creditText(definitions[id]!, details[path]) : undefined;
}

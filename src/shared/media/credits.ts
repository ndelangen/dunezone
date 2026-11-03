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
  'unknown',
] as const;
export type CreditMethod = (typeof creditMethods)[number];

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

/** One readable line that says who made the artwork and how this copy was made. */
export function creditText(credit: MediaCredit, detail?: string): string {
  const { method, artist, source, style, by } = credit;
  const origin = artist ? `${artistPhrase(credit)} for ${source}` : `artwork from ${source}`;
  const text = (() => {
    switch (method) {
      case 'official':
        return origin;
      case 'restored':
        return `${origin}, cleaned up by ${by}`;
      case 'recreated':
        return `recreated by ${by} from ${source}${artist ? `. ${artistPhrase(credit)}` : ''}`;
      case 'traced':
        return `traced${by ? ` by ${by}` : ''} from ${source}${artist ? `, ${artistPhrase(credit, false)}` : ''}`;
      case 'ai-restored':
        return `${origin}, restored with AI image tools`;
      case 'ai-adapted':
        return withStyle(`made with AI image tools, based on ${source}`, style);
      case 'ai':
        return withStyle('made with AI image tools for Dune Zone', style);
      case 'blog':
        return 'a picture from the Dune Zone blog';
      case 'unknown':
        return source ? `artist not yet recorded. From ${source}` : 'artist not yet recorded';
    }
  })();
  return detail ? `${sentence(text)} ${detail}` : sentence(text);
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

import type { FactionToken } from '../../multiplayer/FactionTokenFace';

/** A seat a table chat message can name after an @: found by its faction's or its player's name, and always written as the faction's. */
export type Mention = Readonly<{
  /** The seat. */
  id: string;
  /** The faction's name, which the completion writes after the @. */
  label: string;
  /** The seat's player, shown dimmed beside the faction and found as well; null for a seat nobody holds. */
  detail: string | null;
  /** The player's avatar, where they have one. */
  avatar?: string | null;
  token: FactionToken;
  /** The viewer's own seat: named in messages, but never suggested. */
  own?: boolean;
  /** Whether the viewer has a chat with this seat's player. */
  chattable?: boolean;
}>;

/** A run of a message's text: plain, or a seat named after an @. */
export type MessageSegment = Readonly<{ text: string; mention?: Mention }>;

/*
 * A message's text cut where it names a seat: an @ that opens a mention, then a faction's name, ending where a word would.
 * The longest name wins, so "@House Atreides" is not cut at a faction called "House".
 */
export function splitMentions(text: string, mentions: readonly Mention[]): MessageSegment[] {
  const byLength = mentions.toSorted((a, b) => b.label.length - a.label.length);
  const segments: MessageSegment[] = [];
  let plain = 0;
  for (let at = text.indexOf('@'); at >= 0; at = text.indexOf('@', at + 1)) {
    if (!opensMention({ text, caret: at })) {
      continue;
    }
    const named = byLength.find((mention) => {
      const end = at + 1 + mention.label.length;
      const written = text.slice(at + 1, end);
      return (
        written.localeCompare(mention.label, undefined, { sensitivity: 'base' }) === 0 &&
        !/^[\p{L}\p{N}]/u.test(text.slice(end))
      );
    });
    if (!named) {
      continue;
    }
    if (at > plain) {
      segments.push({ text: text.slice(plain, at) });
    }
    const end = at + 1 + named.label.length;
    segments.push({ text: text.slice(at, end), mention: named });
    plain = end;
    at = end - 1;
  }
  if (plain < text.length) {
    segments.push({ text: text.slice(plain) });
  }
  return segments;
}

/** The @ being typed before the caret: where it sits and what follows it so far. */
export type MentionQuery = Readonly<{ at: number; query: string }>;

/** A composer's text and where its caret stands in it. */
export type Draft = Readonly<{ text: string; caret: number }>;

/* Names are short; a run of text this long after an @ is a sentence, not a name being typed. */
const MAX_QUERY = 40;

/*
 * The @ the caret is typing after, if any.
 * An @ opens a mention at the start of the text or after a space or an opening bracket, so an e-mail address never does.
 * A line break ends it; spaces do not, since a name can have them, and the suggestions close once nothing matches.
 */
export function mentionQuery({ text, caret }: Draft): MentionQuery | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0 || caret - at - 1 > MAX_QUERY) {
    return null;
  }
  const query = before.slice(at + 1);
  /* What follows the @ can still be a name: it neither starts with a space nor runs onto another line. */
  const namesSoFar = !query.includes('\n') && !/^\s/.test(query);
  return opensMention({ text, caret: at }) && namesSoFar ? { at, query } : null;
}

/* The @ at the caret opens a mention: it stands at the start of the text or after a space or an opening bracket. */
function opensMention({ text, caret }: Draft) {
  return caret === 0 || /[\s([{]/.test(text[caret - 1]!);
}

/* Case and accents aside, so "@pa" finds "Paul" and "@atre" finds "Atréides". */
function fold(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * The suggestions for what follows an @: those whose faction or player name, or any word of either, starts with it.
 * A name starting with it comes first.
 * Every seat shows, even two whose factions share a name: their players tell them apart.
 */
export function matchMentions(mentions: readonly Mention[], { query }: MentionQuery): Mention[] {
  const wanted = fold(query);
  const names = (mention: Mention) => [mention.label, mention.detail ?? ''].map(fold);
  const starts = mentions.filter((mention) => names(mention).some((name) => name.startsWith(wanted)));
  const words = mentions.filter(
    (mention) =>
      !starts.includes(mention) &&
      names(mention)
        .flatMap((name) => name.split(/[\s-]+/))
        .some((word) => word.startsWith(wanted))
  );
  return [...starts, ...words];
}

/**
 * The text with the @ and what follows it up to the caret replaced by the chosen name and one space, and where the caret then goes.
 * Where a space already follows, the caret steps over it rather than writing a second.
 */
export function completeMention({ text, caret }: Draft, { at }: MentionQuery, chosen: Mention): Draft {
  const after = text.slice(caret);
  const spaced = after.startsWith(' ');
  const mention = `@${chosen.label}${spaced ? '' : ' '}`;
  return { text: text.slice(0, at) + mention + after, caret: at + mention.length + (spaced ? 1 : 0) };
}

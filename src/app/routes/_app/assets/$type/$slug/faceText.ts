/**
 * The words printed on an asset's face, as formatted-text sources the detail page can render as HTML.
 *
 * The face itself reaches the page as an image, so without this a card's rules live only in pixels: a reader with a screen reader, a search engine and anyone who wants to copy a ruling get the name and nothing else.
 * Reading the stored fields, rather than the rendered face, keeps the text exactly what the author typed.
 *
 * `asset.data` is stored untyped and older rows predate some fields, so every read here checks its shape and skips what is missing rather than trusting the schema.
 * A type with nothing printed beyond its name (a deck, a bundle, a board, a plain token) answers an empty list, and the page then shows no section.
 */
import { standardSpiceText } from '@game/assets/card/spiceText';

/** One region of printed text. `label` names the region when a face has more than one, the way the card itself titles them. */
export type FaceTextEntry = { label?: string; source: string };

type Data = Record<string, unknown>;

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Drops empty regions, so a card whose author left one blank does not print a heading over nothing. */
function present(entries: readonly FaceTextEntry[]): FaceTextEntry[] {
  return entries.filter((entry) => entry.source.length > 0);
}

/** A custom card's text layers, in the order they are painted. */
function layerTexts(data: Data): FaceTextEntry[] {
  const layers = Array.isArray(data.layers) ? data.layers : [];
  return present(
    layers
      .filter((layer): layer is Data => isRecord(layer) && layer.kind === 'text')
      .map((layer) => ({ source: text(layer.content) }))
  );
}

/** A round token face's three curved labels, top first, joined as the face reads them. */
function roundFaceLabels(face: unknown): string {
  if (!isRecord(face)) {
    return '';
  }
  return [text(face.top), text(face.bottomFirst), text(face.bottomSecond)].filter(Boolean).join('\n');
}

/** A rectangle token face's placed texts, in paint order. */
function rectangleFaceTexts(face: unknown): string {
  if (!isRecord(face) || !Array.isArray(face.texts)) {
    return '';
  }
  return face.texts
    .map((placed) => (isRecord(placed) ? text(placed.content) : ''))
    .filter(Boolean)
    .join('\n');
}

/**
 * A two-faced token's words: one unlabelled entry when only the front prints anything, otherwise one per face.
 * A `same` or `reference` back prints nothing of its own here;
 * a referenced back is the other token's, and that token's page carries its words.
 */
function tokenFaces(data: Data, read: (face: unknown) => string): FaceTextEntry[] {
  const front = read(data.front);
  const back = isRecord(data.back) && data.back.mode === 'custom' ? read(data.back.face) : '';
  if (!back) {
    return present([{ source: front }]);
  }
  return present([
    { label: 'Front', source: front },
    { label: 'Back', source: back },
  ]);
}

const READERS: Partial<Record<string, (data: Data) => FaceTextEntry[]>> = {
  'card-treachery': (data) => present([{ source: text(data.text) }]),
  'card-stronghold': (data) => present([{ source: text(data.text) }]),
  /* An empty body is the renderer's own sentence, so the page prints that sentence too. */
  'card-spice': (data) => {
    const authored = text(data.text);
    if (authored) {
      return [{ source: authored }];
    }
    const { icon, amount, name } = data;
    if (typeof icon !== 'string' || typeof amount !== 'number') {
      return [];
    }
    /* The face breaks the line to fit the art; read as prose it is one sentence. */
    return [{ source: standardSpiceText({ icon: icon as never, amount, name: text(name) }).replace('\n', ' ') }];
  },
  'card-custom': layerTexts,
  /* The movement line is printed from the sector count, the same sentence the face draws. */
  'card-storm': (data) => {
    const sectors = typeof data.sectors === 'number' ? data.sectors : null;
    const movement =
      sectors === null
        ? []
        : [{ source: `Move the storm ${sectors} ${sectors === 1 ? 'sector' : 'sectors'} counter-clockwise.` }];
    return [...movement, ...layerTexts(data)];
  },
  'card-leaderability': (data) =>
    present([
      { label: 'General ability', source: text(data.generalText) },
      { label: 'Battle ability', source: text(data.battleText) },
    ]),
  'card-nexus': (data) =>
    present([
      { label: 'Betrayal', source: text(data.betrayal) },
      { label: 'Cunning', source: text(data.cunning) },
      { label: 'Secret Ally', source: text(data.secretAlly) },
    ]),
  'card-homeworld': (data) => {
    const threshold = typeof data.threshold === 'number' ? data.threshold : null;
    const reserve = (title: string, value: unknown, condition: string | null): FaceTextEntry => {
      const state = isRecord(value) ? value : {};
      const details = [condition, typeof state.strength === 'number' ? `strength ${state.strength}` : null]
        .filter(Boolean)
        .join(', ');
      return { label: details ? `${title} (${details})` : title, source: text(state.text) };
    };
    return present([
      reserve('High reserves', data.high, threshold === null ? null : `${threshold} or more forces`),
      reserve(
        'Low reserves',
        data.low,
        threshold === null ? null : threshold === 1 ? '0 forces' : `0 to ${threshold - 1} forces`
      ),
      { label: 'Occupied', source: text(data.occupied) },
    ]);
  },
  'token-leader': (data) => (typeof data.strength === 'number' ? [{ source: `Strength ${data.strength}` }] : []),
  'token-disc': (data) => tokenFaces(data, roundFaceLabels),
  'token-tech': (data) => tokenFaces(data, roundFaceLabels),
  'token-plate': (data) => tokenFaces(data, roundFaceLabels),
  /* A pointer's outline carries no label lines, so whatever its face still stores is not printed. */
  'token-enhance': (data) => tokenFaces(data, rectangleFaceTexts),
};

export function assetFaceText(type: string, data: unknown): FaceTextEntry[] {
  const read = READERS[type];
  return read && isRecord(data) ? read(data) : [];
}

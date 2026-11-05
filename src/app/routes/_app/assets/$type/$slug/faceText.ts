/**
 * The words printed on an asset's face, as formatted-text sources the detail page can render as HTML.
 *
 * The face itself reaches the page as an image, so without this a card's rules live only in pixels: a reader with a screen reader, a search engine and anyone who wants to copy a ruling get the name and nothing else.
 * Reading the stored fields, rather than the rendered face, keeps the text exactly what the author typed.
 *
 * `asset.data` is stored untyped and older rows predate some fields, so every read here checks its shape and skips what is missing rather than trusting the schema.
 * A type with nothing printed beyond its name (a deck, a bundle, a board, a plain token) answers an empty list, and the page then shows no section.
 */
import { homeworldEffects, nexusEffects, stormMovementText } from '@game/assets/card/cardEffectText';
import type { CardEffect } from '@game/assets/card/cardEffectText';
import { standardSpiceText } from '@game/assets/card/spiceText';

/**
 * One region of printed text.
 * `label` names the region when a face has more than one, the way the card itself titles them.
 * `plain` marks a field the face prints as typed rather than as formatted text, such as a token label, so a hyphen or asterisk in it is not read as markup.
 */
export type FaceTextEntry = { label?: string; source: string; plain?: boolean };

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

/** A layer or placed text the author faded out entirely draws nothing, so it prints nothing here either. */
function visible(element: Data): boolean {
  return element.opacity !== 0;
}

/**
 * A custom card's text layers, in the order they are painted.
 * An embedded token's labels are left to that token's own page, the way a referenced back is.
 */
function layerTexts(data: Data): FaceTextEntry[] {
  const layers = Array.isArray(data.layers) ? data.layers : [];
  return present(
    layers
      .filter((layer): layer is Data => isRecord(layer) && layer.kind === 'text' && visible(layer))
      .map((layer) => ({ source: text(layer.content) }))
  );
}

/** A Nexus or homeworld region, titled with the condition and strength its template prints beside the title. */
function effectEntry({ title, condition, text: body, strength }: CardEffect): FaceTextEntry {
  const details = [condition, strength === undefined ? null : `strength ${strength}`].filter(Boolean).join(', ');
  return { label: details ? `${title} (${details})` : title, source: text(body) };
}

function reserve(value: unknown): { text: string; strength: number } {
  const state = isRecord(value) ? value : {};
  return { text: text(state.text), strength: typeof state.strength === 'number' ? state.strength : 0 };
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
    .map((placed) => (isRecord(placed) && visible(placed) ? text(placed.content) : ''))
    .filter(Boolean)
    .join('\n');
}

/**
 * A two-faced token's words, printed as typed.
 * A `same` back repeats the front, so one unlabelled entry says it all.
 * A `reference` back is the other token's, and that token's page carries its words, so the front is named as only the front.
 */
function tokenFaces(data: Data, read: (face: unknown) => string): FaceTextEntry[] {
  const mode = isRecord(data.back) ? data.back.mode : undefined;
  const front = read(data.front);
  const back = mode === 'custom' && isRecord(data.back) ? read(data.back.face) : '';
  const labelled = mode === 'reference' || back.length > 0;
  if (!labelled) {
    return present([{ source: front, plain: true }]);
  }
  return present([
    { label: 'Front', source: front, plain: true },
    { label: 'Back', source: back, plain: true },
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
    return [{ source: standardSpiceText({ icon: icon as never, amount, name: text(name) }).replaceAll('\n', ' ') }];
  },
  'card-custom': layerTexts,
  /* The movement line is printed from the sector count, the same sentence the face draws. */
  'card-storm': (data) => {
    const movement = typeof data.sectors === 'number' ? [{ source: stormMovementText(data.sectors) }] : [];
    return [...movement, ...layerTexts(data)];
  },
  /* The face prints the general ability bare and opens the battle ability with this line, so the page keeps both. */
  'card-leaderability': (data) =>
    present([{ source: text(data.generalText) }, { label: 'This leader in battle', source: text(data.battleText) }]),
  'card-nexus': (data) =>
    present(
      nexusEffects({
        faction: text(data.faction),
        betrayal: text(data.betrayal),
        cunning: text(data.cunning),
        secretAlly: text(data.secretAlly),
      }).map(effectEntry)
    ),
  'card-homeworld': (data) =>
    typeof data.threshold === 'number'
      ? present(
          homeworldEffects({
            threshold: data.threshold,
            high: reserve(data.high),
            low: reserve(data.low),
            occupied: text(data.occupied),
          }).map(effectEntry)
        )
      : [],
  /* The face prints the strength as a bare numeral. */
  'token-leader': (data) =>
    typeof data.strength === 'number' ? [{ source: `Strength ${data.strength}`, plain: true }] : [],
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

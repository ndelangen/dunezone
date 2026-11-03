import { gameAssetColors } from '@shared/play/assetColors';
import type { TableItem } from '@shared/play/model';
import { createContext, useContext, useEffect, useState } from 'react';

import { card } from '@game/data/sizes';

/**
 * A prediction card's front is the shared base with the chosen faction's emblem and the predicted turn drawn where a Treachery card's decals sit (#1753).
 * The choice reaches a client only with the front, so every client draws it locally rather than reading a published image of it.
 */
export type CardPrediction = NonNullable<NonNullable<TableItem['artwork']>['prediction']>;

/** Each faction's emblem by faction id, provided by the hosted table from the snapshot's public faction artwork. */
export const PredictionEmblemsContext = createContext<Readonly<Record<string, string>>>({});

/* The decal slot of a Treachery card, in card pixels: a 439px square centred horizontally, its centre 470px from the top (`Decals.tsx`). */
const DECAL_CENTRE_Y = 470;
const EMBLEM = { centreY: DECAL_CENTRE_Y - 40, size: 230 };
const TURN = { centreY: DECAL_CENTRE_Y + 165, size: 170, font: 'C_Advokat_Modern' };
/* Decals draw black with a light outline (`Decals.tsx`); the overlay keeps both colours and the outline width. */
const FOREGROUND = gameAssetColors.predictionPaper;
const INK = gameAssetColors.predictionInk;
const OUTLINE = 6;
const SCALE = 0.5;

const RETRY_MS = 5000;

const faces = new Map<string, Promise<HTMLCanvasElement>>();

/** One overlay per emblem and turn; the cache and the hook both name faces by this key. */
function faceKey(emblem: string, turn: number) {
  return `${emblem}|${turn}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`The emblem ${src} did not load.`));
    image.src = src;
  });
}

/** The emblem fitted inside a square box, keeping its proportions. */
function fitted(image: HTMLImageElement, box: number) {
  const ratio = Math.min(box / (image.naturalWidth || box), box / (image.naturalHeight || box));
  return { width: (image.naturalWidth || box) * ratio, height: (image.naturalHeight || box) * ratio };
}

function drawEmblem(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const { width, height } = fitted(image, EMBLEM.size);
  const x = card.width / 2 - width / 2;
  const y = EMBLEM.centreY - height / 2;
  const silhouette = document.createElement('canvas');
  silhouette.width = Math.ceil(width);
  silhouette.height = Math.ceil(height);
  const ink = silhouette.getContext('2d')!;
  ink.drawImage(image, 0, 0, width, height);
  ink.globalCompositeOperation = 'source-in';
  ink.fillStyle = FOREGROUND;
  ink.fillRect(0, 0, width, height);
  /* A ring of offset silhouettes stands in for the decals' dilate filter, which a canvas does not have. */
  for (let step = 0; step < 16; step += 1) {
    const angle = (step / 16) * Math.PI * 2;
    context.drawImage(silhouette, x + Math.cos(angle) * OUTLINE, y + Math.sin(angle) * OUTLINE, width, height);
  }
  context.drawImage(image, x, y, width, height);
}

function drawTurn(context: CanvasRenderingContext2D, turn: number) {
  context.font = `${TURN.size}px "${TURN.font}", serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = OUTLINE * 2;
  context.strokeStyle = FOREGROUND;
  context.fillStyle = INK;
  context.strokeText(String(turn), card.width / 2, TURN.centreY);
  context.fillText(String(turn), card.width / 2, TURN.centreY);
}

async function drawFace(emblem: string, turn: number): Promise<HTMLCanvasElement> {
  const [image] = await Promise.all([
    loadImage(emblem),
    document.fonts?.load(`${TURN.size}px "${TURN.font}"`, String(turn)).catch(() => undefined),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(card.width * SCALE);
  canvas.height = Math.round(card.height * SCALE);
  const context = canvas.getContext('2d')!;
  context.scale(SCALE, SCALE);
  drawEmblem(context, image);
  drawTurn(context, turn);
  return canvas;
}

/** The overlay for one choice, drawn once per emblem and turn and shared by every face that shows it. */
function predictionFace(emblem: string, turn: number): Promise<HTMLCanvasElement> {
  const key = faceKey(emblem, turn);
  let face = faces.get(key);
  if (!face) {
    face = drawFace(emblem, turn);
    faces.set(key, face);
    face.catch(() => faces.delete(key));
  }
  return face;
}

/** The emblem and turn a prediction draws, or null when it has none to draw. */
function faceSource(prediction: CardPrediction | undefined, emblems: Readonly<Record<string, string>>) {
  const emblem = prediction && emblems[prediction.factionId];
  return emblem ? { emblem, turn: prediction.turn, key: faceKey(emblem, prediction.turn) } : null;
}

/** The overlay canvas for a prediction, or null while it draws, when there is none, or when the faction has no emblem. */
export function usePredictionFace(prediction: CardPrediction | undefined): HTMLCanvasElement | null {
  const source = faceSource(prediction, useContext(PredictionEmblemsContext));
  const [face, setFace] = useState<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  /* An emblem that failed to load is tried again, as the published face beneath it is. */
  const [attempt, setAttempt] = useState(0);
  const key = source?.key ?? null;
  const emblem = source?.emblem;
  const turn = source?.turn;
  useEffect(() => {
    if (emblem === undefined || turn === undefined) {
      return;
    }
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    predictionFace(emblem, turn).then(
      (canvas) => live && setFace({ key: faceKey(emblem, turn), canvas }),
      () => {
        if (live) {
          retry = setTimeout(() => setAttempt((value) => value + 1), RETRY_MS);
        }
      }
    );
    return () => {
      live = false;
      clearTimeout(retry);
    };
  }, [emblem, turn, attempt]);
  return face?.key === key ? face.canvas : null;
}

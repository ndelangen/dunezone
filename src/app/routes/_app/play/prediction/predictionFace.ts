import type { TableItem } from '@shared/play/model';
import { createContext, useContext, useEffect, useState } from 'react';

import { card } from '@game/data/sizes';

/**
 * A prediction card's front is the shared base with the chosen faction's logo and the predicted turn drawn where a Treachery card's decals sit (#1753).
 * The choice reaches a client only with the front, so every client draws it locally rather than reading a published image of it.
 */
export type CardPrediction = NonNullable<NonNullable<TableItem['artwork']>['prediction']>;

/** Each faction's logo by faction id, provided by the hosted table from the snapshot's public faction artwork. */
export const PredictionLogosContext = createContext<Readonly<Record<string, string>>>({});

/* The decal slot of a Treachery card, in card pixels: a 439px square centred horizontally, its centre 470px from the top (`Decals.tsx`). */
const DECAL_CENTRE_Y = 470;
const LOGO = { centreY: DECAL_CENTRE_Y - 40, size: 230 };
const TURN = { centreY: DECAL_CENTRE_Y + 165, size: 150, font: 'Caladea' };
/* Decals draw black with a light outline (`Decals.tsx`); the overlay keeps both colours and the outline width. */
const FOREGROUND = '#e3dbb3';
const INK = '#1c140d';
const OUTLINE = 6;
const SCALE = 0.5;

const faces = new Map<string, Promise<HTMLCanvasElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`The logo ${src} did not load.`));
    image.src = src;
  });
}

/** The logo fitted inside a square box, keeping its proportions. */
function fitted(image: HTMLImageElement, box: number) {
  const ratio = Math.min(box / (image.naturalWidth || box), box / (image.naturalHeight || box));
  return { width: (image.naturalWidth || box) * ratio, height: (image.naturalHeight || box) * ratio };
}

function drawLogo(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const { width, height } = fitted(image, LOGO.size);
  const x = card.width / 2 - width / 2;
  const y = LOGO.centreY - height / 2;
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

async function drawFace(logo: string, turn: number): Promise<HTMLCanvasElement> {
  const [image] = await Promise.all([
    loadImage(logo),
    document.fonts?.load(`${TURN.size}px "${TURN.font}"`, String(turn)).catch(() => undefined),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(card.width * SCALE);
  canvas.height = Math.round(card.height * SCALE);
  const context = canvas.getContext('2d')!;
  context.scale(SCALE, SCALE);
  drawLogo(context, image);
  drawTurn(context, turn);
  return canvas;
}

/** The overlay for one choice, drawn once per logo and turn and shared by every face that shows it. */
export function predictionFace(logo: string, turn: number): Promise<HTMLCanvasElement> {
  const key = `${logo}|${turn}`;
  let face = faces.get(key);
  if (!face) {
    face = drawFace(logo, turn);
    faces.set(key, face);
    face.catch(() => faces.delete(key));
  }
  return face;
}

/** The overlay canvas for a prediction, or null while it draws, when there is none, or when the faction has no logo. */
export function usePredictionFace(prediction: CardPrediction | undefined): HTMLCanvasElement | null {
  const logos = useContext(PredictionLogosContext);
  const logo = prediction ? logos[prediction.factionId] : undefined;
  const turn = prediction?.turn;
  const [face, setFace] = useState<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const key = logo && turn ? `${logo}|${turn}` : null;
  useEffect(() => {
    if (!logo || !turn) {
      return;
    }
    let live = true;
    predictionFace(logo, turn).then(
      (canvas) => live && setFace({ key: `${logo}|${turn}`, canvas }),
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [logo, turn]);
  return face && face.key === key ? face.canvas : null;
}

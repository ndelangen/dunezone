import { PIECE_FLIP_STYLES } from '@shared/play/pieceFlip';
import type { PieceFlipStyle, PieceFlipStyleName } from '@shared/play/pieceFlip';

import { tableAudio } from './tableSounds';

/*
 * The deck flip prototypes of #2989: a story picks one with `<html data-trial-deck-flip="lift">`;
 * with none set the table flips as it does today. Removed again once one is picked.
 */
function trialName(): PieceFlipStyleName {
  const name = typeof document === 'undefined' ? undefined : document.documentElement.dataset.trialDeckFlip;
  return name && name in PIECE_FLIP_STYLES ? (name as PieceFlipStyleName) : 'today';
}

/** The flip style this page plays. */
export function flipStyle(): PieceFlipStyle {
  return PIECE_FLIP_STYLES[trialName()];
}

/** A soft papery flick as a turn begins, for every seat that sees it; today's flip is silent. */
export function playFlipSound() {
  if (trialName() === 'today') {
    return;
  }
  const sound = tableAudio();
  if (!sound) {
    return;
  }
  const { context, output } = sound;
  const length = Math.floor(context.sampleRate * 0.09);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < length; index++) {
    samples[index] = Math.random() * 2 - 1;
  }
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.9;
  const gain = context.createGain();
  const start = context.currentTime + 0.01;
  filter.frequency.setValueAtTime(1800, start);
  filter.frequency.exponentialRampToValueAtTime(3600, start + 0.08);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
  noise.connect(filter).connect(gain).connect(output);
  noise.start(start);
  noise.stop(start + 0.1);
}

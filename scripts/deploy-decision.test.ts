import { describe, expect, test } from 'vitest';

import type { Reading } from './deploy-decision';
import { decide } from './deploy-decision';

const GAME = 'https://dune.zone/__play/health';
const PUBLISHER = 'https://dune.zone/__asset-publisher/health';
const EARLIER = 'e'.repeat(40);
const LATER = 'f'.repeat(40);
const THIS = 'a'.repeat(40);

describe('production deploy decision', () => {
  test('deploys over an earlier release and hands its commit to the dev rebuild', () => {
    const readings: Reading[] = [
      { endpoint: GAME, sha: EARLIER, position: 'older' },
      { endpoint: PUBLISHER, sha: EARLIER, position: 'older' },
    ];
    expect(decide(readings)).toMatchObject({ deploy: true, base: EARLIER });
  });

  test('stops a late run when a Worker is on a later commit, and a duplicate when every Worker has this one', () => {
    const late: Reading[] = [
      { endpoint: GAME, sha: LATER, position: 'newer' },
      { endpoint: PUBLISHER, position: 'unknown', note: 'no answer' },
    ];
    expect(decide(late)).toEqual({
      deploy: false,
      base: '',
      reason: `${GAME} already reports ${LATER}, a later commit`,
    });
    const duplicate: Reading[] = [
      { endpoint: GAME, sha: THIS, position: 'same' },
      { endpoint: PUBLISHER, sha: THIS, position: 'same' },
    ];
    expect(decide(duplicate).deploy).toBe(false);
  });

  test('deploys, with no base, when production cannot be read or only part of it has this commit', () => {
    const unreadable: Reading[] = [
      { endpoint: GAME, position: 'unknown', note: 'HTTP 503' },
      { endpoint: PUBLISHER, sha: THIS, position: 'same' },
    ];
    expect(decide(unreadable)).toMatchObject({ deploy: true, base: '' });
    const halfReleased: Reading[] = [
      { endpoint: GAME, sha: THIS, position: 'same' },
      { endpoint: PUBLISHER, sha: EARLIER, position: 'older' },
    ];
    expect(decide(halfReleased)).toMatchObject({ deploy: true, base: '' });
  });
});

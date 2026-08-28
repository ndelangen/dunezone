import { describe, expect, test } from 'vitest';

import { postedPayload } from './authoringEnvelope';

/* Two keys, so a memory key riding along in the draft is visibly dropped rather than coincidentally absent. */
const schema = { shape: { name: null, body: null } };

describe('the posted payload carries the stored keys and nothing else', () => {
  test('a key the schema does not name is dropped, which is what keeps a session memory out of a strict stored shape', () => {
    const carried = { name: 'Lasgun', body: 'Kills a leader.', declaredCustom: true };
    expect(postedPayload(schema, carried)).toEqual({ name: 'Lasgun', body: 'Kills a leader.' });
  });

  test('a key the schema names but the draft lacks is not invented', () => {
    expect(postedPayload(schema, { name: 'Lasgun' })).toEqual({ name: 'Lasgun' });
  });
});

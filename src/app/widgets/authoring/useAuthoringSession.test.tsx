// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { postedPayload } from './authoringEnvelope';
import { useAuthoringEnvelope, useAuthoringSession } from './useAuthoringSession';

type Draft = { name: string; body: string };
type Memory = { declaredCustom: boolean };

/* Two keys, so a memory key riding along in `data` would be visibly dropped rather than coincidentally absent. */
const schema = { shape: { name: null, body: null } };
const initialData: Draft = { name: 'Lasgun', body: 'Kills a leader.' };
const initialMemory: Memory = { declaredCustom: false };

function envelope() {
  return renderHook(() => useAuthoringEnvelope<Draft, Memory>({ initialData, initialMemory }));
}

describe('the envelope keeps the draft and the session memory apart', () => {
  test('patch and remember each move only their own half', () => {
    const { result } = envelope();
    act(() => result.current.patch({ body: 'Kills a leader before battle.' }));
    act(() => result.current.remember({ declaredCustom: true }));
    expect(result.current.draft).toEqual({ name: 'Lasgun', body: 'Kills a leader before battle.' });
    expect(result.current.memory).toEqual({ declaredCustom: true });
  });

  test('replace returns memory to its opening state along with the draft', () => {
    const { result } = envelope();
    act(() => result.current.remember({ declaredCustom: true }));
    act(() => result.current.patch({ name: 'Shield' }));
    act(() => result.current.replace(initialData));
    expect(result.current.draft).toEqual(initialData);
    expect(result.current.memory).toEqual({ declaredCustom: false });
  });

  test('the caller keeps no handle on what the form now holds', () => {
    const seed: Draft = { name: 'Lasgun', body: 'Kills a leader.' };
    const { result } = renderHook(() => useAuthoringEnvelope<Draft, Memory>({ initialData: seed, initialMemory }));
    act(() => result.current.patch({ name: 'Shield' }));
    expect(seed.name).toBe('Lasgun');
  });
});

describe('the posted payload carries the stored keys and nothing else', () => {
  test('a key the schema does not name is dropped', () => {
    const carried = { name: 'Lasgun', body: 'Kills a leader.', declaredCustom: true };
    expect(postedPayload(schema, carried)).toEqual({ name: 'Lasgun', body: 'Kills a leader.' });
  });

  test('a key the schema names but the draft lacks is not invented', () => {
    expect(postedPayload(schema, { name: 'Lasgun' })).toEqual({ name: 'Lasgun' });
  });
});

function session(save = vi.fn().mockResolvedValue({ slug: 'lasgun' })) {
  const onSaved = vi.fn();
  const rendered = renderHook(() => {
    const held = useAuthoringEnvelope<Draft, Memory>({ initialData, initialMemory });
    return {
      held,
      session: useAuthoringSession({
        envelope: held,
        warnings: [],
        schema,
        mutation: { mutateAsync: save, isPending: false, error: null, data: undefined },
        variables: (payload) => payload,
        validationHeaderId: 'authoring-test-header',
        onFocusWarning: () => undefined,
        onSaved,
      }),
    };
  });
  return { ...rendered, save, onSaved };
}

describe('dirty answers for the draft alone', () => {
  test('a draft change is dirty', () => {
    const { result } = session();
    expect(result.current.session.status.isDirty).toBe(false);
    act(() => result.current.held.patch({ body: 'Something else.' }));
    expect(result.current.session.status.isDirty).toBe(true);
  });

  test('a memory change is not, which is D6 and the reason Save cannot arm over an unchanged row', () => {
    const { result } = session();
    act(() => result.current.held.remember({ declaredCustom: true }));
    expect(result.current.session.status.isDirty).toBe(false);
  });

  test('reset returns the draft and clears dirty', () => {
    const { result } = session();
    act(() => result.current.held.patch({ name: 'Shield' }));
    act(() => result.current.session.actions.reset());
    expect(result.current.held.draft).toEqual(initialData);
    expect(result.current.session.status.isDirty).toBe(false);
  });
});

describe('the save posts the draft and adopts what it posted', () => {
  test('memory never reaches the payload, and the posted values become the new baseline', async () => {
    const { result, save, onSaved } = session();
    act(() => result.current.held.remember({ declaredCustom: true }));
    act(() => result.current.held.patch({ name: 'Shield' }));
    await act(async () => {
      result.current.session.actions.save();
    });
    expect(save).toHaveBeenCalledWith({ name: 'Shield', body: 'Kills a leader.' });
    expect(onSaved).toHaveBeenCalledWith({ slug: 'lasgun' });
    expect(result.current.session.status.isDirty).toBe(false);
  });

  test('a rejected save leaves the draft dirty and tells nobody, because the mutation object carries the failure', async () => {
    const { result, onSaved } = session(vi.fn().mockRejectedValue(new Error('nope')));
    act(() => result.current.held.patch({ name: 'Shield' }));
    await act(async () => {
      result.current.session.actions.save();
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.session.status.isDirty).toBe(true);
  });
});

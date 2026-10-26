/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { act } from 'react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { stubMatchMedia } from '../play/multiplayer/jsdom.test.fixture';
import { ReadAloud } from './ReadAloud';

stubMatchMedia();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* The browser's voice, as far as the button uses it: what it was asked to say, and when it was stopped. */
function fakeVoice() {
  const said: SpeechSynthesisUtterance[] = [];
  const voice = {
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => said.push(utterance)),
    cancel: vi.fn(),
    getVoices: () => [
      { lang: 'nl-NL', default: true },
      { lang: 'en-GB', default: false, localService: true },
    ],
  };
  vi.stubGlobal('speechSynthesis', voice);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class extends EventTarget {
      lang = '';
      voice: unknown = null;
      constructor(readonly text: string) {
        super();
      }
    }
  );
  return { voice, said };
}

const show = (text: string) =>
  render(
    <MantineProvider theme={appContentTheme}>
      <ReadAloud text={text} />
    </MantineProvider>
  );

test('a press reads the text in an English voice with its keys spoken, and the next press stops it at once', () => {
  const { voice, said } = fakeVoice();
  show('Open the controls. Press {Space}, then {←}.');
  fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }), { detail: 1 });
  expect(said.map((utterance) => utterance.text)).toEqual(['Open the controls. Press Space, then left arrow.']);
  expect(said[0]!.lang).toBe('en-GB');
  const stop = screen.getByRole('button', { name: 'Stop reading' });
  expect(stop.getAttribute('aria-pressed')).toBe('true');
  voice.cancel.mockClear();
  fireEvent.click(stop, { detail: 1 });
  expect(voice.cancel).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy();
});

test('the button goes back to rest when the voice finishes, and the voice stops as the button goes', () => {
  const { voice, said } = fakeVoice();
  const view = show('Open the controls.');
  fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
  act(() => {
    said[0]!.dispatchEvent(new Event('end'));
  });
  expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
  voice.cancel.mockClear();
  view.unmount();
  expect(voice.cancel).toHaveBeenCalledTimes(1);
});

test('leaving the page stops the voice and puts the button back at rest, for a page shown again on Back', () => {
  const { voice } = fakeVoice();
  show('Open the controls.');
  fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
  voice.cancel.mockClear();
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  expect(voice.cancel).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy();
});

test('where the browser has no voice there is no button', () => {
  show('Open the controls.');
  expect(screen.queryByRole('button')).toBeNull();
});

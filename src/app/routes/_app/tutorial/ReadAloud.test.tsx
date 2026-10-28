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
  localStorage.clear();
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

const content = (text: string | null, stepKey = 'step-1', introduce = false) => (
  <MantineProvider theme={appContentTheme}>
    <ReadAloud text={text} stepKey={stepKey} introduce={introduce} />
  </MantineProvider>
);

const on = () => screen.getByRole('button', { name: 'Turn speaking mode on' });
const off = () => screen.getByRole('button', { name: 'Turn speaking mode off' });

test('one press enables subsequent descriptions, including after the previous utterance ends', () => {
  const { voice, said } = fakeVoice();
  const view = render(content('Press {Space}, then {←}.'));
  expect(said).toHaveLength(0);
  fireEvent.click(on(), { detail: 1 });
  expect(said.map((utterance) => utterance.text)).toEqual(['Press Space, then left arrow.']);
  expect(said[0]!.lang).toBe('en-GB');
  act(() => {
    said[0]!.dispatchEvent(new Event('end'));
  });
  expect(off().getAttribute('aria-pressed')).toBe('true');
  view.rerender(content('Open your hand with {H}.', 'step-2'));
  expect(said.at(-1)!.text).toBe('Open your hand with the H key.');
  const count = said.length;
  view.rerender(content('Open your hand with {H}.', 'step-2'));
  expect(said).toHaveLength(count);
  voice.cancel.mockClear();
  fireEvent.click(off());
  expect(voice.cancel).toHaveBeenCalled();
  view.rerender(content('Move a piece.', 'step-3'));
  expect(said).toHaveLength(count);
  expect(on().getAttribute('aria-pressed')).toBe('false');
});

test('both choices survive leaving a chapter and opening another', () => {
  const { said } = fakeVoice();
  const first = render(content('First chapter.'));
  fireEvent.click(on());
  first.unmount();
  const second = render(content('Second chapter.'));
  expect(said.at(-1)!.text).toBe('Second chapter.');
  fireEvent.click(off());
  second.unmount();
  const count = said.length;
  render(content('Welcome again.', 'welcome', true));
  expect(said).toHaveLength(count);
  expect(on().hasAttribute('data-attention')).toBe(false);
});

test('the Welcome introduction speaks without opting in, and Enter can leave it silent', () => {
  const { said } = fakeVoice();
  const view = render(content('Welcome. Press {Z} to hear each step.', 'welcome', true));
  expect(said.at(-1)!.text).toBe('Welcome. Press the Z key to hear each step.');
  expect(on().getAttribute('aria-pressed')).toBe('false');
  expect(on().hasAttribute('data-attention')).toBe(true);
  view.rerender(content('This is the table.', 'board'));
  expect(said).toHaveLength(1);
  expect(on().hasAttribute('data-attention')).toBe(false);
});

test('Z toggles the preference once and leaves typing, composition and modified shortcuts alone', () => {
  const { said } = fakeVoice();
  render(content('Read this description.'));
  for (const extra of [
    { repeat: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
  ]) {
    fireEvent.keyDown(window, { key: 'z', ...extra });
  }
  for (const tag of ['input', 'textarea', 'select']) {
    const input = document.createElement(tag);
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'z' });
    input.remove();
  }
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  document.body.append(editable);
  fireEvent.keyDown(editable, { key: 'z' });
  editable.remove();
  expect(said).toHaveLength(0);
  fireEvent.keyDown(window, { key: 'z' });
  expect(off().getAttribute('aria-pressed')).toBe('true');
  expect(said).toHaveLength(1);
  fireEvent.keyDown(window, { key: 'Z' });
  expect(on().getAttribute('aria-pressed')).toBe('false');
});

test('choosing a mode ends the introduction pulse', () => {
  const { said } = fakeVoice();
  const view = render(content('Welcome.', 'welcome', true));
  fireEvent.click(on());
  expect(off().hasAttribute('data-attention')).toBe(false);
  view.rerender(content('Welcome.', 'welcome', false));
  expect(said).toHaveLength(1);
  fireEvent.click(off());
  expect(on().hasAttribute('data-attention')).toBe(false);
});

test('reset reads the first description again and completion stops speech', () => {
  const { voice, said } = fakeVoice();
  const view = render(content('First description.', '0:first'));
  fireEvent.click(on());
  view.rerender(content('First description.', '1:first'));
  expect(said).toHaveLength(2);
  voice.cancel.mockClear();
  view.rerender(content(null, 'complete'));
  expect(voice.cancel).toHaveBeenCalled();
  expect(said).toHaveLength(2);
});

test('an old utterance ending cannot stop the new step', () => {
  const { said } = fakeVoice();
  const view = render(content('First description.'));
  fireEvent.click(on());
  view.rerender(content('Second description.', 'step-2'));
  act(() => {
    said[0]!.dispatchEvent(new Event('end'));
  });
  expect(off().getAttribute('aria-pressed')).toBe('true');
  expect(said.at(-1)!.text).toBe('Second description.');
});

test('blocked autoplay retries the current description after an interaction, never a step already left', () => {
  const { said } = fakeVoice();
  const blocked = () => {
    const error = new Event('error');
    Object.defineProperty(error, 'error', { value: 'not-allowed' });
    act(() => {
      said.at(-1)!.dispatchEvent(error);
    });
  };
  const view = render(content('Welcome.', 'welcome', true));
  blocked();
  fireEvent.pointerDown(window);
  expect(said).toHaveLength(2);
  blocked();
  view.rerender(content('This is the table.', 'board'));
  fireEvent.pointerDown(window);
  expect(said).toHaveLength(2);
});

test('leaving the page or unmounting stops speech without changing the saved preference', () => {
  const { voice } = fakeVoice();
  const view = render(content('Open the controls.'));
  fireEvent.click(on());
  voice.cancel.mockClear();
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  expect(voice.cancel).toHaveBeenCalled();
  expect(off().getAttribute('aria-pressed')).toBe('true');
  voice.cancel.mockClear();
  view.unmount();
  expect(voice.cancel).toHaveBeenCalled();
});

test('blocked storage still allows speaking for the current chapter', () => {
  const { said } = fakeVoice();
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  try {
    render(content('Read this.'));
    fireEvent.click(on());
    expect(said.at(-1)!.text).toBe('Read this.');
    fireEvent.click(off());
    expect(on()).toBeTruthy();
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});

test('where the browser has no voice there is no button', () => {
  render(content('Open the controls.'));
  expect(screen.queryByRole('button')).toBeNull();
});

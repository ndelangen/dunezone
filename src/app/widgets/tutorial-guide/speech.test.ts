import { expect, test } from 'vite-plus/test';

import { englishVoice, speechParts, spokenText } from './speech';

test('key caps are read by their names, and a letter key as that key', () => {
  expect(spokenText('Press {Space}, then {←} twice.')).toBe('Press Space, then left arrow twice.');
  expect(spokenText('Press {H} to open your hand, or {]} to pin it.')).toBe(
    'Press the H key to open your hand, or right bracket to pin it.'
  );
  expect(spokenText('Hold {Alt} and press {Enter}.')).toBe('Hold Alt and press Enter.');
});

const voice = (name: string, lang: string, options: { default?: boolean; localService?: boolean } = {}) =>
  ({ name, lang, default: false, localService: false, ...options }) as SpeechSynthesisVoice;

test("a natural voice is read with over the machine's robotic default", () => {
  const edge = [
    voice('Microsoft David - English (United States)', 'en-US', { default: true, localService: true }),
    voice('Microsoft Zira - English (United States)', 'en-US', { localService: true }),
    voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
  ];
  expect(englishVoice(edge, { language: 'en-US' })?.name).toBe(
    'Microsoft Aria Online (Natural) - English (United States)'
  );

  const chrome = [
    voice('Microsoft David - English (United States)', 'en-US', { default: true, localService: true }),
    voice('Google US English', 'en-US'),
    voice('Google Deutsch', 'de-DE'),
  ];
  expect(englishVoice(chrome)?.name).toBe('Google US English');

  const safari = [
    voice('Samantha', 'en-US', { default: true, localService: true }),
    voice('Ava (Premium)', 'en-US', { localService: true }),
  ];
  expect(englishVoice(safari)?.name).toBe('Ava (Premium)');
});

test("among equal voices the machine's default English voice is kept, and only an English one", () => {
  const firefox = [
    voice('Microsoft Hedda', 'de-DE', { default: true, localService: true }),
    voice('Microsoft Zira', 'en-US', { localService: true }),
    voice('Microsoft David', 'en-US', { default: true, localService: true }),
  ];
  expect(englishVoice(firefox, { language: 'de-DE' })?.name).toBe('Microsoft David');
  expect(englishVoice([voice('Microsoft Hedda', 'de-DE')])).toBeUndefined();
});

test("among natural voices the learner's own accent is read with, and never a child's voice", () => {
  const edge = [
    voice('Microsoft Ana Online (Natural) - English (United States)', 'en-US'),
    voice('Microsoft Natasha Online (Natural) - English (Australia)', 'en-AU'),
    voice('Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB'),
    voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
  ];
  expect(englishVoice(edge, { language: 'en-GB' })?.name).toContain('Libby');
  expect(englishVoice(edge, { language: 'en-US' })?.name).toContain('Aria');
  expect(englishVoice(edge, { language: 'nl-NL' })?.name).toContain('Aria');
});

test('once an online voice has failed, only a voice on the machine is offered', () => {
  const chrome = [
    voice('Microsoft David - English (United States)', 'en-US', { default: true, localService: true }),
    voice('Google US English', 'en-US'),
  ];
  expect(englishVoice(chrome, { localOnly: true })?.name).toBe('Microsoft David - English (United States)');
});

test('a text is read sentence by sentence', () => {
  expect(speechParts('Open your hand. Then pick a card! Ready? Go')).toEqual([
    'Open your hand.',
    'Then pick a card!',
    'Ready?',
    'Go',
  ]);
  expect(speechParts('Pay 1.5 spice, e.g. to Paul. Then wait.')).toEqual([
    'Pay 1.5 spice, e.g. to Paul.',
    'Then wait.',
  ]);
  expect(speechParts('   ')).toEqual([]);
  expect(speechParts('Drag Supplies! cache onto the table. It lands face down.')).toEqual([
    'Drag Supplies! cache onto the table.',
    'It lands face down.',
  ]);
});

test('a long sentence is read in clauses, none longer than an online voice reads', () => {
  const clause = 'the spice blow lands in the desert and every faction may move there';
  const sentence = `${clause}, ${clause}; ${clause}: ${clause}.`;
  const parts = speechParts(sentence);
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.every((part) => part.length <= 180)).toBe(true);
  expect(parts.join(' ')).toBe(sentence);
});

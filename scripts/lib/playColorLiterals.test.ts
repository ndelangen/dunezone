import { expect, test } from 'vite-plus/test';

import { playColorLiterals } from './playColorLiterals';

test('finds colours in JSX, canvas strings and interpolated SVGs, without flagging issue references', () => {
  const source = [
    '/* The ring was discussed in #1234. */',
    '<mesh color="#123456" />;',
    'const shadow = "rgba(0, 0, 0, 0.5)";',
    'const cursor = `<svg stroke="#abc">${shape}</svg>`;',
    'const color = playUiColors.pointerOutline;',
  ].join('\n');
  expect(playColorLiterals('view.tsx', source)).toEqual([
    { line: 2, color: '#123456' },
    { line: 3, color: 'rgba(0' },
    { line: 4, color: '#abc' },
  ]);
});

test('allows CSS variables and relative alpha colours, and preserves line numbers through comments', () => {
  const source = [
    '/* #1234',
    '   is an issue reference. */',
    '.good { color: var(--play-ink); box-shadow: 0 0 3px rgb(from var(--play-black) r g b / .5); }',
    '.bad { background: #fed; border-color: hsl(30 20% 50%); }',
  ].join('\n');
  expect(playColorLiterals('view.css', source)).toEqual([
    { line: 4, color: '#fed' },
    { line: 4, color: 'hsl(3' },
  ]);
});

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { format } from 'oxfmt';

import { coreColors, cssOpacity, cssPalette, cssRecipes, playUiColors } from '../src/shared/uiPalette.ts';

const output = fileURLToPath(new URL('../src/app/styles/palette.generated.css', import.meta.url));
const block = (selector: string, values: Record<string, string>) =>
  `${selector} {\n${Object.entries(values)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')}\n}`;
const playVariables = Object.fromEntries(
  Object.entries(playUiColors).map(([role, value]) => [
    `--play-${role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    value,
  ])
);
const coreVariables = Object.fromEntries(
  Object.entries(coreColors).map(([role, value]) => [
    `--ui-${role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    value,
  ])
);
const source =
  [
    '/* Generated from src/shared/uiPalette.ts by bun run generate:palette. */',
    block(':root', { ...coreVariables, ...cssPalette.base, ...cssOpacity.base, ...cssRecipes, ...playVariables }),
    block(':root[data-mantine-color-scheme="dark"],\n[data-scheme-dark]', { ...cssPalette.dark, ...cssOpacity.dark }),
    block('[data-scheme-paper]', { ...cssPalette.artwork, ...cssOpacity.artwork }),
  ].join('\n\n') + '\n';
const { code } = await format('palette.generated.css', source);
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== code) {
    throw new Error('The generated palette is stale. Run bun run generate:palette.');
  }
  console.log('The CSS palette matches its shared source.');
} else {
  writeFileSync(output, code);
  console.log('Generated src/app/styles/palette.generated.css.');
}

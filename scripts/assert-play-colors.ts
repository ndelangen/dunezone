import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { playColorLiterals } from './lib/playColorLiterals.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const paths = [
  ...files(join(root, 'src/app/routes/_app/play')),
  ...files(join(root, 'src/app/widgets/tabletop')),
  join(root, 'src/app/ui/control/RadialMenu.module.css'),
  join(root, 'src/app/ui/theme.ts'),
  join(root, 'src/app/styles/tokens.css'),
  join(root, 'src/shared/play/setupSupply.ts'),
].filter(
  (path) => /\.(?:tsx?|css)$/.test(path) && !/(?:\.test\.|\.stories|\.fixture\.|storyTransport\.ts$)/.test(path)
);
const findings = paths.flatMap((path) =>
  playColorLiterals(path, readFileSync(path, 'utf8')).map(
    ({ line, color }) => `${relative(root, path)}:${line}: ${color}`
  )
);
if (findings.length) {
  throw new Error(
    `Put UI colours in src/shared/uiPalette.ts and procedural game colours in src/shared/play/assetColors.ts:\n${findings.join('\n')}`
  );
}
console.log('Play colours resolve through the shared palette.');

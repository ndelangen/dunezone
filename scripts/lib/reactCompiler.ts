import { relative } from 'node:path';

import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import type { Logger } from 'babel-plugin-react-compiler';

/**
 * The app, Storybook and browser story tests compile the same application code.
 * Print renderers and the browser-local database runtime stay outside this rollout.
 */
export function reactCompiler() {
  if (process.env.REACT_COMPILER === 'off') {
    return [];
  }

  const logger: Logger = {
    logEvent(filename, event) {
      const file = filename ? relative(process.cwd(), filename) : '<unknown>';
      if (process.env.REACT_COMPILER_DIAGNOSTICS === '1') {
        console.info('[react-compiler]', JSON.stringify({ file, ...event }));
      } else if (event.kind === 'CompileError' || event.kind === 'CompileDiagnostic') {
        console.warn(`[react-compiler] ${file}:${event.fnLoc?.start.line ?? 0}: ${event.detail.reason}`);
      } else if (event.kind === 'PipelineError') {
        console.warn(`[react-compiler] ${file}: ${event.data}`);
      }
    },
  };
  const preset = reactCompilerPreset({ target: '19', logger });
  preset.rolldown.filter = {
    ...preset.rolldown.filter,
    id: {
      include: /\/src\/app\/(?:db|pickers|routes|shell|ui|widgets)\//,
      exclude: [/\/db\/storybook\//, /\.(?:stories|test)\./],
    },
  };
  return babel({ presets: [preset] });
}

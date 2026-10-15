import { readFileSync } from 'node:fs';

/**
 * Reads a JSON file that carries comments, as `.oxlintrc.json` does.
 * Line and block comments outside strings are dropped and the rest goes to `JSON.parse`, so trailing commas still fail loudly.
 */
export function readJsonc(path: string): unknown {
  return JSON.parse(stripComments(readFileSync(path, 'utf8')));
}

/* A string is matched whole first, so comment markers inside it survive; a comment matched on its own is dropped. */
const STRING_OR_COMMENT = /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

export function stripComments(source: string): string {
  return source.replace(STRING_OR_COMMENT, (_match, string: string | undefined) => string ?? '');
}

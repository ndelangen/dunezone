import { readFileSync } from 'node:fs';

/**
 * Reads a JSON file that carries comments, as `.oxlintrc.json` does.
 * Line and block comments outside strings are dropped and the rest goes to `JSON.parse`, so trailing commas still fail loudly.
 */
export function readJsonc(path: string): unknown {
  return JSON.parse(stripComments(readFileSync(path, 'utf8')));
}

export function stripComments(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < source.length && source[index] !== '"') {
        index += source[index] === '\\' ? 2 : 1;
      }
      index += 1;
      out += source.slice(start, index);
    } else if (char === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') {
        index += 1;
      }
    } else if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

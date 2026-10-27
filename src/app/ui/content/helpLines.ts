/**
 * Help as short lines, one thought each, for a (?) or any multiline tooltip, which keep the line breaks.
 * Everywhere else the breaks fold into spaces, so the same words still read as sentences.
 */
export function helpLines(...lines: readonly (string | false | undefined)[]) {
  return lines.filter(Boolean).join('\n');
}

/**
 * The one definition of what counts as an AI tell.
 * Two gates read it: `local/no-ai-tells` in the oxlint plugin, which sees code comments, and
 * `check:prose`, which sees markdown, CSS, YAML, shell and `.oxlintrc.json`.
 *
 * It lives here because the two used to keep their own copies and drifted: the prose half was missing the hedge check for a while, and nothing failed to say so.
 */

export const EM_DASH = '—';

export const CURLY_QUOTES = /[‘’“”]/;

/**
 * Words that say nothing the sentence did not already say.
 * Words with an ordinary technical use are deliberately absent, because a guard that cries wolf gets switched off.
 * The list is quoted nowhere in prose, since both gates read their own source.
 */
export const FILLER =
  /\b(?:simply|seamless(?:ly)?|delves?|crucial(?:ly)?|essentially|basically|holistic|streamlines?|utiliz(?:e|es|ing))\b/i;

export const HEDGE = /\b(?:it (?:is|'s) (?:important|worth) (?:to note|noting)|note that)\b/i;

/* Dingbats, symbols and pictographs. Arrows and typographic marks stay legal. */
export const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

/* A run of rule characters used to draw a band, as in three dashes, a label, three dashes. */
export const DECORATIVE_DIVIDER = /(?:^|\s)[-=*_~]{3,}(?:\s|$)/;

/**
 * Comments whose payload is an instruction to a tool rather than English.
 * The leading `[\s*]*` matters: a block comment's text keeps its asterisks, so a JSDoc-shaped directive would otherwise be read as prose.
 * Only real pragma spellings are listed;
 * a bare word like `type` would swallow any comment that happened to open with it.
 */
export const DIRECTIVE_COMMENT =
  /^[\s*]*(?:oxlint-|eslint-|prettier-ignore|oxfmt-ignore|@ts-|v8 ignore|c8 ignore|istanbul |vitest-environment\b)/;

/**
 * NOTE: This rule is intentionally conservative and only rewrites block comments.
 */

import { CURLY_QUOTES, DECORATIVE_DIVIDER, DIRECTIVE_COMMENT, EM_DASH, EMOJI, FILLER, HEDGE } from './lib/ai-tells.mjs';
const BLOCK_TO_LINE_MESSAGE = 'Prefer normalized block comment formatting.';

const RULE_NAME = 'prefer-block-comments';

const COMMENT_TYPE = 'Block';
const COMMENT_SENTINEL = '*';

const COMMENT_OPEN_MARKER = '/**\n';
const COMMENT_LINE_PREFIX = ' * ';
const COMMENT_CLOSE_MARKER = ' */';

const COMMENT_BODY_START_RE = /^\s*\**\s*/;
const COMMENT_BODY_CONTINUATION_RE = /^\s*\*?\s*/;
const COMMENT_END_RE = /\*\/?$/;
const SENTENCE_BOUNDARY_RE = /([.!?;])\s+/g;
const WHITESPACE_RE = /\s/;
const LOWERCASE_PREFIX_RE = /^[a-z]/;

function getAdjacentNonWhitespace(sourceCode, startIndex, step) {
  for (let cursor = startIndex; cursor >= 0 && cursor < sourceCode.length; cursor += step) {
    const char = sourceCode[cursor];
    if (!WHITESPACE_RE.test(char)) {
      return char;
    }
  }
  return null;
}

function getLinePrefix(sourceCode, commentStart) {
  let lineStart = commentStart;
  while (lineStart > 0 && sourceCode[lineStart - 1] !== '\n') {
    lineStart -= 1;
  }

  let lineEnd = lineStart;
  while (lineEnd < sourceCode.length && sourceCode[lineEnd] !== '\n') {
    lineEnd += 1;
  }

  let prefixEnd = lineStart;
  while (prefixEnd < lineEnd && /[ \t]/.test(sourceCode[prefixEnd])) {
    prefixEnd += 1;
  }

  return {
    prefix: sourceCode.slice(lineStart, prefixEnd),
    lineStart,
    beforeComment: sourceCode.slice(lineStart, commentStart),
  };
}

function normalizeCommentBody(sourceCode, commentStart, commentEnd) {
  return sourceCode
    .slice(commentStart, commentEnd)
    .slice(3, -2)
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line, index) => {
      const normalizedLine = index === 0 ? COMMENT_BODY_START_RE : COMMENT_BODY_CONTINUATION_RE;
      return line.replace(normalizedLine, '').trimEnd();
    })
    .join('\n')
    .trim()
    .replace(COMMENT_END_RE, '');
}

function mergeSentenceFragments(rawLines) {
  const mergedLines = [];
  let mergedLine = '';

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    const continuesPreviousSentence = LOWERCASE_PREFIX_RE.test(line);

    if (line === '') {
      if (mergedLine !== '') {
        mergedLines.push(mergedLine);
        mergedLine = '';
      }
      mergedLines.push('');
      continue;
    }

    if (mergedLine === '') {
      mergedLine = line;
      continue;
    }

    if (continuesPreviousSentence) {
      mergedLine = `${mergedLine} ${line}`;
      continue;
    }

    mergedLines.push(mergedLine);
    mergedLine = line;
  }

  if (mergedLine !== '') {
    mergedLines.push(mergedLine);
  }

  return mergedLines;
}

function splitToSentences(line) {
  return line
    .replace(SENTENCE_BOUNDARY_RE, '$1\n')
    .split('\n')
    .map((sentence) => sentence.trim());
}

function formatComment(prefix, commentSentences) {
  if (commentSentences.length === 0) {
    return `${prefix}${COMMENT_OPEN_MARKER}${prefix}${COMMENT_CLOSE_MARKER}`;
  }

  const formattedLines = commentSentences.map((line) => {
    if (line === '') {
      return `${prefix} *`;
    }
    return `${prefix}${COMMENT_LINE_PREFIX}${line}`;
  });

  return `${prefix}${COMMENT_OPEN_MARKER}${formattedLines.join('\n')}\n${prefix}${COMMENT_CLOSE_MARKER}`;
}

const preferBlockCommentsRule = {
  meta: {
    name: RULE_NAME,
    fixable: 'code',
    messages: {
      preferLine: BLOCK_TO_LINE_MESSAGE,
    },
  },
  create(context) {
    return {
      Program() {
        const sourceCode = context.sourceCode;
        const source = sourceCode.text;
        const comments = sourceCode.ast?.comments ?? [];

        for (const comment of comments) {
          if (comment.type !== COMMENT_TYPE || !String(comment.value).startsWith(COMMENT_SENTINEL)) {
            continue;
          }

          const prev = getAdjacentNonWhitespace(source, comment.range[0] - 1, -1);
          const next = getAdjacentNonWhitespace(source, comment.range[1], 1);

          if (prev === '{' && next === '}') {
            continue;
          }

          if (comment.loc.start.line === comment.loc.end.line) {
            continue;
          }

          const commentStart = comment.range[0];
          const commentEnd = comment.range[1];
          const rawBody = normalizeCommentBody(source, commentStart, commentEnd);
          const { prefix, beforeComment, lineStart } = getLinePrefix(source, commentStart);
          const replacementRangeStart = /^\s+$/.test(beforeComment) ? lineStart : commentStart;

          const mergedLines = mergeSentenceFragments(rawBody.split('\n'));
          const sentences = mergedLines.flatMap(splitToSentences);
          const replacementText = formatComment(prefix, sentences);

          if (replacementText === source.slice(replacementRangeStart, commentEnd)) {
            continue;
          }

          context.report({
            node: comment,
            messageId: 'preferLine',
            loc: comment.loc,
            fix(fixer) {
              return fixer.replaceTextRange([replacementRangeStart, commentEnd], replacementText);
            },
          });
        }
      },
    };
  },
};

const AI_TELLS_RULE_NAME = 'no-ai-tells';

const AI_TELL_CHECKS = [
  { messageId: 'emDash', test: (text) => text.includes(EM_DASH) },
  { messageId: 'curlyQuote', test: (text) => CURLY_QUOTES.test(text) },
  { messageId: 'filler', test: (text) => FILLER.test(text) },
  { messageId: 'hedge', test: (text) => HEDGE.test(text) },
  { messageId: 'emoji', test: (text) => EMOJI.test(text) },
  { messageId: 'divider', test: (text) => DECORATIVE_DIVIDER.test(text) },
];

/**
 * Every messageId a comment's text carries, in the order the checks run.
 * A directive comment carries none: an `oxlint-disable` line is an instruction to a tool, and its payload is not English.
 */
function tellsIn(text) {
  if (DIRECTIVE_COMMENT.test(text)) {
    return [];
  }
  return AI_TELL_CHECKS.filter((check) => check.test(text)).map((check) => check.messageId);
}

/**
 * Keeps AI tells out of code comments.
 * Comments come from the AST rather than a text scan, so a string literal can never be mistaken for prose and product copy stays structurally out of reach.
 */
const noAiTellsRule = {
  meta: {
    name: AI_TELLS_RULE_NAME,
    messages: {
      emDash: 'Em dash in a comment. End the sentence, or use a comma.',
      curlyQuote: 'Curly quote in a comment. Use a straight quote.',
      filler: 'Filler word in a comment. Cut it, or name the mechanism instead.',
      hedge: 'Hedging opener in a comment. State the point.',
      emoji: 'Emoji in a comment. Say it in words.',
      divider: 'Decorative divider in a comment. Let the code mark its own sections.',
    },
  },
  create(context) {
    return {
      Program() {
        const comments = context.sourceCode.ast?.comments ?? [];

        for (const comment of comments) {
          for (const messageId of tellsIn(String(comment.value))) {
            context.report({ node: comment, messageId, loc: comment.loc });
          }
        }
      },
    };
  },
};

export default {
  meta: {
    name: 'local',
  },
  rules: {
    [RULE_NAME]: preferBlockCommentsRule,
    [AI_TELLS_RULE_NAME]: noAiTellsRule,
  },
};

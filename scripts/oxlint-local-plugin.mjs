/**
 * NOTE: This rule is intentionally conservative and only rewrites block comments.
 */

import {
  CURLY_QUOTES,
  DECORATIVE_DIVIDER,
  DIRECTIVE_COMMENT,
  EM_DASH,
  EMOJI,
  FILLER,
  HEDGE,
  stripInlineCode,
} from './lib/ai-tells.mjs';
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
 * Backtick spans come out first, so a comment can name the character it rejects instead of being unable to discuss its own rule.
 */
function tellsIn(text) {
  if (DIRECTIVE_COMMENT.test(text)) {
    return [];
  }
  const prose = stripInlineCode(text);
  return AI_TELL_CHECKS.filter((check) => check.test(prose)).map((check) => check.messageId);
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

const STORY_DESCRIPTION_RULE_NAME = 'no-ai-tells-in-story-descriptions';

/**
 * Whether a node is prose a story writes for its own docs page, rather than words the product says.
 *
 * A `description` key alone does not separate them: a story's `args` carry the component's real props, so `args: { description: 'Every faction published against this ruleset.' }` is the product's copy under test and `argTypes: { children: { description } }` is documentation, and both spell the key identically.
 *
 * What separates them is the branch they hang from.
 * Documentation lives under `docs`, which holds
 * Storybook's nested `description.component` and `.story`, or under `argTypes`, whose descriptions are the controls table's own words.
 * Nothing under `args` is ever documentation.
 */
function underStoryDocumentation(node) {
  let sawDescription = false;
  for (let current = node.parent; current; current = current.parent) {
    if (current.type !== 'Property' || current.computed) {
      continue;
    }
    const key = current.key;
    const name = key?.type === 'Identifier' ? key.name : key?.type === 'Literal' ? key.value : undefined;
    if (name === 'description') {
      sawDescription = true;
    }
    if (sawDescription && (name === 'docs' || name === 'argTypes')) {
      return true;
    }
  }
  return false;
}

/**
 * Keeps AI tells out of the descriptions a story writes for its docs page.
 *
 * `no-ai-tells` deliberately reads comments alone, because a string literal in this repo is usually product copy and a gate that cannot tell the two apart gets switched off.
 * A story's `description` is the exception the gap was named for (#647): it is developer-facing prose that happens to live in a string, so it is guarded by its position in the tree rather than by being a string at all.
 *
 * Scoped to `*.stories.tsx` by the config, and to documentation branches by the walk above.
 * Both halves are load-bearing.
 * Stories carry the product's own words as fixtures, in `AssignPopover.stories.tsx` and `Stats.stories.tsx` among others, and they carry them in `args`, which is a `description` key the rule must not read.
 */
const noAiTellsInStoryDescriptionsRule = {
  meta: {
    name: STORY_DESCRIPTION_RULE_NAME,
    messages: {
      emDash: 'Em dash in a story description. End the sentence, or use a comma.',
      curlyQuote: 'Curly quote in a story description. Use a straight quote.',
      filler: 'Filler word in a story description. Cut it, or name the mechanism instead.',
      hedge: 'Hedging opener in a story description. State the point.',
      emoji: 'Emoji in a story description. Say it in words.',
      divider: 'Decorative divider in a story description. Let the page mark its own sections.',
    },
  },
  create(context) {
    const report = (node, text) => {
      if (!underStoryDocumentation(node)) {
        return;
      }
      const prose = stripInlineCode(String(text));
      for (const check of AI_TELL_CHECKS) {
        if (check.test(prose)) {
          context.report({ node, messageId: check.messageId });
        }
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          report(node, node.value);
        }
      },
      /* A description long enough to wrap is often written as a template literal. */
      TemplateLiteral(node) {
        report(node, node.quasis.map((quasi) => quasi.value.cooked ?? '').join(' '));
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
    [STORY_DESCRIPTION_RULE_NAME]: noAiTellsInStoryDescriptionsRule,
  },
};

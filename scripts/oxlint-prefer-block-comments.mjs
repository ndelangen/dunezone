/**
 * NOTE: This rule is intentionally conservative and only rewrites block comments.
 */
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
    .replace(/\r\n/g, '\n')
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

export default {
  meta: {
    name: 'local',
  },
  rules: {
    [RULE_NAME]: preferBlockCommentsRule,
  },
};

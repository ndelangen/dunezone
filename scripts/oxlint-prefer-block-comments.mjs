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
const SENTENCE_BOUNDARY_RE = /([.!?;])\s+(?=[A-Z])/g;
const WHITESPACE_RE = /\s/;
const LOWERCASE_PREFIX_RE = /^[a-z]/;

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

          let prev = null;
          for (let cursor = comment.range[0] - 1; cursor >= 0; cursor -= 1) {
            const char = source[cursor];
            if (!WHITESPACE_RE.test(char)) {
              prev = char;
              break;
            }
          }

          let next = null;
          for (let cursor = comment.range[1]; cursor < source.length; cursor += 1) {
            const char = source[cursor];
            if (!WHITESPACE_RE.test(char)) {
              next = char;
              break;
            }
          }

          if (prev === '{' && next === '}') {
            continue;
          }

          if (comment.loc.start.line === comment.loc.end.line) {
            continue;
          }

          const commentStart = comment.range[0];
          const commentEnd = comment.range[1];
          const rawBody = source
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

          let lineStart = commentStart;
          while (lineStart > 0 && source[lineStart - 1] !== '\n') {
            lineStart -= 1;
          }

          let lineEnd = lineStart;
          while (lineEnd < source.length && source[lineEnd] !== '\n') {
            lineEnd += 1;
          }

          let prefixEnd = lineStart;
          while (prefixEnd < lineEnd && /[ \t]/.test(source[prefixEnd])) {
            prefixEnd += 1;
          }

          const prefix = source.slice(lineStart, prefixEnd);
          const beforeComment = source.slice(lineStart, commentStart);
          const replacementRangeStart = /^\s+$/.test(beforeComment) ? lineStart : commentStart;

          const mergedLines = [];
          let mergedLine = '';
          for (const rawLine of rawBody.split('\n')) {
            const line = rawLine.trim();
            const startsWithLowercase = LOWERCASE_PREFIX_RE.test(line);

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

            if (startsWithLowercase) {
              mergedLine = `${mergedLine} ${line}`;
              continue;
            }

            mergedLines.push(mergedLine);
            mergedLine = line;
          }

          if (mergedLine !== '') {
            mergedLines.push(mergedLine);
          }

          const sentences = mergedLines.flatMap((line) =>
            line
              .replace(SENTENCE_BOUNDARY_RE, '$1\n')
              .split('\n')
              .map((sentence) => sentence.trim())
          );

          let replacementText = `${prefix}${COMMENT_OPEN_MARKER}${prefix}${COMMENT_CLOSE_MARKER}`;
          if (sentences.length > 0) {
            replacementText = `${prefix}${COMMENT_OPEN_MARKER}${sentences
              .map((line) => `${prefix}${COMMENT_LINE_PREFIX}${line}`)
              .join('\n')}\n${prefix}${COMMENT_CLOSE_MARKER}`;
          }

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

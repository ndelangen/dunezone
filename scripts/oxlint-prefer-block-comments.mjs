/**
 * NOTE: This rule is intentionally conservative and only rewrites block comments.
 */
const BLOCK_TO_LINE_MESSAGE = 'Prefer normalized block comment formatting.';

const sentenceBoundaryPattern = /([.!?;])\s+(?=[A-Z])/g;
const lineSplitPattern = /\r\n/g;

const preferBlockCommentsRule = {
  meta: {
    name: 'prefer-block-comments',
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
          if (comment.type !== 'Block' || !String(comment.value).startsWith('*')) {
            continue;
          }

          let prev = null;
          for (let cursor = comment.range[0] - 1; cursor >= 0; cursor -= 1) {
            const char = source[cursor];
            if (!/\s/.test(char)) {
              prev = char;
              break;
            }
          }

          let next = null;
          for (let cursor = comment.range[1]; cursor < source.length; cursor += 1) {
            const char = source[cursor];
            if (!/\s/.test(char)) {
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
          const fullComment = source.slice(commentStart, commentEnd);
          const rawBody = fullComment
            .slice(3, -2)
            .replace(lineSplitPattern, '\n')
            .split('\n')
            .map((line, index) => {
              if (index === 0) {
                return line.replace(/^\s*\**\s*/, '').trimEnd();
              }
              return line.replace(/^\s*\*?\s*/, '').trimEnd();
            })
            .join('\n')
            .trim()
            .replace(/\*\/?$/, '');

          let lineStart = commentStart;
          while (lineStart > 0 && source[lineStart - 1] !== '\n') {
            lineStart -= 1;
          }

          let lineEnd = lineStart;
          while (lineEnd < source.length && source[lineEnd] !== '\n') {
            lineEnd += 1;
          }

          let prefixEnd = lineStart;
          while (prefixEnd < lineEnd && (source[prefixEnd] === ' ' || source[prefixEnd] === '\t')) {
            prefixEnd += 1;
          }

          const prefix = source.slice(lineStart, prefixEnd);
          const beforeComment = source.slice(lineStart, commentStart);
          const replacementRangeStart = /^\s+$/.test(beforeComment) ? lineStart : commentStart;

          const mergedLines = [];
          let mergedLine = '';
          for (const rawLine of rawBody.split('\n')) {
            const line = rawLine.trim();
            const startsWithLowercase = /^[a-z]/.test(line);

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

          const sentences = mergedLines
            .flatMap((line) => {
              const normalized = line.replace(sentenceBoundaryPattern, '$1\n');
              return normalized.split('\n').map((line) => line.trim());
            });

          let replacementText = `${prefix}/**\n${prefix} */`;
          if (sentences.length > 0) {
            replacementText = `${prefix}/**\n${sentences.map((line) => `${prefix} * ${line}`).join('\n')}\n${prefix} */`;
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
    'prefer-block-comments': preferBlockCommentsRule,
  },
};

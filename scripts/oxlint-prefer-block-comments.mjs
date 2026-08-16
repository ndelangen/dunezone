/**
 * NOTE: This rule is intentionally conservative and only rewrites block comments.
 */
const BLOCK_TO_LINE_MESSAGE = "Prefer normalized block comment formatting.";

const sentenceBoundaryPattern = /([.!?;])\s+(?=[A-Z])/g;

const lineSplitPattern = /\r\n/g;

function getLineStart(source, index) {
  const previousLineBreak = source.lastIndexOf("\n", index - 1);
  return previousLineBreak === -1 ? 0 : previousLineBreak + 1;
}

function getLineEnd(source, startIndex) {
  const nextLineBreak = source.indexOf("\n", startIndex);
  return nextLineBreak === -1 ? source.length : nextLineBreak;
}

function getLineText(source, lineStart) {
  return source.slice(lineStart, getLineEnd(source, lineStart));
}

function getPreviousNonWhitespaceChar(source, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = source[cursor];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return null;
}

function getNextNonWhitespaceChar(source, index) {
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return null;
}

function getCommentIndent(source, comment) {
  const commentLineStart = getLineStart(source, comment.range[0]);
  const commentLine = getLineText(source, commentLineStart);
  return (commentLine.match(/^\s*/) || [""])[0];
}

function getCommentReplacementRange(source, comment, lineStart) {
  const beforeComment = source.slice(lineStart, comment.range[0]);
  const canTrimLineIndent = /^\s+$/.test(beforeComment);
  return canTrimLineIndent ? lineStart : comment.range[0];
}

function isJsxComment(source, comment) {
  const prev = getPreviousNonWhitespaceChar(source, comment.range[0]);
  const next = getNextNonWhitespaceChar(source, comment.range[1]);
  return prev === "{" && next === "}";
}

function cleanCommentBody(raw) {
  const lines = raw.replace(lineSplitPattern, "\n").split("\n");
  const normalized = lines.map((line, index) => {
    if (index === 0) {
      return line.replace(/^\s*\**\s*/, "").trimEnd();
    }
    return line.replace(/^\s*\*?\s*/, "").trimEnd();
  });
  return normalized.join("\n").trim().replace(/\*\/?$/, "");
}

function mergeWrappedLines(lines) {
  const merged = [];
  let buffer = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const startsWithLowercase = /^[a-z]/.test(line);

    if (line === "") {
      if (buffer !== "") {
        merged.push(buffer);
        buffer = "";
      }
      merged.push("");
      continue;
    }

    if (buffer === "") {
      buffer = line;
      continue;
    }

    if (startsWithLowercase) {
      buffer = `${buffer} ${line}`;
      continue;
    }

    merged.push(buffer);
    buffer = line;
  }

  if (buffer !== "") {
    merged.push(buffer);
  }

  return merged;
}

function splitSentences(content) {
  return mergeWrappedLines(content.split("\n")).flatMap((line) => {
    const normalized = line.replace(sentenceBoundaryPattern, "$1\n");
    return normalized.split("\n").map((line) => line.trim());
  });
}

function formatBlock(prefix, rawCommentBody) {
  const sentences = splitSentences(rawCommentBody);
  if (!sentences.length) {
    return `${prefix}/**\n${prefix} */`;
  }
  const middle = sentences.map((line) => `${prefix} * ${line}`).join("\n");
  return `${prefix}/**\n${middle}\n${prefix} */`;
}

function buildReplacement(source, comment) {
  const fullComment = source.slice(comment.range[0], comment.range[1]);
  const prefix = getCommentIndent(source, comment);
  const body = cleanCommentBody(fullComment.slice(3, -2));
  const isSingleLine = comment.loc.start.line === comment.loc.end.line;
  if (isSingleLine) {
    return null;
  }
  const lineStart = getLineStart(source, comment.range[0]);
  const replacementRangeStart = getCommentReplacementRange(source, comment, lineStart);

  if (!body.trim()) {
    return {
      range: [replacementRangeStart, comment.range[1]],
      text: `${prefix}/**\n${prefix} */`,
    };
  }

  return {
    range: [replacementRangeStart, comment.range[1]],
    text: formatBlock(prefix, body),
  };
}

const preferBlockCommentsRule = {
  meta: {
    name: "prefer-block-comments",
    fixable: "code",
    messages: {
      preferLine: BLOCK_TO_LINE_MESSAGE,
    },
  },
  create(context) {
    return {
      Program() {
        const sourceCode = context.sourceCode;
        const source = sourceCode.text;
        const comments = sourceCode.ast && sourceCode.ast.comments ? sourceCode.ast.comments : [];
        const candidates = comments.filter(
          (comment) =>
            comment.type === "Block" &&
            String(comment.value).startsWith("*") &&
            !isJsxComment(source, comment)
        );

        for (const comment of candidates) {
          const replacement = buildReplacement(source, comment);
          if (!replacement) {
            continue;
          }
          const existing = source.slice(replacement.range[0], replacement.range[1]);
          if (replacement.text === existing) {
            continue;
          }

          context.report({
            node: comment,
            messageId: "preferLine",
            loc: comment.loc,
            fix(fixer) {
              return fixer.replaceTextRange(replacement.range, replacement.text);
            },
          });
        }
      },
    };
  },
};

const plugin = {
  meta: {
    name: "local",
  },
  rules: {
    "prefer-block-comments": preferBlockCommentsRule,
    "sentence-boundary-comments": preferBlockCommentsRule,
  },
};

export default plugin;

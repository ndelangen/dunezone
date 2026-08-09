/**
 * Local oxlint JS plugin: multi-line comments must be block comments, not stacked `//` lines (the
 * repo comment convention; see PR #333). Loaded via `jsPlugins` in .oxlintrc.json — requires
 * oxlint's ESLint-compatible plugin support (alpha).
 *
 * @see https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 */

/* Directive-ish lines are exempt: merging them into a block comment would break
   the tooling that reads them. Triple-slash (`/ <reference`) and shebang-style
   (`!`) values are excluded by prefix. */
const DIRECTIVE =
  /^(\/|!|\s*(eslint|oxlint|prettier-ignore|biome-ignore|@ts-|ts-|v8 ignore|c8 ignore|istanbul ignore|#region|#endregion|@vitest-environment))/;

const preferBlockComments = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Require block comments for comments spanning multiple lines',
    },
    messages: {
      stacked:
        'Multi-line comments use a block comment (/* … */ or /** … */), not stacked // lines.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        const lines = sourceCode.lines;
        // Own-line comment: nothing but whitespace before it on its line.
        const ownLine = (c) =>
          lines[c.loc.start.line - 1].slice(0, c.loc.start.column).trim() === '';
        let run = [];
        const flush = () => {
          if (run.length >= 2) {
            context.report({
              loc: { start: run[0].loc.start, end: run[run.length - 1].loc.end },
              messageId: 'stacked',
            });
          }
          run = [];
        };
        for (const comment of sourceCode.getAllComments()) {
          const chainable =
            comment.type === 'Line' && !DIRECTIVE.test(comment.value) && ownLine(comment);
          if (!chainable) {
            flush();
            continue;
          }
          const previous = run[run.length - 1];
          if (previous && comment.loc.start.line === previous.loc.end.line + 1) {
            run.push(comment);
          } else {
            flush();
            run.push(comment);
          }
        }
        flush();
      },
    };
  },
};

export default {
  meta: { name: 'local' },
  rules: { 'prefer-block-comments': preferBlockComments },
};

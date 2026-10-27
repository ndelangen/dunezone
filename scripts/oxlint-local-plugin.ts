import type { RuleTester } from 'vite-plus/lint/plugins-dev';

type BaseRule = Parameters<RuleTester['run']>[1];
type Rule = BaseRule & { meta: NonNullable<BaseRule['meta']> & { name: string } };
type Listener = ReturnType<NonNullable<Rule['create']>>;
type LintNode = NonNullable<Parameters<NonNullable<Listener['Identifier']>>[0]['parent']>;

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
} from './lib/ai-tells.ts';
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

function getAdjacentNonWhitespace(sourceCode: string, startIndex: number, step: number) {
  for (let cursor = startIndex; cursor >= 0 && cursor < sourceCode.length; cursor += step) {
    const char = sourceCode[cursor];
    if (!WHITESPACE_RE.test(char)) {
      return char;
    }
  }
  return null;
}

function getLinePrefix(sourceCode: string, commentStart: number) {
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

function normalizeCommentBody(sourceCode: string, commentStart: number, commentEnd: number) {
  const raw = sourceCode.slice(commentStart, commentEnd);
  /* Only a closer written with a doubled star leaves a stray one; a body that itself ends in a star, such as a recursive glob, keeps it. */
  const body = raw
    .slice(3, -2)
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line, index) => {
      const normalizedLine = index === 0 ? COMMENT_BODY_START_RE : COMMENT_BODY_CONTINUATION_RE;
      return line.replace(normalizedLine, '').trimEnd();
    })
    .join('\n')
    .trim();
  return raw.endsWith('**/') ? body.replace(COMMENT_END_RE, '') : body;
}

function mergeSentenceFragments(rawLines: string[]) {
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

function splitToSentences(line: string) {
  return line
    .replace(SENTENCE_BOUNDARY_RE, '$1\n')
    .split('\n')
    .map((sentence) => sentence.trim());
}

function formatComment(prefix: string, commentSentences: string[]) {
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

const preferBlockCommentsRule: Rule = {
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
  { messageId: 'emDash', test: (text: string) => text.includes(EM_DASH) },
  { messageId: 'curlyQuote', test: (text: string) => CURLY_QUOTES.test(text) },
  { messageId: 'filler', test: (text: string) => FILLER.test(text) },
  { messageId: 'hedge', test: (text: string) => HEDGE.test(text) },
  { messageId: 'emoji', test: (text: string) => EMOJI.test(text) },
  { messageId: 'divider', test: (text: string) => DECORATIVE_DIVIDER.test(text) },
];

/**
 * Every messageId a comment's text carries, in the order the checks run.
 * A directive comment carries none: an `oxlint-disable` line is an instruction to a tool, and its payload is not English.
 * Backtick spans come out first, so a comment can name the character it rejects instead of being unable to discuss its own rule.
 */
function tellsIn(text: string) {
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
const noAiTellsRule: Rule = {
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
function underStoryDocumentation(node: LintNode) {
  let sawDescription = false;
  for (let current: LintNode | null = node.parent; current; current = current.parent) {
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
const noAiTellsInStoryDescriptionsRule: Rule = {
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
    const report = (node: LintNode, text: string) => {
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

const WALL_CLOCK_RULE_NAME = 'no-wall-clock';

/**
 * Keeps the player's wall clock out of the code it is enabled for.
 * The built-in `no-restricted-properties` can ban `Date.now`, but no built-in rule can ban `new Date()` by its argument count, so one local rule covers every spelling.
 * `performance.now` stays legal: it measures local elapsed time and never claims to be the server's time.
 */
const noWallClockRule: Rule = {
  meta: {
    name: WALL_CLOCK_RULE_NAME,
    messages: {
      wallClock:
        "The player's wall clock is not the table's. Read server time through `useServerNow`, or measure a Worker duration on `monotonicNow`.",
    },
  },
  create(context) {
    const isDate = (node: LintNode) => node.type === 'Identifier' && node.name === 'Date';
    return {
      MemberExpression(node) {
        if (isDate(node.object) && !node.computed && node.property.name === 'now') {
          context.report({ node, messageId: 'wallClock' });
        }
      },
      NewExpression(node) {
        if (isDate(node.callee) && node.arguments.length === 0) {
          context.report({ node, messageId: 'wallClock' });
        }
      },
      /* `Date()` without `new` returns the current time as a string. */
      CallExpression(node) {
        if (isDate(node.callee)) {
          context.report({ node, messageId: 'wallClock' });
        }
      },
    };
  },
};

const SHARED_OVERLAYS_RULE_NAME = 'shared-overlays';

const ALTERNATIVE_OVERLAYS =
  /^(?:@radix-ui\/react-(?:tooltip|popover|hover-card)|@tippyjs\/react|tippy\.js|react-tooltip)(?:\/|$)/;

/** Keeps hover hints and floating panes on Mantine's shared theme. */
const sharedOverlaysRule: Rule = {
  meta: {
    name: SHARED_OVERLAYS_RULE_NAME,
    messages: {
      sharedOverlay: 'Use Tooltip, Popover or HoverCard from @mantine/core under the app theme.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (ALTERNATIVE_OVERLAYS.test(String(node.source.value))) {
          context.report({ node, messageId: 'sharedOverlay' });
        }
      },
    };
  },
};

const TITLE_TOOLTIP_RULE_NAME = 'no-title-tooltip';

/* Libraries whose components forward an unknown `title` straight to the element they render. */
const FORWARDING_SOURCES = new Set(['@mantine/core', '@tanstack/react-router']);

/* Mantine components whose `title` is their own heading, rendered as content rather than as an attribute. */
const MANTINE_HEADINGS = new Set([
  'Alert',
  'Drawer',
  'Modal',
  'Notification',
  'EmptyState',
  'Timeline.Item',
  'Tour.Step',
]);

/* Attributes that carry a tooltip's words to a CSS `::after`, a second tooltip look beside the kit's (#2550). */
const HAND_ROLLED_TIPS = new Set(['data-tip', 'data-tooltip']);

/**
 * Keeps the browser's own tooltip out of the app (Norbert, 2026-10-26: native tooltips look out of place).
 * A `title` attribute on an element, or on a library component that passes it through to one, draws that tooltip;
 * the kit's Mantine `Tooltip` is the one hover label.
 * An `iframe` keeps its `title`, because that names the frame for assistive technology and draws no tooltip.
 * The SVG `<title>` element is a child, not an attribute, so the rule never sees it.
 * A hand-rolled tooltip, its words in `data-tip` or `data-tooltip` for a CSS `::after` to draw, looks unlike the kit too and is reported the same way.
 */
const noTitleTooltipRule: Rule = {
  meta: {
    name: TITLE_TOOLTIP_RULE_NAME,
    messages: {
      titleTooltip:
        "A `title` attribute draws the browser's native tooltip. Use Mantine Tooltip for app hover text, or an accessible name or description for standalone metadata.",
      handRolledTooltip:
        'A `data-tip` or `data-tooltip` attribute feeds a hand-rolled CSS tooltip that looks unlike the kit. Wrap the element in the kit `Tooltip` instead.',
    },
  },
  create(context) {
    /* Each local name bound to a forwarding library, mapped to the name the library exports; a namespace import maps to `*`. */
    const forwarding = new Map<string, string>();
    const nameOf = (node: LintNode): string | undefined => {
      if (node.type === 'JSXIdentifier') {
        return node.name;
      }
      if (node.type === 'JSXMemberExpression') {
        const object = nameOf(node.object);
        return object === undefined ? undefined : `${object}.${node.property.name}`;
      }
      return undefined;
    };
    return {
      ImportDeclaration(node) {
        if (!FORWARDING_SOURCES.has(String(node.source.value))) {
          return;
        }
        for (const specifier of node.specifiers) {
          const imported =
            specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.type === 'ImportNamespaceSpecifier'
                ? '*'
                : specifier.local.name;
          forwarding.set(specifier.local.name, imported);
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') {
          return;
        }
        if (HAND_ROLLED_TIPS.has(node.name.name)) {
          context.report({ node, messageId: 'handRolledTooltip' });
          return;
        }
        if (node.name.name !== 'title') {
          return;
        }
        const element = node.parent;
        if (element.type !== 'JSXOpeningElement') {
          return;
        }
        const name = nameOf(element.name);
        if (name === undefined || name === 'iframe') {
          return;
        }
        const [local, ...members] = name.split('.');
        const imported = forwarding.get(local);
        /* The library's own name for the component, so an alias or a namespace import meets the heading list as the library spells it. */
        const libraryName = imported === '*' ? members.join('.') : [imported, ...members].join('.');
        const intrinsic = /^[a-z]/.test(name) && members.length === 0;
        const passedThrough = imported !== undefined && !MANTINE_HEADINGS.has(libraryName);
        if (intrinsic || passedThrough) {
          context.report({ node, messageId: 'titleTooltip' });
        }
      },
    };
  },
};

const TOOLTIP_LENGTH_RULE_NAME = 'tooltip-length';

/* The props whose words show in a tooltip: the kit Tooltip's label, the (?)'s text, and a ControlBlock's description, which its (?) shows. */
const TOOLTIP_PROPS: Readonly<Record<string, string>> = {
  Tooltip: 'label',
  HelpMark: 'text',
  ControlBlock: 'description',
};
const TOOLTIP_LINE_MAX = 100;

/* The most renderings a value is followed through: a tooltip with many branches keeps its longest ones. */
const TOOLTIP_RENDERINGS_MAX = 32;

type TextNode = { type?: string; value?: unknown; [key: string]: unknown };

/* The renderings of two parts shown one after the other: each rendering of the first followed by each of the second. */
function followedBy(first: string[], second: string[]): string[] {
  const joined = first.flatMap((head) => second.map((tail) => head + tail));
  return joined.length > TOOLTIP_RENDERINGS_MAX
    ? joined.sort((a, b) => b.length - a.length).slice(0, TOOLTIP_RENDERINGS_MAX)
    : joined;
}

/* The module's own constants by name, so help kept in a constant beside the component is read like help written in place. */
type Constants = ReadonlyMap<string, unknown>;

/* The renderings of children shown in a row, as a fragment or an element shows its children. */
function inRow(children: unknown, constants: Constants, depth: number): string[] {
  return (Array.isArray(children) ? children : []).reduce<string[]>(
    (renderings, child) => followedBy(renderings, writtenText(child, constants, depth)),
    ['']
  );
}

function isHelpLines(callee: unknown) {
  const node = callee as TextNode | undefined;
  return node?.type === 'Identifier' && node.name === 'helpLines';
}

function isLineBreak(opening: unknown) {
  const name = (opening as { name?: TextNode } | undefined)?.name;
  return name?.type === 'JSXIdentifier' && name.name === 'br';
}

/**
 * The words a prop's value can show, one string per way it can render: static text in a row is joined, as the tooltip shows it, and each branch of a condition is its own rendering.
 * A constant of the same module is followed to its value;
 * what the rule cannot read, such as an import, a parameter or a call other than helpLines, shows as nothing, so help imported from another module is guarded by that module's own tests (as `panelGuidance.test.ts` guards Play's window help).
 */
function writtenText(node: unknown, constants: Constants, depth = 0): string[] {
  if (!node || typeof node !== 'object' || depth > 8) {
    return [''];
  }
  const current = node as TextNode;
  const next = (child: unknown) => writtenText(child, constants, depth + 1);
  switch (current.type) {
    case 'Identifier':
      return constants.has(String(current.name)) ? next(constants.get(String(current.name))) : [''];
    case 'JSXText':
      /* JSX folds its source line breaks into spaces, so its text shows as one line. */
      return [typeof current.value === 'string' ? current.value.replace(/\s+/g, ' ') : ''];
    case 'Literal':
      return [typeof current.value === 'string' ? current.value : ''];
    case 'TemplateLiteral':
      /* Each part of the template in turn, the values between them read like any other value. */
      return (current.quasis as { value?: { cooked?: string } }[]).reduce<string[]>(
        (renderings, quasi, index) =>
          followedBy(
            index === 0 ? renderings : followedBy(renderings, next((current.expressions as unknown[])[index - 1])),
            [quasi.value?.cooked ?? '']
          ),
        ['']
      );
    case 'JSXExpressionContainer':
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
      return next(current.expression);
    case 'BinaryExpression':
      return current.operator === '+' ? followedBy(next(current.left), next(current.right)) : [''];
    case 'ConditionalExpression':
      return [...next(current.consequent), ...next(current.alternate)];
    case 'LogicalExpression':
      return [...next(current.left), ...next(current.right)];
    case 'ArrayExpression':
      return inRow(current.elements, constants, depth + 1);
    /* The kit's helpLines shows its parts one per line. */
    case 'CallExpression':
      return isHelpLines(current.callee)
        ? (current.arguments as unknown[]).reduce<string[]>(
            (renderings, part, index) =>
              followedBy(index === 0 ? renderings : followedBy(renderings, ['\n']), next(part)),
            ['']
          )
        : [''];
    /* An element's own attributes, such as a link's address, are not words the tooltip shows; its children are. A <br /> breaks the line. */
    case 'JSXElement':
      return isLineBreak(current.openingElement) ? ['\n'] : inRow(current.children, constants, depth + 1);
    case 'JSXFragment':
      return inRow(current.children, constants, depth + 1);
    default:
      return [''];
  }
}

/* Every line a prop's value can show: each rendering split at its line breaks. */
function writtenLines(node: unknown, constants: Constants): string[] {
  return writtenText(node, constants).flatMap((rendering) => rendering.split('\n'));
}

/**
 * Keeps tooltips readable (Norbert, 2026-10-27: a wall of text without breaks helps nobody).
 * Each line of words written into a tooltip stays within 100 characters;
 * longer help is cut down, or broken into lines with `\n`, which the (?) keeps as line breaks.
 */
const tooltipLengthRule: Rule = {
  meta: {
    name: TOOLTIP_LENGTH_RULE_NAME,
    messages: {
      tooLong: `A tooltip line runs past ${TOOLTIP_LINE_MAX} characters. Cut what the UI already says, and break the rest into short lines with \\n (a Tooltip keeps them when it is multiline; a HelpMark always does).`,
    },
  },
  create(context) {
    const constants = new Map<string, unknown>();
    return {
      /* The module's top-level constants, exported or not, gathered before any attribute is read. */
      Program(program) {
        const declarators = program.body.flatMap((statement) => {
          const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
          return declaration?.type === 'VariableDeclaration' && declaration.kind === 'const'
            ? declaration.declarations
            : [];
        });
        for (const declarator of declarators) {
          if (declarator.id.type === 'Identifier' && declarator.init) {
            constants.set(declarator.id.name, declarator.init);
          }
        }
      },
      JSXAttribute(node) {
        const element = node.parent;
        if (
          node.name.type !== 'JSXIdentifier' ||
          element.type !== 'JSXOpeningElement' ||
          element.name.type !== 'JSXIdentifier'
        ) {
          return;
        }
        if (TOOLTIP_PROPS[element.name.name] !== node.name.name) {
          return;
        }
        if (
          writtenLines(node.value, constants).some((line) => line.trim().replace(/\s+/g, ' ').length > TOOLTIP_LINE_MAX)
        ) {
          context.report({ node, messageId: 'tooLong' });
        }
      },
    };
  },
};

const STORY_OWNERSHIP_RULE_NAME = 'story-owns-its-states';

/* Every Testing Library query that can reach a role: the tooltip is reached by any of them. */
const ROLE_QUERY = /^(?:get|query|find)(?:All)?ByRole$/;

/**
 * A story shows only the states its own component owns (ADR-0005).
 * A tooltip opening on hover and closing on leave is the kit's state, covered by the kit's own stories, so a story above the kit neither hovers nor reads a tooltip.
 * The words a composed component puts in a tooltip are still its own: it asserts them where the kit publishes them, as the control's accessible name or description.
 * The files glob in `.oxlintrc.json` keeps the kit and the stories that predate the rule out of scope.
 */
const storyOwnsItsStatesRule: Rule = {
  meta: {
    name: STORY_OWNERSHIP_RULE_NAME,
    messages: {
      hover:
        "Hovering drives a kit component's own state, which its own stories cover. Assert the words through the control's accessible name or description instead (ADR-0005).",
      tooltip:
        "An open tooltip is the kit's state, which its own stories cover. Assert the words through the control's accessible name or description instead (ADR-0005).",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') {
          return;
        }
        const method = callee.property.name;
        if (method === 'hover' || method === 'unhover') {
          if (callee.object.type === 'Identifier' && callee.object.name === 'userEvent') {
            context.report({ node, messageId: 'hover' });
          }
          return;
        }
        const [role] = node.arguments;
        if (ROLE_QUERY.test(method) && role?.type === 'Literal' && role.value === 'tooltip') {
          context.report({ node, messageId: 'tooltip' });
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
    [STORY_DESCRIPTION_RULE_NAME]: noAiTellsInStoryDescriptionsRule,
    [WALL_CLOCK_RULE_NAME]: noWallClockRule,
    [TITLE_TOOLTIP_RULE_NAME]: noTitleTooltipRule,
    [SHARED_OVERLAYS_RULE_NAME]: sharedOverlaysRule,
    [TOOLTIP_LENGTH_RULE_NAME]: tooltipLengthRule,
    [STORY_OWNERSHIP_RULE_NAME]: storyOwnsItsStatesRule,
  },
};

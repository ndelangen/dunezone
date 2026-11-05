/*
 * The rules a bot can look up while it plays: a ruleset's published Rulebooks as plain text, split into sections it can
 * search and read one at a time. Reading only the section it needs keeps each wake small; the whole book never goes into a prompt.
 */

type Page = {
  title?: string;
  anchor?: string;
  blockOrderByRegion?: Record<string, string[]>;
  blocksById?: Record<string, unknown>;
};
export type RulebookContents = { pageOrder?: string[]; pagesById?: Record<string, Page> };

/* Fields that hold words a reader sees; ids, layout and styling are left out. */
const PROSE_KEYS = new Set(['title', 'text', 'body', 'caption', 'content', 'label', 'description', 'note', 'heading', 'term', 'definition']);

function prose(value: unknown, out: string[]) {
  if (typeof value === 'string') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => prose(entry, out));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  const record = value as Record<string, unknown>;
  /* An ordered container lists its children by id; read them in that order. */
  const orderKey = Object.keys(record).find((key) => key.endsWith('Order') && Array.isArray(record[key]));
  const byIdKey = Object.keys(record).find((key) => key.endsWith('ById'));
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string' && PROSE_KEYS.has(key) && entry.trim() && !/^[A-Z0-9]{4}$/u.test(entry)) {
      out.push(entry.trim());
    } else if (key !== byIdKey && key !== orderKey && typeof entry === 'object') {
      prose(entry, out);
    }
  }
  if (orderKey && byIdKey) {
    const children = record[byIdKey] as Record<string, unknown>;
    for (const id of record[orderKey] as string[]) {
      prose(children[id], out);
    }
  }
}

type Table = {
  columnOrder?: string[];
  columnsById?: Record<string, { label?: string }>;
  rowOrder?: string[];
  rowsById?: Record<string, { cellsByColumnId?: Record<string, string> }>;
  note?: string;
};

/* A reference table as a Markdown table, which is the most compact form a model reads reliably. */
function tableText(table: Table): string {
  const columns = table.columnOrder ?? [];
  const cell = (value: string | undefined) => (value ?? '').replaceAll('|', '/').replaceAll(/\s+/gu, ' ').trim();
  const lines = [
    `| ${columns.map((id) => cell(table.columnsById?.[id]?.label)).join(' | ')} |`,
    `|${columns.map(() => ' --- |').join('')}`,
    ...(table.rowOrder ?? []).map(
      (id) => `| ${columns.map((column) => cell(table.rowsById?.[id]?.cellsByColumnId?.[column])).join(' | ')} |`
    ),
  ];
  if (table.note?.trim()) {
    lines.push('', table.note.trim());
  }
  return lines.join('\n');
}

function blockText(block: unknown): string {
  const kind = (block as { kind?: string }).kind;
  const title = (block as { title?: string }).title;
  if (kind === 'section-heading' && title) {
    return `### ${title}`;
  }
  if (kind === 'reference-table') {
    return tableText(block as Table);
  }
  if (kind === 'callout') {
    const text = (block as { text?: string }).text?.trim() ?? '';
    return `> ${title ? `**${title}.** ` : ''}${text}`.trimEnd();
  }
  const lines: string[] = [];
  prose(block, lines);
  if (kind === 'list') {
    return lines.map((line) => `- ${line}`).join('\n');
  }
  return lines.join('\n');
}

/** A Rulebook Edition's Contents as Markdown: each page a `##` section, its section headings `###`. */
export function rulebookMarkdown(name: string, contents: RulebookContents): string {
  const lines = [`# ${name}`];
  for (const id of contents.pageOrder ?? []) {
    const page = contents.pagesById?.[id];
    if (!page) {
      continue;
    }
    const blocks = Object.values(page.blockOrderByRegion ?? {})
      .flat()
      .map((blockId) => blockText(page.blocksById?.[blockId] ?? {}))
      .filter(Boolean);
    if (!blocks.length) {
      continue;
    }
    /* The page's anchor is kept, so a bot can read a section by it and cite it, as the site's links do (#traitors). */
    lines.push('', `## ${page.title ?? page.anchor ?? id}${page.anchor ? ` {#${page.anchor}}` : ''}`, '', ...blocks);
  }
  return lines.join('\n');
}

export type RulebookSection = { title: string; anchor?: string; path: string; text: string };

/** Splits Markdown into its `##` and `###` sections, each with the headings above it as its path. */
export function rulebookSections(markdown: string): RulebookSection[] {
  const sections: RulebookSection[] = [];
  let book = '';
  let page = '';
  let current: RulebookSection | null = null;
  for (const line of markdown.split('\n')) {
    const heading = /^(#{1,3}) (.+)$/u.exec(line);
    if (heading) {
      const [, marks, raw] = heading as unknown as [string, string, string];
      const anchored = /^(.*?) \{#([\w-]+)\}$/u.exec(raw);
      const title = anchored?.[1] ?? raw;
      const anchor = anchored?.[2];
      if (marks.length === 1) {
        book = title;
        continue;
      }
      if (marks.length === 2) {
        page = title;
      }
      current = {
        title,
        ...(anchor ? { anchor } : {}),
        path: [book, marks.length === 3 ? page : ''].filter(Boolean).join(' › '),
        text: '',
      };
      sections.push(current);
      continue;
    }
    if (current && line.trim()) {
      current.text += `${line}\n`;
    }
  }
  return sections.filter((section) => section.text.trim());
}

/* A section's heading as the bot sees it, with its anchor to read or cite it by. */
const label = (section: RulebookSection) =>
  `${section.path ? `${section.path} › ` : ''}${section.title}${section.anchor ? ` (#${section.anchor})` : ''}`;

const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9']+/gu) ?? [];

export class Rulebook {
  readonly sections: RulebookSection[];
  constructor(markdown: string) {
    this.sections = rulebookSections(markdown);
  }

  get empty() {
    return this.sections.length === 0;
  }

  /** The section titles, as a table of contents to search or read from. */
  contents(): string {
    return this.sections.map((section) => `- ${label(section)}`).join('\n');
  }

  /** The sections that best match the words, most first, cut to `limit` characters in all. */
  search(query: string, limit = 2400): string {
    const wanted = [...new Set(words(query))].filter((word) => word.length > 2);
    if (!wanted.length) {
      return 'Search with a few words, such as "traitor setup" or "karama".';
    }
    const scored = this.sections
      .map((section) => {
        const title = words(section.title);
        const body = words(section.text);
        const score = wanted.reduce(
          (sum, word) =>
            sum + (title.includes(word) ? 5 : 0) + body.filter((entry) => entry.startsWith(word)).length,
          0
        );
        return { section, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) {
      return `Nothing in the rulebook matches "${query}". Call \`rulebook\` without a query for its sections.`;
    }
    let left = limit;
    const out: string[] = [];
    for (const { section } of scored) {
      if (left <= 200) {
        break;
      }
      const text = section.text.length > left ? `${section.text.slice(0, left)}… (more: read the section)` : section.text;
      out.push(`## ${label(section)}\n${text.trim()}`);
      left -= text.length;
    }
    return out.join('\n\n');
  }

  /** One section in full, found by its anchor (with or without #) or its title. */
  read(title: string): string {
    const wanted = title.trim().toLowerCase();
    const section =
      this.sections.find((entry) => entry.anchor && `#${entry.anchor}` === `#${wanted.replace(/^#/u, '')}`) ??
      this.sections.find((entry) => entry.title.toLowerCase() === wanted) ??
      this.sections.find((entry) => entry.title.toLowerCase().includes(wanted));
    return section
      ? `## ${label(section)}\n${section.text.trim()}`
      : `No section called "${title}". Call \`rulebook\` without arguments for the sections.`;
  }
}

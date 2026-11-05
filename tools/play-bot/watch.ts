/*
 * A live page of what every bot is doing while a game runs: one column per bot with what woke it, each tool it called,
 * what it concluded, how long it thought and what that cost in tokens. It reads the event log each bot writes
 * (events.jsonl beside its transcript) and changes nothing.
 *
 *   bun run play:bot:watch                  # every bot under tools/play-bot/out/bots, at http://127.0.0.1:4747
 *   bun run play:bot:watch -- --dir <dir>   # another folder, such as a demo's out/three-player-<stamp>
 *
 * A bot's private notes stay hidden unless you tick "Show private notes", so a recording does not give its plans away.
 * The page listens on this machine only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: path.join(import.meta.dirname, 'out/bots') },
    port: { type: 'string', default: '4747' },
  },
});
const root = path.resolve(values.dir!);
const MAX_EVENTS = 400;

/** Each folder under the root (and the root itself) that holds an events.jsonl, as one bot. */
function botFolders(): string[] {
  const found: string[] = [];
  const visit = (directory: string, depth: number) => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    if (entries.includes('events.jsonl')) {
      found.push(directory);
    }
    if (depth < 2) {
      for (const entry of entries) {
        const child = path.join(directory, entry);
        if (statSync(child, { throwIfNoEntry: false })?.isDirectory()) {
          visit(child, depth + 1);
        }
      }
    }
  };
  visit(root, 0);
  return found.sort();
}

function readEvents(folder: string) {
  const lines = readFileSync(path.join(folder, 'events.jsonl'), 'utf8').trim().split('\n').slice(-MAX_EVENTS);
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

/** The bot's newest notes file, read only when the page asks for notes. */
function readNotes(folder: string): string {
  const notes = readdirSync(folder)
    .filter((name) => /^notes.*\.md$/u.test(name))
    .map((name) => ({ name, at: statSync(path.join(folder, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0];
  return notes ? readFileSync(path.join(folder, notes.name), 'utf8') : '';
}

function state(withNotes: boolean) {
  return botFolders().map((folder) => ({
    id: path.relative(root, folder) || path.basename(folder),
    events: readEvents(folder),
    ...(withNotes ? { notes: readNotes(folder) } : {}),
  }));
}

const page = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Play bots</title>
<style>
  :root { --bg: #f6f3ee; --panel: #fff; --ink: #1f1b16; --muted: #6f665c; --line: #e3dcd2; --accent: #b4561b; --ok: #2f7d4f; --bad: #b3261e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #16130f; --panel: #211d18; --ink: #efe9e1; --muted: #a39a8f; --line: #3a332b; --accent: #e08a4f; --ok: #6cc08e; --bad: #f08a80; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, sans-serif; }
  header { display: flex; gap: 16px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  h1 { font-size: 16px; margin: 0; }
  header label, header span { color: var(--muted); font-size: 13px; }
  main { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; padding: 12px 16px; }
  section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; display: flex; flex-direction: column; max-height: calc(100vh - 80px); }
  .head { padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .name { font-weight: 600; font-size: 15px; }
  .status { font-size: 13px; color: var(--muted); }
  .status.thinking { color: var(--accent); font-weight: 600; }
  .totals { font-size: 12px; color: var(--muted); margin-top: 4px; font-variant-numeric: tabular-nums; }
  ol { list-style: none; margin: 0; padding: 6px 12px 12px; overflow-y: auto; flex: 1; }
  li { padding: 6px 0; border-bottom: 1px dashed var(--line); white-space: pre-wrap; word-break: break-word; }
  .time { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; margin-right: 6px; }
  .kind { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-right: 6px; }
  .wake .kind, .thought .kind { color: var(--accent); }
  .tool .ok { color: var(--ok); } .tool .refused, .failed .kind { color: var(--bad); }
  .result { color: var(--muted); font-size: 12px; display: block; margin-top: 2px; }
  pre.notes { margin: 0; padding: 10px 12px; border-top: 1px solid var(--line); max-height: 30vh; overflow: auto; white-space: pre-wrap; font-size: 12px; }
  .empty { padding: 24px 16px; color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1>Play bots</h1>
  <label><input type="checkbox" id="notes"> Show private notes</label>
  <label><input type="checkbox" id="results" checked> Show tool results</label>
  <span id="updated"></span>
</header>
<main id="bots"></main>
<script>
const bots = document.getElementById('bots');
const notesBox = document.getElementById('notes');
const resultsBox = document.getElementById('results');
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
const clock = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const short = (value, n) => { const text = typeof value === 'string' ? value : JSON.stringify(value); return text.length > n ? text.slice(0, n) + '…' : text; };

function line(event) {
  const item = el('li', event.kind);
  item.append(el('span', 'time', clock(event.at)));
  switch (event.kind) {
    case 'wake': item.append(el('span', 'kind', 'woken'), event.reason); break;
    case 'skipped': item.append(el('span', 'kind', 'not woken'), event.reason); break;
    case 'think': item.append(el('span', 'kind', 'thinking'), (event.promptChars ?? 0).toLocaleString() + ' prompt characters'); break;
    case 'tool': {
      item.append(el('span', 'kind ' + (event.ok ? 'ok' : 'refused'), event.ok ? 'tool' : 'refused'), event.name + ' ' + short(event.args ?? {}, 160));
      if (resultsBox.checked && event.result) item.append(el('span', 'result', short(event.result, 400)));
      break;
    }
    case 'thought': {
      const u = event.usage ?? {};
      const cost = [event.seconds?.toFixed(1) + ' s', u.inputTokens !== undefined && (u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)).toLocaleString() + ' tokens in', u.outputTokens !== undefined && u.outputTokens.toLocaleString() + ' out', u.costUsd !== undefined && '$' + u.costUsd.toFixed(3)].filter(Boolean).join(', ');
      item.append(el('span', 'kind', 'done'), event.summary || '(no summary)', el('span', 'result', cost));
      break;
    }
    case 'failed': item.append(el('span', 'kind', 'failed'), event.error); break;
    default: item.append(el('span', 'kind', event.kind), event.text ?? '');
  }
  return item;
}

function column(bot) {
  const events = bot.events;
  const last = events.at(-1) ?? {};
  const name = [...events].reverse().find((e) => e.bot)?.bot ?? bot.id;
  const faction = [...events].reverse().find((e) => e.faction)?.faction;
  const thinking = last.kind === 'think' || (last.kind === 'tool' && events.findLast((e) => e.kind === 'think' || e.kind === 'thought' || e.kind === 'failed')?.kind === 'think');
  const thoughts = events.filter((e) => e.kind === 'thought');
  const sum = (key) => thoughts.reduce((total, e) => total + (e.usage?.[key] ?? 0), 0);
  const section = el('section');
  const head = el('div', 'head');
  head.append(el('div', 'name', name + (faction ? ' · ' + faction : '')));
  head.append(el('div', 'status' + (thinking ? ' thinking' : ''), thinking ? 'Thinking…' : 'Waiting for a message'));
  const tokensIn = sum('inputTokens') + sum('cacheReadTokens') + sum('cacheWriteTokens');
  const cached = sum('cacheReadTokens');
  head.append(el('div', 'totals', [
    events.filter((e) => e.kind === 'wake').length + ' wakes',
    events.filter((e) => e.kind === 'tool').length + ' tool calls',
    tokensIn.toLocaleString() + ' tokens in' + (tokensIn ? ' (' + Math.round((100 * cached) / tokensIn) + '% cached)' : ''),
    sum('outputTokens').toLocaleString() + ' out',
    '$' + sum('costUsd').toFixed(3),
  ].join(' · ')));
  section.append(head);
  const list = el('ol');
  for (const event of [...events].reverse()) list.append(line(event));
  section.append(list);
  if (notesBox.checked) section.append(el('pre', 'notes', bot.notes || '(no notes yet)'));
  return section;
}

async function refresh() {
  try {
    const response = await fetch('/state' + (notesBox.checked ? '?notes=1' : ''));
    const state = await response.json();
    bots.replaceChildren(...(state.length ? state.map(column) : [el('div', 'empty', 'No bot has written an event log yet. Start one with bun run play:bot.')]));
    document.getElementById('updated').textContent = 'Updated ' + clock(Date.now());
  } catch {
    document.getElementById('updated').textContent = 'The watcher stopped.';
  }
}
notesBox.addEventListener('change', refresh);
resultsBox.addEventListener('change', refresh);
refresh();
setInterval(refresh, 1500);
</script>
</body>
</html>`;

const port = Number(values.port);
createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/state') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(state(url.searchParams.get('notes') === '1')));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(page);
}).listen(port, '127.0.0.1', () => console.log(`Watching ${root} at http://127.0.0.1:${port}`));

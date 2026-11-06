/*
 * One page, two uses, on this machine only.
 *
 * As a harness (`play:bot:harness`), it is ONE bot: it holds one seat, serves that seat's tools as an MCP endpoint at
 * /mcp (the seat's agent CLI connects with the seat token in its header), and shows that bot's status (connected,
 * asking for a seat, seated, playing, thinking, stopped), what woke it, each tool it called, what it concluded and its
 * tokens. Start one harness per bot; each takes a free port and claims a bot account no other harness holds.
 *
 *   bun run play:bot:harness -- --game <URL> --faction fremen    # or paste the URL and faction into its page
 *   bun run play:bot:harness -- --game <URL> --faction harkonnen # a second bot, a second harness
 *
 * As the manager (`play:bot:watch`, http://127.0.0.1:4747), it is the one page for all of them: paste the game's URL and
 * the factions, and it starts one harness process per faction; it shows every bot on the machine (however it was started),
 * links to each one's harness page, and stops any of them. `--dir` only watches another folder, such as a demo's
 * out/three-player-<stamp>.
 *
 * Like the bots, it only joins the game it is given and never creates one. Private notes stay hidden unless you tick
 * "Show private notes", so a recording does not give a bot's plans away.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { BOTS_DIR, claimOf } from './claims';
import { Harness } from './harness';
import { DEFAULT_STACK, readStack } from './seat';

const { values } = parseArgs({
  options: {
    /* Be one bot's harness; without it, the page only watches. */
    harness: { type: 'boolean', default: false },
    dir: { type: 'string', default: path.join(import.meta.dirname, 'out/bots') },
    /* The watcher takes 4747; a harness takes 4748, or any free port once that is taken. */
    port: { type: 'string' },
    stack: { type: 'string', default: DEFAULT_STACK },
    /* Start the bot at once, without the page: the game's URL and the one faction it drafts. */
    game: { type: 'string' },
    faction: { type: 'string' },
    brain: { type: 'string', default: 'claude' },
    /* The model the brain's CLI runs: an alias such as sonnet or haiku, or empty for the CLI's own default. */
    model: { type: 'string', default: 'sonnet' },
    /* A particular stack bot account (from 1); by default the first no other harness holds. */
    account: { type: 'string' },
  },
});
const isHarness = values.harness!;
const root = path.resolve(values.dir!);
const MAX_EVENTS = 400;
/* Starting bots needs the stack's accounts; watching a demo's folder does not. */
const canLaunch = existsSync(values.stack!) && (isHarness || root === BOTS_DIR);

let port = Number(values.port ?? (isHarness ? 4748 : 4747));
const harness = new Harness(() => `http://127.0.0.1:${port}`);

/**
 * The manager's start: one harness process per faction, each its own bot. It outlives nothing: the harnesses keep
 * running if this page stops, and any page can stop them.
 */
function startHarnesses(game: string, factions: string[], brain: 'claude' | 'codex', model: string) {
  const free = (readStack(values.stack).accounts.bots ?? []).filter((bot) => !claimOf(bot.email.split('@')[0]!, root));
  if (free.length < factions.length) {
    throw new Error(
      `${free.length} bot account${free.length === 1 ? ' is' : 's are'} free for ${factions.length} bots. Start the stack with more (--bots), or stop a bot.`
    );
  }
  for (const faction of factions) {
    const child = spawn(
      process.execPath,
      [path.join(import.meta.dirname, 'page.ts'), '--harness', '--port', '0', '--game', game, '--faction', faction, '--brain', brain, '--model', model, '--stack', values.stack!],
      { stdio: 'ignore', detached: true }
    );
    child.unref();
  }
}

/** This harness's one bot, on a bot account no other harness on this machine holds. */
function launch(game: string, faction: string, brain: 'claude' | 'codex', model: string) {
  const current = harness.states().find((seat) => !seat.ended);
  if (current) {
    throw new Error(`This harness already plays ${current.name}. Start another harness for another bot.`);
  }
  harness.join({ stack: readStack(values.stack), game, want: faction, brain, model, account: values.account ? Number(values.account) : undefined });
}

/* A page on another site could post here too; a JSON body from this page's own origin is the only thing accepted. */
async function body(request: IncomingMessage, port: number): Promise<Record<string, unknown>> {
  const origin = request.headers.origin;
  if (origin !== `http://127.0.0.1:${port}` || !request.headers['content-type']?.startsWith('application/json')) {
    throw new Error('Only this page can start or stop bots.');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

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
    /* A bot that has written events, or that a harness holds and is still joining. */
    if (entries.includes('events.jsonl') || entries.includes('harness.claim.json')) {
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
  const seats = new Map(harness.states().slice(-1).map((seat) => [seat.id, seat]));
  /* A harness shows its own bot only; the watcher shows every bot on the machine. */
  const folders = isHarness
    ? new Map([...seats.keys()].map((id) => [id, path.join(root, id)]))
    : new Map(botFolders().map((folder) => [path.relative(root, folder) || path.basename(folder), folder]));
  const bots = [...folders].map(([id, folder]) => {
    const all = existsSync(path.join(folder, 'events.jsonl')) ? readEvents(folder) : [];
    /* A bot's file holds every game it played; the column starts at its newest connection. */
    const start = all.findLastIndex((event) => event.kind === 'status' && event.state === 'connected');
    const run = seats.get(id);
    /* In the watcher, each bot links to the page of the harness that plays it. */
    const host = isHarness ? undefined : claimOf(id, root);
    return {
      id,
      ...(host ? { hostedBy: host.page } : {}),
      events: start >= 0 ? all.slice(start) : all,
      ...(run ? { process: { faction: run.want, exit: run.ended ?? null, output: run.ended ? [run.ended] : [] } } : {}),
      ...(withNotes && existsSync(folder) ? { notes: readNotes(folder) } : {}),
    };
  });
  /* The start form shows until this harness's bot is under way. */
  return { canLaunch: canLaunch && !harness.states().some((seat) => !seat.ended), bots };
}

const page = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${isHarness ? 'Play bot harness' : 'Play bots'}</title>
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
  form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); }
  input, select, button { font: inherit; padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); max-width: 100%; }
  button { cursor: pointer; }
  .error { color: var(--bad); font-size: 13px; }
  .pill { display: inline-block; font-size: 12px; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line); margin-right: 6px; }
  .pill.playing, .pill.seated { color: var(--ok); border-color: var(--ok); }
  .pill.asking, .pill.thinking, .pill.joining { color: var(--accent); border-color: var(--accent); }
  .pill.stopped { color: var(--bad); border-color: var(--bad); }
  .output { font: 12px/1.4 ui-monospace, monospace; color: var(--muted); margin-top: 6px; white-space: pre-wrap; }
  .head button { float: right; font-size: 12px; padding: 2px 8px; }
</style>
</head>
<body>
<header>
  <h1>${isHarness ? 'Play bot' : 'Play bots on this machine'}</h1>
  <label><input type="checkbox" id="notes"> Show private notes</label>
  <label><input type="checkbox" id="results" checked> Show tool results</label>
  <span id="updated"></span>
</header>
<form id="launch" hidden>
  <input id="game" type="url" required placeholder="Game URL, such as http://127.0.0.1:8787/play/…" size="48">
  <input id="faction" value="${isHarness ? 'fremen' : 'fremen,harkonnen'}" title="${isHarness ? 'The faction this bot drafts' : 'One bot, and one harness, per faction'}" size="18">
  <select id="brain"><option value="claude">Claude Code</option><option value="codex">Codex</option></select>
  <select id="model" title="The model each bot thinks with"><option value="sonnet">Sonnet</option><option value="haiku">Haiku</option><option value="opus">Opus</option><option value="">CLI default</option></select>
  <button>${isHarness ? 'Start bot' : 'Start bots'}</button>
  <span id="launch-error" class="error"></span>
</form>
<main id="bots"></main>
<script>
const MANAGER = ${!isHarness};
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
  const name = [...events].reverse().find((e) => e.bot)?.bot ?? bot.id.charAt(0).toUpperCase() + bot.id.slice(1);
  const faction = [...events].reverse().find((e) => e.faction)?.faction ?? (bot.process ? 'wants ' + bot.process.faction : undefined);
  const thinking = last.kind === 'think' || (last.kind === 'tool' && events.findLast((e) => e.kind === 'think' || e.kind === 'thought' || e.kind === 'failed')?.kind === 'think');
  const thoughts = events.filter((e) => e.kind === 'thought');
  const sum = (key) => thoughts.reduce((total, e) => total + (e.usage?.[key] ?? 0), 0);
  const section = el('section');
  const head = el('div', 'head');
  head.append(el('div', 'name', name + (faction ? ' · ' + faction : '')));
  const proc = bot.process;
  const latest = [...events].reverse().find((e) => e.kind === 'status' && e.state);
  const STATES = { connected: 'Connected', asking: 'Asking for a seat: approve it at the table', seated: 'Seated, drafting and trading', playing: 'Playing: waiting for a message' };
  const state = proc && proc.exit ? 'stopped' : thinking ? 'thinking' : latest ? latest.state : proc ? 'starting' : bot.hostedBy ? 'joining' : MANAGER ? 'stopped' : 'idle';
  const words = state === 'stopped' ? (proc ? 'Stopped (' + proc.exit + ')' : 'Not running') : state === 'thinking' ? 'Thinking…' : STATES[state] || (state === 'starting' ? 'Starting…' : state === 'joining' ? 'Joining the game' : 'Waiting for a message');
  const status = el('div', 'status');
  status.append(el('span', 'pill ' + state, state), words);
  head.append(status);
  if (bot.hostedBy) {
    const link = el('a', 'output', 'Its harness: ' + bot.hostedBy);
    link.href = bot.hostedBy;
    head.append(link);
  }
  if ((proc && !proc.exit) || bot.hostedBy) {
    const stop = el('button', '', 'Stop');
    stop.addEventListener('click', () => post('/stop', { id: bot.id }));
    head.prepend(stop);
  }
  if (proc && (proc.exit || state === 'starting') && proc.output.length) head.append(el('div', 'output', proc.output.join('\\n')));
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

async function post(url, data) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const answer = await response.json();
  document.getElementById('launch-error').textContent = answer.error || '';
  refresh();
}
document.getElementById('launch').addEventListener('submit', (event) => {
  event.preventDefault();
  post('/start', {
    game: document.getElementById('game').value,
    faction: document.getElementById('faction').value.trim(),
    brain: document.getElementById('brain').value,
    model: document.getElementById('model').value,
  });
});

async function refresh() {
  try {
    const response = await fetch('/state' + (notesBox.checked ? '?notes=1' : ''));
    const { canLaunch, bots: state } = await response.json();
    document.getElementById('launch').hidden = !canLaunch;
    bots.replaceChildren(...(state.length ? state.map(column) : [el('div', 'empty', canLaunch ? 'Paste the game URL above, name the faction' + (${isHarness} ? '' : 's') + ' and start.' : 'No bot is running here. Start the stack, then start bots.')]));
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

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  /* The seats' MCP: what each seat's agent CLI connects to, with its seat token. */
  if (isHarness && ['/mcp', '/tools', '/call'].includes(url.pathname)) {
    void harness.serve(request, response);
    return;
  }
  const json = (status: number, value: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  if (url.pathname === '/state') {
    json(200, state(url.searchParams.get('notes') === '1'));
    return;
  }
  if (request.method === 'POST' && (url.pathname === '/start' || url.pathname === '/stop')) {
    void body(request, port)
      .then((data) => {
        if (url.pathname === '/stop') {
          const id = String(data.id);
          if (isHarness) {
            harness.stop(id);
          } else {
            /* A harness is one bot: stopping the bot ends its harness, which gives its account back. */
            const claim = claimOf(id, root);
            if (claim) {
              process.kill(claim.pid, 'SIGINT');
            }
          }
          json(200, { ok: true });
          return;
        }
        if (!canLaunch) {
          throw new Error('Start the stack first (bun run play:bot:stack), so the bots have accounts.');
        }
        const game = new URL(String(data.game));
        const brain = data.brain === 'codex' ? 'codex' : 'claude';
        const model = /^[\w.-]{0,64}$/u.test(String(data.model ?? '')) ? String(data.model ?? '') : 'sonnet';
        const names = String(data.faction ?? '').split(',').map((name) => name.trim()).filter(Boolean);
        if (!names.length) {
          throw new Error('Name the faction to draft.');
        }
        if (isHarness) {
          if (names.length > 1) {
            throw new Error('A harness plays one bot: name one faction, or start bots from the manager page.');
          }
          launch(game.href, names[0]!, brain, model);
        } else {
          startHarnesses(game.href, names, brain, model);
        }
        json(200, { ok: true });
      })
      .catch((error: unknown) => json(400, { error: error instanceof Error ? error.message : String(error) }));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(page);
});
/* The first harness takes the usual port; each one started after it takes a free one. */
server.on('error', (error: NodeJS.ErrnoException) => {
  /* A second watcher on the same port would only repeat the first. */
  if (error.code === 'EADDRINUSE' && port !== 0 && isHarness) {
    port = 0;
    server.listen(0, '127.0.0.1');
  } else {
    throw error;
  }
});
server.on('listening', () => {
  port = (server.address() as AddressInfo).port;
  console.log(isHarness ? `Bot harness: http://127.0.0.1:${port}` : `Every bot on this machine: http://127.0.0.1:${port} (${root})`);
  if (isHarness && values.game && values.faction) {
    try {
      launch(new URL(values.game).href, values.faction.trim(), values.brain === 'codex' ? 'codex' : 'claude', values.model ?? '');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
});
server.listen(port, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    harness.stopAll();
    process.exit(0);
  });
}

/*
 * Seats a bot in a game on the local Play stack (`bun run play:bot:stack`), signed in as the stack's bot account.
 *
 *   bun run play:bot -- --game http://127.0.0.1:PORT/play/<game> --brain claude
 *
 * It only ever joins the game you name: it never creates a game. Create the game yourself, then start the bot with its URL.
 * The bot asks for the open seat; approve its request at the table. Before factions are dealt it drafts and trades by fixed
 * rules (lobby.ts); from setup on it acts only when someone writes to it at the table or privately. Options:
 *   --brain claude|codex   which agent CLI thinks for it (default claude; it must be signed in on this machine)
 *   --model <name>         passed to that CLI
 *   --style "<text>"       its personality and strength, in a sentence or two
 *   --account <n>          which of the stack's bot accounts plays (1 by default); run one process per bot
 *   --listen all|mentions  wake on every table message, or only when named; by default `all` at a two-seat table and
 *                          `mentions` at a larger one, where bots would otherwise answer each other without end
 *   --max-wakes <n>        at most this many wakes in ten minutes (default 12), so no conversation runs away
 *   --seat <seat-id>       a particular open seat
 *   --want <faction>       the faction it drafts, and trades for if the deal gives it another
 *   --stack <file>         the stack file the launcher wrote (default tools/play-bot/out/stack.json)
 * Each bot is isolated: its transcript, private notes and event log live under tools/play-bot/out/bots/<account>/,
 * its CLI's working directory under the system's temporary folder, and nothing tells it which other seats are bots. It treats every player as a person.
 */
import { parseArgs } from 'node:util';

import { claudeBrain, codexBrain } from './brains';
import { DEFAULT_STACK, joinSeat, readStack } from './seat';

const { values } = parseArgs({
  options: {
    game: { type: 'string' },
    brain: { type: 'string', default: 'claude' },
    model: { type: 'string' },
    style: { type: 'string' },
    listen: { type: 'string' },
    account: { type: 'string', default: '1' },
    'max-wakes': { type: 'string', default: '12' },
    seat: { type: 'string' },
    /* The faction you meant the bot to play; the game deals at random, so it warns when the deal went the other way. */
    want: { type: 'string' },
    stack: { type: 'string', default: DEFAULT_STACK },
  },
});
if (!values.game) {
  throw new Error('Pass --game with the game page URL from your browser.');
}
const seat = await joinSeat({
  stack: readStack(values.stack),
  game: values.game,
  account: Number(values.account),
  brain: (workdir) =>
    values.brain === 'codex' ? codexBrain({ model: values.model, workdir }) : claudeBrain({ model: values.model, workdir }),
  seat: values.seat,
  style: values.style,
  listen: values.listen === 'mentions' || values.listen === 'all' ? values.listen : 'auto',
  maxWakes: Number(values['max-wakes']),
  want: values.want,
  onClose: (code) => process.exit(code === 1000 ? 0 : 1),
});
process.on('SIGINT', () => seat.stop());

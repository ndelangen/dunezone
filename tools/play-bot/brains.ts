/*
 * Brains the bot can think with. The CLI brains run an agent that is already signed in on this machine
 * (Claude Code or Codex), so a development game costs nothing beyond that subscription. Each wake starts a fresh,
 * non-interactive run that reaches the game only through the bot's tools, served over the MCP bridge.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Brain, PlayBot } from './bot';
import { serveTools } from './tool-server';

const bridge = path.join(import.meta.dirname, 'mcp-stdio.ts');
const THINK_TIMEOUT_MS = 6 * 60_000;

function run(command: string, args: string[], input: string, env: NodeJS.ProcessEnv, cwd = tmpdir()) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'], cwd });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), THINK_TIMEOUT_MS);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(`${command} exited with ${code}: ${(err || out).trim().slice(-800)}`));
      }
    });
    child.stdin.end(input);
  });
}

/*
 * Where a bot's CLI runs: a directory of its own outside the repository, so two bots never share the CLI's per-directory
 * state (its project memory and sessions) and neither reads the repository's instructions.
 */
type BrainOptions = { model?: string; bun?: string; workdir?: string };

/**
 * Claude Code in print mode, with only the game tools and nothing on the machine.
 * It skips the user's own settings and CLAUDE.md, keeps no session, and writes no auto-memory, so one wake or one bot
 * leaves nothing another can read; the bot's notes are its only memory.
 */
export function claudeBrain({ model, bun = 'bun', workdir }: BrainOptions = {}): Brain {
  return {
    name: `Claude Code${model ? ` (${model})` : ''}`,
    async think(prompt: string, bot: PlayBot) {
      const tools = await serveTools(bot);
      try {
        const config = path.join(mkdtempSync(path.join(tmpdir(), 'play-bot-')), 'mcp.json');
        writeFileSync(
          config,
          JSON.stringify({
            mcpServers: {
              dune: {
                command: bun,
                args: [bridge],
                env: { PLAY_BOT_TOOLS_URL: tools.url, PLAY_BOT_TOOLS_TOKEN: tools.token },
              },
            },
          })
        );
        const args = [
          '-p',
          '--mcp-config',
          config,
          '--strict-mcp-config',
          '--tools',
          '',
          '--allowedTools',
          'mcp__dune',
          '--output-format',
          'text',
          '--setting-sources',
          'project,local',
          '--no-session-persistence',
          ...(model ? ['--model', model] : []),
        ];
        return await run('claude', args, prompt, { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }, workdir);
      } finally {
        await tools.close();
      }
    },
  };
}

/** Codex in exec mode, with the game tools as its one MCP server and a read-only sandbox. */
export function codexBrain({ model, bun = 'bun', workdir }: BrainOptions = {}): Brain {
  return {
    name: `Codex${model ? ` (${model})` : ''}`,
    async think(prompt: string, bot: PlayBot) {
      const tools = await serveTools(bot);
      try {
        const toml = (value: unknown) => JSON.stringify(value);
        const args = [
          'exec',
          '--skip-git-repo-check',
          '--sandbox',
          'read-only',
          '-c',
          'approval_policy="never"',
          '-c',
          `mcp_servers.dune.command=${toml(bun)}`,
          '-c',
          `mcp_servers.dune.args=[${toml(bridge)}]`,
          '-c',
          `mcp_servers.dune.env={PLAY_BOT_TOOLS_URL=${toml(tools.url)},PLAY_BOT_TOOLS_TOKEN=${toml(tools.token)}}`,
          ...(model ? ['--model', model] : []),
          '-',
        ];
        return await run('codex', args, prompt, process.env, workdir);
      } finally {
        await tools.close();
      }
    },
  };
}

/** A brain that plays a fixed script against the tools: for checking the plumbing without a model. */
export function scriptedBrain(
  script: (call: (name: string, args?: Record<string, unknown>) => Promise<string>, prompt: string) => Promise<string>
): Brain {
  return {
    name: 'Scripted brain',
    think: (prompt, bot) =>
      script(async (name, args = {}) => (await bot.callTool(name, args)).text, prompt),
  };
}

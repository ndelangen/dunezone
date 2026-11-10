import {
  CircleGauge,
  Eye,
  Download,
  Gamepad2,
  Gavel,
  Image,
  Layers,
  Lock,
  Percent,
  Printer,
  Scissors,
  ScrollText,
  Shuffle,
  Smartphone,
  Timer,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/*
 * The standalone tools at /tools: small helpers for a game of Dune at a real table.
 * Every tool is public, works signed out, is made for a phone first and follows the Ruleset the table plays.
 * Tools ship one at a time, like the tutorials: a tool not built shows as coming soon, and its address renders a placeholder that says what it will do.
 * The spice deck was the first built; each tool's route adds itself here by setting `built`.
 */

export type ToolGroup = 'Before the game' | 'During the game' | 'Make and export';

export const TOOL_GROUPS: readonly ToolGroup[] = ['Before the game', 'During the game', 'Make and export'];

type ToolCapability = Readonly<{ icon: LucideIcon; title: string; detail: string }>;

export type Tool = Readonly<{
  slug: string;
  title: string;
  /** What a player gets from it, in one line: the tile's words. */
  goal: string;
  /** The placeholder page's lede: what the tool does and who it is for. */
  statement: string;
  icon: LucideIcon;
  /** The tile's picture, once the tool is built; until then the tile shows the tool's mark as a placeholder. */
  art?: string;
  /** The same picture at twice the size, 1280 by 800, where a tool has one: the picture its links share, and the homepage's when it features the tool. */
  largeArt?: string;
  group: ToolGroup;
  /** Three things the tool will do, shown on its placeholder page. */
  capabilities: readonly [ToolCapability, ToolCapability, ToolCapability];
  /** The issue where the tool is planned, for anyone who wants to follow or help. */
  issue?: number;
  /**
   * Set once the tool is built: its own static route then serves `/tools/<slug>`, the same address the placeholder held, so links and bookmarks keep working.
   * A built tool is in the landing sitemap through `TOOL_PAGES`, which a test holds to this flag.
   */
  built?: true;
}>;

const TOOL_ENTRIES = [
  {
    slug: 'faction-draft',
    title: 'Faction draft',
    goal: 'Deal factions to the table at random, by draft, or pick and ban',
    statement:
      'Hand out factions fairly before the first storm: at random, by draft, or pick and ban, from any Ruleset and its custom factions.',
    icon: Shuffle,
    group: 'Before the game',
    capabilities: [
      { icon: Users, title: 'Any table', detail: 'Two to ten players, any Ruleset.' },
      { icon: Shuffle, title: 'Fair modes', detail: 'Random, draft, or pick and ban.' },
      { icon: Smartphone, title: 'One phone', detail: 'Pass it round, picks stay secret.' },
    ],
  },
  {
    slug: 'prediction-locket',
    title: 'Prediction locket',
    goal: 'Lock a secret prediction on a phone, with a time the table can trust',
    statement:
      'Pick the faction and the turn, and lock it on your phone. At the reveal the table sees the prediction and when it was locked, by Dune Zone’s clock, not the phone’s.',
    icon: Lock,
    art: '/tools/prediction-locket.webp',
    largeArt: '/tools/prediction-locket-large.webp',
    group: 'Before the game',
    capabilities: [
      { icon: Users, title: 'Faction and turn', detail: 'Any faction on Dune Zone, any turn.' },
      { icon: Lock, title: 'Locked', detail: 'Hidden on your phone until you reveal it.' },
      { icon: Timer, title: 'Trusted time', detail: 'Dune Zone’s clock, in your city’s time.' },
    ],
    built: true,
  },
  {
    slug: 'atreides-treachery-tracker',
    title: 'Treachery tracker',
    goal: 'Know which Treachery cards remain and who holds what',
    statement:
      'Track every Treachery card through bidding, hands and discards, so the Atreides, or anyone, knows what is left in the deck.',
    icon: Eye,
    art: '/tools/atreides-treachery-tracker.webp',
    group: 'During the game',
    issue: 2795,
    built: true,
    capabilities: [
      { icon: Eye, title: 'Every card', detail: 'Bought, played and discarded.' },
      { icon: Users, title: 'Every hand', detail: 'What each faction could be holding.' },
      { icon: Layers, title: 'Your deck', detail: 'Pick the Treachery deck in play.' },
    ],
  },
  {
    slug: 'spice-deck',
    title: 'Spice deck',
    goal: 'Run the spice deck on a phone, instead of shuffling the cards',
    statement:
      'Pick your ruleset’s spice deck and tap a spice pile to turn over its card. The phone shuffles, keeps the discard piles and says what Shai-Hulud devours.',
    icon: Layers,
    art: '/tools/spice-deck.webp',
    largeArt: '/tools/spice-deck-large.webp',
    group: 'During the game',
    capabilities: [
      { icon: Layers, title: 'Your deck', detail: 'The spice deck of any ruleset.' },
      { icon: Percent, title: 'The odds', detail: 'The chance of Shai-Hulud next.' },
      { icon: Smartphone, title: 'At the table', detail: 'One phone, no cards to shuffle.' },
    ],
    built: true,
  },
  {
    slug: 'battle-wheel',
    title: 'Battle wheel',
    goal: 'Dial a leader and troops, and see your dial and total strength',
    statement:
      'Pick your leader and dial your troops on a phone, and see the dial and your total strength, counted the way your Ruleset dials, for any faction on Dune Zone.',
    icon: CircleGauge,
    art: '/tools/battle-wheel.webp',
    largeArt: '/tools/battle-wheel-large.webp',
    group: 'During the game',
    capabilities: [
      { icon: Users, title: 'Any faction', detail: 'Its own leaders and troops.' },
      { icon: ScrollText, title: 'Ruleset-aware', detail: 'Spice and dialing as your Ruleset counts.' },
      { icon: Smartphone, title: 'At the table', detail: 'One phone per player, no wheel to turn.' },
    ],
    built: true,
  },
  {
    slug: 'bidding',
    title: 'Bidding',
    goal: 'Run Treachery auctions around the table and keep every hand count visible',
    statement:
      "Place a tablet beside the board to show the bidder and each faction's hand count. Players can bid through phone remotes, voice or the tablet while cards and spice stay on the table.",
    icon: Gavel,
    art: '/tools/bidding.webp',
    largeArt: '/tools/bidding-large.webp',
    group: 'During the game',
    issue: 2835,
    built: true,
    capabilities: [
      { icon: Users, title: 'Around the table', detail: 'Arrange faction tokens to match the seats.' },
      { icon: Smartphone, title: 'Mixed controls', detail: 'Phone remotes, voice and tablet controls together.' },
      { icon: Layers, title: 'Every hand', detail: 'Editable card counts, limits and Full status.' },
    ],
  },
  {
    slug: 'tts-faction-exporter',
    title: 'TTS faction exporter',
    goal: 'Take any faction from the catalogue into Tabletop Simulator',
    statement:
      'Turn a faction from the catalogue, its sheet, shield, leaders, troops and cards, into a Tabletop Simulator save you can load and play.',
    icon: Gamepad2,
    group: 'Make and export',
    capabilities: [
      { icon: ScrollText, title: 'Any faction', detail: 'Official or homebrew, from the catalogue.' },
      { icon: Layers, title: 'Every piece', detail: 'Sheet, shield, leaders, troops and cards.' },
      { icon: Download, title: 'One file', detail: 'A save to drop into Tabletop Simulator.' },
    ],
  },
  {
    slug: 'print-and-play-decks',
    title: 'Print-and-play decks',
    goal: 'Print any deck as cut-ready sheets, fronts and backs lined up',
    statement:
      'Print a Treachery, Spice, Traitor or custom deck from any Ruleset as cut-ready PDF sheets, with fronts and backs that line up for double-sided printing.',
    icon: Printer,
    group: 'Make and export',
    capabilities: [
      { icon: Layers, title: 'Any deck', detail: 'Pick the deck and how many of each card.' },
      { icon: Scissors, title: 'Cut-ready', detail: 'Crop marks and bleed for clean cards.' },
      { icon: Printer, title: 'Double-sided', detail: 'Backs line up with their fronts.' },
    ],
  },
  {
    slug: 'faction-print-kit',
    title: 'Faction print kit',
    goal: 'Print a faction sheet, shield, leader discs and traitor cards',
    statement:
      'Everything a faction needs at a physical table, printed at the right sizes: its sheet, shield, leader discs, troop tokens and traitor cards.',
    icon: Image,
    group: 'Make and export',
    capabilities: [
      { icon: ScrollText, title: 'Sheet and shield', detail: 'At the size of the real thing.' },
      { icon: Image, title: 'Tokens', detail: 'Leader discs and troop tokens to punch out.' },
      { icon: Printer, title: 'Home printer', detail: 'A4 or Letter, as a PDF.' },
    ],
  },
] as const satisfies readonly Tool[];

/** A slug the registry knows, so a route naming a renamed or misspelt tool fails to compile. */
export type ToolSlug = (typeof TOOL_ENTRIES)[number]['slug'];

export const TOOLS: readonly Tool[] = TOOL_ENTRIES;

/** Slugs a tool was renamed from, to the slug it has now: links and bookmarks to the old address keep working. */
export const FORMER_TOOL_SLUGS: Readonly<Record<string, ToolSlug>> = {
  'spice-deck-tracker': 'spice-deck',
  'prediction-keeper': 'prediction-locket',
};

export function toolAt(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function toolPath(tool: Pick<Tool, 'slug'>): string {
  return `/tools/${tool.slug}`;
}

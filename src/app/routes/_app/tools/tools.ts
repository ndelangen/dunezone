import {
  ClipboardList,
  Eye,
  Download,
  Gamepad2,
  Hourglass,
  Image,
  Layers,
  ListChecks,
  Lock,
  MapPin,
  Percent,
  Printer,
  Scissors,
  ScrollText,
  Shuffle,
  Smartphone,
  Sparkles,
  Swords,
  Timer,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/*
 * The standalone tools at /tools: small helpers for a game of Dune at a real table.
 * Every tool is public, works signed out, is made for a phone first and follows the Ruleset the table plays.
 * Tools ship one at a time, like the tutorials: a tool not built shows as coming soon, and its address renders a placeholder that says what it will do.
 * The Treachery tracker is the first (#2795); its route adds itself here by setting `built`.
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
    slug: 'setup-checklist',
    title: 'Setup checklist',
    goal: 'Lay out the board for the factions in play, step by step',
    statement:
      'Every starting force, spice pile, card and traitor for the factions at your table, in the order the Ruleset sets them up.',
    icon: ClipboardList,
    group: 'Before the game',
    capabilities: [
      { icon: ListChecks, title: 'Step by step', detail: 'Tick each step as the table does it.' },
      { icon: MapPin, title: 'Where it goes', detail: 'Starting territories and forces.' },
      { icon: ScrollText, title: 'Ruleset-aware', detail: 'Custom factions set up too.' },
    ],
  },
  {
    slug: 'prediction-keeper',
    title: 'Prediction keeper',
    goal: 'Seal a secret prediction on a phone and reveal it at the end',
    statement:
      'The Bene Gesserit write their prediction at setup, seal it on the phone, and reveal it when the game ends: no slip of paper to lose.',
    icon: Lock,
    group: 'Before the game',
    capabilities: [
      { icon: Lock, title: 'Sealed', detail: 'Hidden until you reveal it.' },
      { icon: Users, title: 'Faction and turn', detail: 'Pick the winner and the turn.' },
      { icon: Eye, title: 'The reveal', detail: 'Shown to the table at the end.' },
    ],
  },
  {
    slug: 'atreides-treachery-tracker',
    title: 'Treachery tracker',
    goal: 'Know which Treachery cards remain and who holds what',
    statement:
      'Track every Treachery card through bidding, hands and discards, so the Atreides, or anyone, knows what is left in the deck.',
    icon: Eye,
    group: 'During the game',
    issue: 2795,
    capabilities: [
      { icon: Eye, title: 'Every card', detail: 'Bought, played and discarded.' },
      { icon: Users, title: 'Every hand', detail: 'What each faction could be holding.' },
      { icon: Layers, title: 'Your deck', detail: 'Pick the Treachery deck in play.' },
    ],
  },
  {
    slug: 'spice-deck-tracker',
    title: 'Spice deck tracker',
    goal: 'See which spice blows remain and the chance of Shai-Hulud',
    statement:
      'Mark each spice card as it is drawn and see what is left, where spice can still blow, and how likely the worm is next.',
    icon: Layers,
    group: 'During the game',
    capabilities: [
      { icon: Layers, title: 'What is left', detail: 'Every card drawn and remaining.' },
      { icon: Percent, title: 'The odds', detail: 'The chance of Shai-Hulud next.' },
      { icon: MapPin, title: 'Where it blows', detail: 'Territories still to come.' },
    ],
  },
  {
    slug: 'round-tracker',
    title: 'Round tracker',
    goal: 'Follow the turn and phase, with every faction ability that happens in it',
    statement:
      'Keep the turn and phase for the whole table, with a reminder of each faction ability that happens in the phase, so nothing is forgotten.',
    icon: Hourglass,
    group: 'During the game',
    capabilities: [
      { icon: Hourglass, title: 'Turn and phase', detail: 'Where the game is, at a glance.' },
      { icon: Sparkles, title: 'Abilities', detail: 'What each faction can do now.' },
      { icon: Timer, title: 'Bid timer', detail: 'Keep bidding moving.' },
    ],
  },
  {
    slug: 'battle-calculator',
    title: 'Battle calculator',
    goal: 'Dial both battle plans and see who wins and what each side loses',
    statement:
      'Set both battle plans, with leaders, dialled forces, spice and cards, and see who wins and what each side loses before you commit.',
    icon: Swords,
    group: 'During the game',
    capabilities: [
      { icon: Swords, title: 'Both plans', detail: 'Leaders, forces, spice and cards.' },
      { icon: ListChecks, title: 'The outcome', detail: 'Who wins and every loss.' },
      { icon: ScrollText, title: 'Ruleset-aware', detail: 'Faction combat rules included.' },
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

export function toolAt(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function toolPath(tool: Pick<Tool, 'slug'>): string {
  return `/tools/${tool.slug}`;
}

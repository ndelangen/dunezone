import type { PublicFaction } from '@shared/play/capture';
import type { LogTab } from '@shared/play/log';
import type { ClientMessage, ServerMessage } from '@shared/play/protocol';

export type LogPage = Extract<ServerMessage, { type: 'log-history' }>;
type SpicePage = Extract<ServerMessage, { type: 'spice-history' }>;
type FactionPage = Extract<ServerMessage, { type: 'faction' }>;
type PageRead = Extract<ClientMessage, { type: 'log-history' | 'spice-history' | 'faction' }>;

/*
 * How soon after one read of a log tab a changed table may read it again. Changes inside the wait are read together at its end,
 * so a burst of commands costs one read at each end of it and a single command is read at once.
 */
const LOG_REFRESH_INTERVAL_MS = 500;

/* The same page with the same entries, so a read that found nothing new leaves the panel as it is. */
function sameLogPage(previous: LogPage, next: LogPage) {
  return (
    previous.before === next.before &&
    previous.more === next.more &&
    previous.entries.length === next.entries.length &&
    previous.entries.every((entry, index) => {
      const other = next.entries[index]!;
      return (
        entry.sequence === other.sequence &&
        entry.class === other.class &&
        entry.text === other.text &&
        entry.context === other.context &&
        entry.at === other.at
      );
    })
  );
}

/* Both tabs open on their newest page. */
function latestLogPages(): Record<LogTab, number> {
  return { game: Number.MAX_SAFE_INTEGER, audit: Number.MAX_SAFE_INTEGER };
}

/**
 * The pages a table's panels read on request: each log tab's page, the spice history and the seated factions' captured sheets.
 * Each answer replaces its value with a new object, so a panel sees a change by identity.
 */
export class TablePages {
  private spice?: SpicePage;
  private spiceBefore?: number;
  private logs: Partial<Record<LogTab, LogPage>> = {};
  private logBefore: Record<LogTab, number> = latestLogPages();
  /* When each log tab was last read, by the monotonic clock, and the read a changed table still has waiting for it. */
  private logReadAt: Partial<Record<LogTab, number>> = {};
  private readonly logRefreshes: Partial<Record<LogTab, ReturnType<typeof setTimeout>>> = {};
  /* A capture never changes once a game holds it, so each answer is kept across reconnects. */
  private sheets: Readonly<Partial<Record<string, PublicFaction | null>>> = {};
  /* Reads sent and not yet answered; a dropped connection or a refusal forgets them, so the panel can ask again. */
  private readonly factionRequests = new Set<string>();

  constructor(
    private readonly send: (message: PageRead) => boolean,
    private readonly monotonicNow: () => number,
    private readonly changed: () => void
  ) {}

  get spiceHistory() {
    return this.spice;
  }

  get logHistory() {
    return this.logs;
  }

  get factions() {
    return this.sheets;
  }

  /* Each tab keeps the page it asked for through live updates; the newest page is the default and the reset. */
  readLog(tab: LogTab, before = this.logBefore[tab]) {
    this.cancelLogRefresh(tab);
    this.logBefore = { ...this.logBefore, [tab]: before };
    if (this.send({ type: 'log-history', tab, before })) {
      this.logReadAt = { ...this.logReadAt, [tab]: this.monotonicNow() };
    }
  }

  /**
   * Reads a log tab's page again for a table that changed, at once unless the tab was read within the interval;
   * then the read waits out the rest of it.
   * The returned function drops a read still waiting.
   */
  refreshLog(tab: LogTab) {
    const wait = (this.logReadAt[tab] ?? Number.NEGATIVE_INFINITY) + LOG_REFRESH_INTERVAL_MS - this.monotonicNow();
    if (wait <= 0) {
      this.readLog(tab);
    } else {
      this.logRefreshes[tab] ??= setTimeout(() => this.readLog(tab), wait);
    }
    return () => this.cancelLogRefresh(tab);
  }

  /* Asks once for a seated faction's captured sheet; a read that was never answered can be asked again. */
  readFaction(factionId: string) {
    const known = factionId in this.sheets || this.factionRequests.has(factionId);
    if (!known && this.send({ type: 'faction', factionId })) {
      this.factionRequests.add(factionId);
    }
  }

  readSpice(before?: number) {
    this.spiceBefore = before;
    this.spice = undefined;
    if (before !== undefined) {
      this.send({ type: 'spice-history', before });
    }
    this.changed();
  }

  /* The spice history closes with the activity it was read beside. */
  closeSpiceHistory() {
    this.spiceBefore = undefined;
    this.spice = undefined;
  }

  /* A page arrives for the cursor it was asked with; one the panel has since moved past is dropped. */
  receive(message: LogPage | SpicePage | FactionPage) {
    switch (message.type) {
      case 'log-history': {
        const asked = message.before === this.logBefore[message.tab];
        const shown = this.logs[message.tab];
        if (asked && !(shown !== undefined && sameLogPage(shown, message))) {
          this.logs = { ...this.logs, [message.tab]: message };
        }
        break;
      }
      case 'spice-history':
        if (message.before === this.spiceBefore) {
          this.spice = message;
        }
        break;
      case 'faction':
        this.factionRequests.delete(message.factionId);
        this.sheets = { ...this.sheets, [message.factionId]: message.faction };
        break;
    }
  }

  /* A refused read carries no id; forgetting the faction reads lets the panel ask again on its next look. */
  forgetFactionReads() {
    this.factionRequests.clear();
  }

  /* A dropped connection answers nothing it was asked, so the logs start again from their newest pages. */
  disconnected() {
    this.factionRequests.clear();
    this.logs = {};
    this.logBefore = latestLogPages();
    this.logReadAt = {};
    for (const tab of Object.keys(this.logRefreshes) as LogTab[]) {
      this.cancelLogRefresh(tab);
    }
  }

  private cancelLogRefresh(tab: LogTab) {
    clearTimeout(this.logRefreshes[tab]);
    delete this.logRefreshes[tab];
  }
}

import type { BugReportBrowser } from '@shared/play/bugReports';
import { censorReportConversations } from '@shared/play/reportConversations';
import { redactReportData, redactReportText } from '@shared/play/reportRedaction';

type Log = BugReportBrowser['logs'][number];
const LEVELS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;
const METHODS = [
  'assert',
  'dir',
  'dirxml',
  'table',
  'count',
  'countReset',
  'timeLog',
  'timeEnd',
  'group',
  'groupCollapsed',
  'groupEnd',
  'clear',
] as const;
const LIMIT = 500;
const TEXT_LIMIT = 8192;
const BUFFER_LIMIT = 256_000;

/** One Play page's bounded log history. It never reads storage, cookies or request headers. */
export class BrowserDiagnostics {
  private logs: Log[] = [];
  private size = 0;
  private dropped = 0;

  record(level: Log['level'], values: unknown[]) {
    const text = values.map((value) => describe(value)).join(' ');
    const clipped = text.length > TEXT_LIMIT;
    const entry: Log = {
      at: `${performance.now().toFixed(1)}ms after navigation`,
      level,
      text: clipped ? `[oversized console entry omitted, original length: ${text.length}]` : redactReportText(text),
    };
    if (clipped) {
      this.dropped++;
    }
    this.logs.push(entry);
    this.size += entry.text.length;
    while (this.logs.length > LIMIT || this.size > BUFFER_LIMIT) {
      this.size -= this.logs.shift()!.text.length;
      this.dropped++;
    }
  }

  snapshot() {
    return { logs: this.logs.map((entry) => ({ ...entry })), droppedLogs: this.dropped };
  }

  listen(browser: Window) {
    const restores = [...LEVELS, ...METHODS].map((method) => {
      const original = console[method];
      const descriptor = Object.getOwnPropertyDescriptor(console, method);
      const capture = (...values: unknown[]) => {
        if (method !== 'assert' || !values[0]) {
          const level = LEVELS.find((entry) => entry === method);
          this.record(level ?? 'console', level ? values : [method, ...values]);
        }
        Reflect.apply(original, console, values);
      };
      Object.defineProperty(console, method, { ...descriptor, configurable: true, writable: true, value: capture });
      return () => {
        if (console[method] === capture) {
          if (descriptor) {
            Object.defineProperty(console, method, descriptor);
          } else {
            Reflect.set(console, method, original);
          }
        }
      };
    });
    const error = (event: Event) => {
      if (event instanceof ErrorEvent) {
        this.record('uncaught', [event.error ?? event.message, `${event.filename}:${event.lineno}:${event.colno}`]);
      } else if (event.target instanceof HTMLElement) {
        this.record('resource', [
          event.target.tagName,
          event.target.getAttribute('src') ?? event.target.getAttribute('href'),
        ]);
      }
    };
    const rejection = (event: PromiseRejectionEvent) => this.record('unhandledrejection', [event.reason]);
    browser.addEventListener('error', error, true);
    browser.addEventListener('unhandledrejection', rejection);
    return () => {
      restores.forEach((restore) => restore());
      browser.removeEventListener('error', error, true);
      browser.removeEventListener('unhandledrejection', rejection);
    };
  }
}

function describe(value: unknown): string {
  if (value instanceof Error) {
    return redactReportText(`${value.name}: ${value.message}\n${value.stack ?? ''}`);
  }
  if (typeof value === 'string') {
    return redactReportText(value);
  }
  try {
    const copied = new ConsoleValueCopy().copy(value, 0);
    return JSON.stringify(redactReportData(censorReportConversations(copied))) ?? String(value);
  } catch {
    return '[unserializable console argument]';
  }
}

class ConsoleValueCopy {
  private readonly seen = new WeakSet<object>();
  private nodes = 0;

  private exhausted(depth: number) {
    if (++this.nodes > 200) {
      return true;
    }
    return depth > 8;
  }

  copy(child: unknown, depth: number): unknown {
    if (this.exhausted(depth)) {
      return '[omitted]';
    }
    if (child === null) {
      return null;
    }
    if (typeof child !== 'object') {
      return consolePrimitive(child);
    }
    if (this.seen.has(child)) {
      return '[omitted]';
    }
    this.seen.add(child);
    return this.properties(child, depth);
  }

  private properties(child: object, depth: number) {
    const entries = Object.entries(Object.getOwnPropertyDescriptors(child)).slice(0, 100);
    /* Copy values before serialization, so neither getters nor toJSON methods run. */
    return Object.fromEntries(
      entries.map(([key, descriptor]) => [
        key,
        'value' in descriptor ? this.copy(descriptor.value, depth + 1) : '[getter]',
      ])
    );
  }
}

function consolePrimitive(value: unknown) {
  switch (typeof value) {
    case 'bigint':
    case 'symbol':
      return String(value);
    case 'function':
      return '[function]';
    default:
      return value;
  }
}

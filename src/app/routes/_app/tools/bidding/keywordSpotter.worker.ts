/// <reference lib="webworker" />

/*
 * The tiny listener's worker (Norbert, 2026-11-09): runs sherpa-onnx's keyword spotter, which hears only the auction's
 * phrases, entirely on the device. It uses the official sherpa-onnx build as published on npm, which is made for
 * Node; this worker gives it the few Node parts it reaches for (a file system holding the downloaded model, `path`,
 * `process`) so it runs in any browser, Safari on the iPad included.
 */

type Stats = Readonly<{
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  size: number;
  blksize: number;
  blocks: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  isFile: () => boolean;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
}>;

const files = new Map<string, Uint8Array>();
const open = new Map<number, string>();
let nextFd = 10;

const missing = (path: string) => Object.assign(new Error(`ENOENT ${path}`), { code: 'ENOENT' });
const normal = (path: string) =>
  `/${String(path)
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/')}`;
const isFolder = (path: string) => path === '/' || [...files.keys()].some((name) => name.startsWith(`${path}/`));

function stat(raw: string): Stats {
  const path = normal(raw);
  const file = files.get(path);
  if (!file && !isFolder(path)) {
    throw missing(path);
  }
  const size = file?.length ?? 4096;
  return {
    dev: 1,
    ino: path.length,
    mode: file ? 0o10_0644 : 0o4_0755,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    size,
    blksize: 4096,
    blocks: Math.ceil(size / 512),
    atime: new Date(0),
    mtime: new Date(0),
    ctime: new Date(0),
    isFile: () => Boolean(file),
    isDirectory: () => !file,
    isSymbolicLink: () => false,
  };
}

const fs = {
  lstatSync: stat,
  statSync: stat,
  fstatSync: (fd: number) => stat(open.get(fd) ?? '/'),
  openSync: (raw: string) => {
    const path = normal(raw);
    if (!files.has(path) && !isFolder(path)) {
      throw missing(path);
    }
    const fd = nextFd++;
    open.set(fd, path);
    return fd;
  },
  closeSync: (fd: number) => {
    open.delete(fd);
  },
  readSync: (fd: number, buffer: Uint8Array, offset: number, length: number, position: number) => {
    const file = files.get(open.get(fd) ?? '');
    if (!file) {
      return 0;
    }
    const count = Math.max(0, Math.min(length, file.length - position));
    buffer.set(file.subarray(position, position + count), offset);
    return count;
  },
  /* What the engine prints is dropped. */
  writeSync: (_fd: number, _buffer: Uint8Array, _offset: number, length: number) => length,
  readdirSync: (raw: string) => {
    const path = normal(raw);
    return [
      ...new Set(
        [...files.keys()]
          .filter((name) => name.startsWith(`${path}/`))
          .map((name) => name.slice(path.length + 1).split('/')[0])
      ),
    ];
  },
  readFileSync: (raw: string) => {
    const file = files.get(normal(raw));
    if (!file) {
      throw missing(raw);
    }
    return file;
  },
  readlinkSync: (raw: string) => {
    throw missing(raw);
  },
};

const path = {
  basename: (name: string) => name.split('/').pop() ?? '',
  dirname: (name: string) => name.replace(/\/[^/]*$/, '') || '/',
  isAbsolute: (name: string) => name.startsWith('/'),
  join: (...parts: string[]) => normal(parts.join('/')),
  normalize: normal,
  posix: { relative: (_from: string, to: string) => to, resolve: (...parts: string[]) => normal(parts.join('/')) },
};

const nodeProcess = {
  versions: { node: '22' },
  argv: [],
  env: {},
  platform: 'linux',
  exitCode: 0,
  stdin: { fd: 0 },
  cwd: () => '/',
  chdir: () => undefined,
  on: () => undefined,
  binding: () => ({
    fs: {
      O_APPEND: 1024,
      O_CREAT: 64,
      O_EXCL: 128,
      O_NOCTTY: 256,
      O_RDONLY: 0,
      O_RDWR: 2,
      O_SYNC: 1_052_672,
      O_TRUNC: 512,
      O_WRONLY: 1,
      O_NOFOLLOW: 131_072,
      O_DIRECTORY: 65_536,
    },
  }),
};
const nodeBuffer = {
  alloc: (size: number) => new Uint8Array(size),
  from: (buffer: ArrayBufferLike, offset?: number, length?: number) => new Uint8Array(buffer, offset, length),
};
const nodeRequire = (name: string) => ({ fs, path, crypto: self.crypto })[name];

/* Runs one of the engine's CommonJS scripts with the Node parts above, and hands back what it exports. */
function load(source: string): unknown {
  const module = { exports: {} as unknown };
  // eslint-disable-next-line typescript/no-implied-eval -- the engine ships as a script, loaded once from a fixed URL
  const run = new Function('module', 'exports', 'require', '__dirname', 'Buffer', source) as (
    ...args: unknown[]
  ) => void;
  run(module, module.exports, nodeRequire, '/', nodeBuffer);
  return module.exports;
}

type Spotter = {
  createStream(): Stream;
  isReady(stream: Stream): boolean;
  decode(stream: Stream): void;
  reset(stream: Stream): void;
  getResult(stream: Stream): { keyword: string };
};
type Stream = { acceptWaveform(rate: number, samples: Float32Array): void };

/** The messages the page sends: the engine and model, then sound. */
export type ToSpotter =
  | Readonly<{
      type: 'load';
      glue: string;
      kws: string;
      wasm: ArrayBuffer;
      model: Readonly<Record<'encoder' | 'decoder' | 'joiner' | 'tokens', ArrayBuffer>>;
      keywords: string;
    }>
  | Readonly<{ type: 'sound'; rate: number; samples: Float32Array }>;

/** What the worker answers: ready, a phrase heard, or a failure. */
export type FromSpotter =
  | Readonly<{ type: 'ready' }>
  | Readonly<{ type: 'heard'; keyword: string }>
  | Readonly<{ type: 'failed'; reason: string }>;

let spotter: Spotter | undefined;
let stream: Stream | undefined;
const answer = (message: FromSpotter) => self.postMessage(message);

/* No async syntax: the Storybook build requires workers to be lowered to plain promises. */
self.onmessage = ({ data }: MessageEvent<ToSpotter>) => {
  if (data.type === 'load') {
    const fail = (error: unknown) => answer({ type: 'failed', reason: String(error) });
    try {
      (globalThis as unknown as { process: unknown }).process = nodeProcess;
      for (const [name, buffer] of Object.entries(data.model)) {
        files.set(`/${name}`, new Uint8Array(buffer));
      }
      const factory = load(data.glue) as (module: Record<string, unknown>) => Promise<unknown>;
      const engine: Record<string, unknown> = {
        wasmBinary: data.wasm,
        print: () => undefined,
        printErr: () => undefined,
      };
      factory(engine)
        .then(() => {
          const { createKws } = load(data.kws) as { createKws: (engine: unknown, config: unknown) => Spotter };
          spotter = createKws(engine, {
            featConfig: { samplingRate: 16_000, featureDim: 80 },
            modelConfig: {
              transducer: { encoder: '/encoder', decoder: '/decoder', joiner: '/joiner' },
              tokens: '/tokens',
              provider: 'cpu',
              modelType: '',
              numThreads: 1,
              debug: 0,
              modelingUnit: 'bpe',
              bpeVocab: '',
            },
            maxActivePaths: 4,
            numTrailingBlanks: 1,
            /* Tuned on ten generated voices with and without chatter: no wrong bids, few misses. */
            keywordsScore: 1.5,
            keywordsThreshold: 0.12,
            keywords: data.keywords,
          });
          stream = spotter.createStream();
          answer({ type: 'ready' });
        })
        .catch(fail);
    } catch (error) {
      fail(error);
    }
    return;
  }
  if (!spotter || !stream) {
    return;
  }
  stream.acceptWaveform(data.rate, data.samples);
  while (spotter.isReady(stream)) {
    spotter.decode(stream);
    const { keyword } = spotter.getResult(stream);
    if (keyword) {
      answer({ type: 'heard', keyword });
      spotter.reset(stream);
    }
  }
};

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
const nodeRequire = (name: string) => {
  if (name === 'fs') {
    return fs;
  }
  if (name === 'path') {
    return path;
  }
  if (name === 'crypto') {
    return { randomFillSync: (bytes: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(bytes) };
  }
  throw new Error(`Unsupported engine module: ${name}`);
};

/** A read-only filesystem containing only this listener's model, for the pinned engine build. */
export function voiceEngineAdapters(model: Readonly<Record<string, ArrayBuffer>>) {
  files.clear();
  open.clear();
  for (const [name, buffer] of Object.entries(model)) {
    files.set(`/${name}`, new Uint8Array(buffer));
  }
  return { process: nodeProcess, require: nodeRequire, Buffer: nodeBuffer };
}

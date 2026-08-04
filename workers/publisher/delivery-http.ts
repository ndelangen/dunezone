export type AssetRepresentation = {
  exists: boolean;
  etag?: string;
  lastModified?: string;
  size?: number;
};

export type AssetRequestDecision =
  | { status: 200 }
  | { status: 206; range: { offset: number; length: number } }
  | { status: 304 }
  | { status: 404 }
  | { status: 412 }
  | { status: 416; size?: number };

type EntityTag = { weak: boolean; opaque: string };

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const LONG_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function entityTagCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code === 0x21 || (code >= 0x23 && code <= 0x7e) || code >= 0x80;
}

function parseEntityTagList(value: string): { star: boolean; tags: EntityTag[] } | null {
  if (value.trim() === '*') {
    return { star: true, tags: [] };
  }
  const tags: EntityTag[] = [];
  let index = 0;
  while (index < value.length) {
    while (value[index] === ' ' || value[index] === '\t') {
      index += 1;
    }
    let weak = false;
    if (value.startsWith('W/', index)) {
      weak = true;
      index += 2;
    }
    if (value[index] !== '"') {
      return null;
    }
    index += 1;
    let opaque = '';
    while (index < value.length && value[index] !== '"') {
      const character = value[index];
      if (!character || !entityTagCharacter(character)) {
        return null;
      }
      opaque += character;
      index += 1;
    }
    if (value[index] !== '"') {
      return null;
    }
    index += 1;
    tags.push({ weak, opaque });
    while (value[index] === ' ' || value[index] === '\t') {
      index += 1;
    }
    if (index === value.length) {
      break;
    }
    if (value[index] !== ',') {
      return null;
    }
    index += 1;
    if (index === value.length) {
      return null;
    }
  }
  return tags.length > 0 ? { star: false, tags } : null;
}

function currentEntityTag(value: string | undefined): EntityTag | null {
  if (value === undefined) {
    return null;
  }
  const parsed = parseEntityTagList(value);
  return parsed && !parsed.star && parsed.tags.length === 1 ? (parsed.tags[0] ?? null) : null;
}

function validUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  weekday: number
): number | null {
  if (
    year < 1601 ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 60
  ) {
    return null;
  }
  const normalSecond = Math.min(second, 59);
  const timestamp = Date.UTC(year, month, day, hour, minute, normalSecond);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== normalSecond ||
    date.getUTCDay() !== weekday
  ) {
    return null;
  }
  return timestamp + (second === 60 ? 1000 : 0);
}

function monthIndex(value: string): number {
  return MONTHS.indexOf(value);
}

export function parseHttpDate(value: string, now = Date.now()): number | null {
  const imf =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value
    );
  if (imf) {
    return validUtc(
      Number(imf[4]),
      monthIndex(imf[3] ?? ''),
      Number(imf[2]),
      Number(imf[5]),
      Number(imf[6]),
      Number(imf[7]),
      SHORT_WEEKDAYS.indexOf(imf[1] as (typeof SHORT_WEEKDAYS)[number])
    );
  }

  const rfc850 =
    /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value
    );
  if (rfc850) {
    const currentYear = new Date(now).getUTCFullYear();
    let year = Math.floor(currentYear / 100) * 100 + Number(rfc850[4]);
    if (year > currentYear + 50) {
      year -= 100;
    }
    return validUtc(
      year,
      monthIndex(rfc850[3] ?? ''),
      Number(rfc850[2]),
      Number(rfc850[5]),
      Number(rfc850[6]),
      Number(rfc850[7]),
      LONG_WEEKDAYS.indexOf(rfc850[1] as (typeof LONG_WEEKDAYS)[number])
    );
  }

  const asctime =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?: (\d)|(\d{2})) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
      value
    );
  if (!asctime) {
    return null;
  }
  return validUtc(
    Number(asctime[8]),
    monthIndex(asctime[2] ?? ''),
    Number(asctime[3] ?? asctime[4]),
    Number(asctime[5]),
    Number(asctime[6]),
    Number(asctime[7]),
    SHORT_WEEKDAYS.indexOf(asctime[1] as (typeof SHORT_WEEKDAYS)[number])
  );
}

function ifMatchPasses(value: string, representation: AssetRepresentation): boolean {
  const parsed = parseEntityTagList(value);
  if (!parsed) {
    return false;
  }
  if (parsed.star) {
    return representation.exists;
  }
  const current = currentEntityTag(representation.etag);
  return (
    representation.exists &&
    current !== null &&
    !current.weak &&
    parsed.tags.some((candidate) => !candidate.weak && candidate.opaque === current.opaque)
  );
}

function ifNoneMatchPasses(value: string, representation: AssetRepresentation): boolean {
  const parsed = parseEntityTagList(value);
  if (!parsed) {
    return true;
  }
  if (parsed.star) {
    return !representation.exists;
  }
  const current = currentEntityTag(representation.etag);
  return (
    !representation.exists ||
    current === null ||
    !parsed.tags.some((candidate) => candidate.opaque === current.opaque)
  );
}

function ifRangePasses(value: string, representation: AssetRepresentation, now: number): boolean {
  if (value.startsWith('"') || value.startsWith('W/')) {
    const parsed = parseEntityTagList(value);
    const candidate = parsed && !parsed.star && parsed.tags.length === 1 ? parsed.tags[0] : null;
    const current = currentEntityTag(representation.etag);
    return Boolean(
      candidate &&
      current &&
      !candidate.weak &&
      !current.weak &&
      candidate.opaque === current.opaque
    );
  }
  const validator = parseHttpDate(value, now);
  const lastModified = representation.lastModified
    ? parseHttpDate(representation.lastModified, now)
    : null;
  return validator !== null && lastModified !== null && validator === lastModified;
}

function resolvedRange(value: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(value);
  if (!match) {
    return null;
  }
  const suffix = match[3];
  if (suffix !== undefined) {
    const requestedLength = Number(suffix);
    if (!Number.isSafeInteger(requestedLength) || requestedLength <= 0 || size <= 0) {
      return null;
    }
    const length = Math.min(requestedLength, size);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(requestedEnd) ||
    offset < 0 ||
    offset >= size ||
    requestedEnd < offset
  ) {
    return null;
  }
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}

export function evaluateAssetRequest(
  request: Pick<Request, 'headers' | 'method'>,
  representation: AssetRepresentation,
  now = Date.now()
): AssetRequestDecision {
  const ifMatch = request.headers.get('If-Match');
  if (ifMatch !== null && !ifMatchPasses(ifMatch, representation)) {
    return { status: 412 };
  }

  if (ifMatch === null && representation.exists) {
    const ifUnmodifiedSince = request.headers.get('If-Unmodified-Since');
    const condition = ifUnmodifiedSince ? parseHttpDate(ifUnmodifiedSince, now) : null;
    const lastModified = representation.lastModified
      ? parseHttpDate(representation.lastModified, now)
      : null;
    if (condition !== null && lastModified !== null && lastModified > condition) {
      return { status: 412 };
    }
  }

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch !== null && !ifNoneMatchPasses(ifNoneMatch, representation)) {
    return { status: 304 };
  }

  if (ifNoneMatch === null && representation.exists) {
    const ifModifiedSince = request.headers.get('If-Modified-Since');
    const condition = ifModifiedSince ? parseHttpDate(ifModifiedSince, now) : null;
    const lastModified = representation.lastModified
      ? parseHttpDate(representation.lastModified, now)
      : null;
    if (condition !== null && lastModified !== null && lastModified <= condition) {
      return { status: 304 };
    }
  }

  if (!representation.exists) {
    return { status: 404 };
  }
  if (request.method === 'HEAD') {
    return { status: 200 };
  }

  const rangeValue = request.headers.get('Range');
  if (rangeValue === null) {
    return { status: 200 };
  }
  const ifRange = request.headers.get('If-Range');
  if (ifRange !== null && !ifRangePasses(ifRange, representation, now)) {
    return { status: 200 };
  }

  const size =
    Number.isSafeInteger(representation.size) && (representation.size ?? -1) >= 0
      ? representation.size
      : undefined;
  const range = size === undefined ? null : resolvedRange(rangeValue, size);
  if (!range) {
    return { status: 416, size };
  }
  return { status: 206, range };
}

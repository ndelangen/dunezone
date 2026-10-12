/**
 * A path-style S3 surface over R2 bindings, reachable only from the spike container through an outbound intercept.
 * It covers what Litestream and the Convex backend call; anything else is logged as UNHANDLED and answered with 501.
 * Signatures are not verified, but the access key must equal the token the Durable Object issued for this generation.
 * Convex functions run user code with fetch inside the same container, so the shim is also the fence:
 * in the Litestream bucket, a generation may read anything but write and delete only under gen-N/ and events/gen-N/.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './env';

const BUCKETS: Record<string, keyof Env> = {
  'convex-spike-litestream': 'LITESTREAM',
  'convex-spike-modules': 'MODULES',
  'convex-spike-files': 'FILES',
  'convex-spike-search': 'SEARCH',
  'convex-spike-exports': 'EXPORTS',
  'convex-spike-imports': 'IMPORTS',
};

/** An R2 call that takes longer than this answers 503 SlowDown, which S3 clients retry, instead of holding the client forever. */
const R2_TIMEOUT_MS = 30_000;

export type ShimProps = { generation: number; token: string };

export class S3Shim extends WorkerEntrypoint<Env, ShimProps> {
  override async fetch(request: Request): Promise<Response> {
    const started = Date.now();
    const url = new URL(request.url);
    const { bucketName, key } = locate(url);
    const op = operation(request.method, url, key);
    const id = crypto.randomUUID().slice(0, 8);
    // Logged on arrival, so a request that never completes still shows up.
    console.log(
      `S3> ${id} ${op} ${bucketName}/${key} expect=${request.headers.get('expect') ?? '-'} length=${request.headers.get('content-length') ?? '-'} encoding=${request.headers.get('content-encoding') ?? '-'}`
    );
    let response: Response;
    try {
      const bucket = bucketName ? (this.env[BUCKETS[bucketName] ?? ('' as keyof Env)] as R2Bucket | undefined) : undefined;
      const { generation, token } = this.ctx.props;
      const canWrite = (target: string) =>
        bucketName !== 'convex-spike-litestream' ||
        target.startsWith(`gen-${generation}/`) ||
        target.startsWith(`events/gen-${generation}/`);
      if (accessKey(request) !== token) {
        response = s3Error(403, 'InvalidAccessKeyId', 'Unknown access key');
      } else if (!bucket) {
        response = s3Error(404, 'NoSuchBucket', `Unknown bucket ${bucketName}`);
      } else if (WRITES.has(op) && !canWrite(key)) {
        response = s3Error(403, 'AccessDenied', `generation ${generation} may not write ${key}`);
      } else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<Response>((resolve) => {
          timer = setTimeout(() => {
            console.error(`S3 TIMEOUT ${id} ${op} ${bucketName}/${key} after ${R2_TIMEOUT_MS} ms`);
            resolve(s3Error(503, 'SlowDown', 'R2 call timed out in the shim'));
          }, R2_TIMEOUT_MS);
        });
        response = await Promise.race([handle(op, bucket, bucketName!, key, url, request, canWrite), timeout]);
        clearTimeout(timer);
      }
    } catch (error) {
      console.error(`S3 ${op} ${bucketName}/${key} threw`, error);
      response = s3Error(500, 'InternalError', String(error));
    } finally {
      // An unread request body can leave the client's connection waiting; release it on every path.
      if (request.body && !request.bodyUsed) {
        await request.body.cancel().catch(() => {});
      }
    }
    const line = `S3< ${id} ${op} ${bucketName}/${key} ${response.status} ${Date.now() - started}ms`;
    if (response.status === 501) {
      console.warn(`UNHANDLED ${line} ${request.method} ${url.search}`);
    } else {
      console.log(line);
    }
    return response;
  }
}

const WRITES = new Set([
  'PutObject',
  'DeleteObject',
  'CreateMultipartUpload',
  'UploadPart',
  'CompleteMultipartUpload',
  'AbortMultipartUpload',
]);

/** The access key from a SigV4 Authorization header, or the x-spike-token header the entrypoint's curl uses. */
function accessKey(request: Request) {
  const credential = /Credential=([^/,\s]+)/.exec(request.headers.get('authorization') ?? '');
  return credential?.[1] ?? request.headers.get('x-spike-token');
}

function locate(url: URL) {
  // Path style: http://r2.internal/<bucket>/<key>. Virtual-host style: http://<bucket>.r2.internal/<key>.
  if (url.hostname !== 'r2.internal' && url.hostname.endsWith('.r2.internal')) {
    return { bucketName: url.hostname.slice(0, -'.r2.internal'.length), key: decodeKey(url.pathname.slice(1)) };
  }
  const [bucketName = '', ...rest] = url.pathname.slice(1).split('/');
  return { bucketName, key: decodeKey(rest.join('/')) };
}

function decodeKey(raw: string) {
  return raw
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

function operation(method: string, url: URL, key: string) {
  const q = url.searchParams;
  switch (true) {
    case key === '' && method === 'GET' && q.get('list-type') === '2':
      return 'ListObjectsV2';
    case key === '' && method === 'GET' && q.has('location'):
      return 'GetBucketLocation';
    case key === '' && method === 'GET':
      return 'ListObjects';
    case key === '' && method === 'HEAD':
      return 'HeadBucket';
    case key === '' && method === 'POST' && q.has('delete'):
      return 'DeleteObjects';
    case method === 'POST' && q.has('uploads'):
      return 'CreateMultipartUpload';
    case method === 'PUT' && q.has('uploadId') && q.has('partNumber'):
      return 'UploadPart';
    case method === 'POST' && q.has('uploadId'):
      return 'CompleteMultipartUpload';
    case method === 'DELETE' && q.has('uploadId'):
      return 'AbortMultipartUpload';
    case method === 'GET' && q.has('uploadId'):
      return 'ListParts';
    case method === 'PUT' && key !== '' && url.searchParams.size === 0:
      return 'PutObject';
    case method === 'PUT' && key !== '' && q.has('x-id') && q.get('x-id') === 'PutObject':
      return 'PutObject';
    case method === 'GET' && key !== '':
      return 'GetObject';
    case method === 'HEAD' && key !== '':
      return 'HeadObject';
    case method === 'DELETE' && key !== '':
      return 'DeleteObject';
    default:
      return `${method}?${[...q.keys()].join('&')}`;
  }
}

async function handle(
  op: string,
  bucket: R2Bucket,
  bucketName: string,
  key: string,
  url: URL,
  request: Request,
  canWrite: (key: string) => boolean
) {
  const q = url.searchParams;
  switch (op) {
    case 'HeadBucket':
      return empty(200);
    case 'GetBucketLocation':
      return xml('<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">auto</LocationConstraint>');
    case 'ListObjectsV2':
      return listV2(bucket, bucketName, q);
    case 'PutObject': {
      if (request.headers.has('x-amz-copy-source')) {
        return s3Error(501, 'NotImplemented', 'CopyObject');
      }
      const body = await readBody(request);
      const object = await bucket.put(key, body, {
        httpMetadata: { contentType: request.headers.get('content-type') ?? undefined },
        customMetadata: amzMeta(request.headers),
      });
      return empty(200, { ETag: quote(object!.etag) });
    }
    case 'GetObject': {
      const object = await bucket.get(key, { range: request.headers, onlyIf: request.headers });
      if (!object) {
        return s3Error(404, 'NoSuchKey', 'The specified key does not exist.');
      }
      if (!('body' in object)) {
        // R2 returns the object without a body when a condition fails: If-None-Match means 304, If-Match 412.
        return request.headers.has('if-none-match')
          ? empty(304, Object.fromEntries(objectHeaders(object)))
          : s3Error(412, 'PreconditionFailed', 'At least one of the preconditions did not hold');
      }
      const headers = objectHeaders(object);
      const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
      if (request.headers.has('range') && range) {
        const offset = range.suffix !== undefined ? object.size - range.suffix : (range.offset ?? 0);
        const length = range.suffix !== undefined ? range.suffix : (range.length ?? object.size - offset);
        headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
        headers.set('Content-Length', String(length));
        return new Response(object.body, { status: 206, headers });
      }
      headers.set('Content-Length', String(object.size));
      return new Response(object.body, { status: 200, headers });
    }
    case 'HeadObject': {
      const object = await bucket.head(key);
      if (!object) {
        return empty(404);
      }
      const headers = objectHeaders(object);
      headers.set('Content-Length', String(object.size));
      return new Response(null, { status: 200, headers });
    }
    case 'DeleteObject':
      await bucket.delete(key);
      return empty(204);
    case 'DeleteObjects': {
      const text = new TextDecoder().decode(await readBody(request));
      const keys = [...text.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) => unescapeXml(match[1]!));
      const refused = keys.find((candidate) => !canWrite(candidate));
      if (refused !== undefined) {
        return s3Error(403, 'AccessDenied', `may not delete ${refused}`);
      }
      for (let start = 0; start < keys.length; start += 1000) {
        await bucket.delete(keys.slice(start, start + 1000));
      }
      const quiet = /<Quiet>\s*true\s*<\/Quiet>/i.test(text);
      const deleted = quiet ? '' : keys.map((k) => `<Deleted><Key>${escapeXml(k)}</Key></Deleted>`).join('');
      return xml(`<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${deleted}</DeleteResult>`);
    }
    case 'CreateMultipartUpload': {
      const upload = await bucket.createMultipartUpload(key, {
        httpMetadata: { contentType: request.headers.get('content-type') ?? undefined },
        customMetadata: amzMeta(request.headers),
      });
      return xml(
        `<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>${escapeXml(bucketName)}</Bucket><Key>${escapeXml(key)}</Key><UploadId>${escapeXml(upload.uploadId)}</UploadId></InitiateMultipartUploadResult>`
      );
    }
    case 'UploadPart': {
      const upload = bucket.resumeMultipartUpload(key, q.get('uploadId')!);
      const part = await upload.uploadPart(Number(q.get('partNumber')), await readBody(request));
      return empty(200, { ETag: quote(part.etag) });
    }
    case 'CompleteMultipartUpload': {
      const text = new TextDecoder().decode(await readBody(request));
      const parts = [...text.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((match) => ({
        partNumber: Number(/<PartNumber>(\d+)<\/PartNumber>/.exec(match[1]!)![1]),
        etag: unquote(unescapeXml(/<ETag>([\s\S]*?)<\/ETag>/.exec(match[1]!)![1]!)),
      }));
      const upload = bucket.resumeMultipartUpload(key, q.get('uploadId')!);
      const object = await upload.complete(parts);
      return xml(
        `<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>${escapeXml(bucketName)}</Bucket><Key>${escapeXml(key)}</Key><ETag>${escapeXml(quote(object.etag))}</ETag></CompleteMultipartUploadResult>`
      );
    }
    case 'AbortMultipartUpload':
      await bucket.resumeMultipartUpload(key, q.get('uploadId')!).abort();
      return empty(204);
    default:
      return s3Error(501, 'NotImplemented', op);
  }
}

async function listV2(bucket: R2Bucket, bucketName: string, q: URLSearchParams) {
  const prefix = q.get('prefix') ?? '';
  const delimiter = q.get('delimiter') ?? undefined;
  const maxKeys = Math.min(Number(q.get('max-keys') ?? 1000), 1000);
  const urlEncoded = q.get('encoding-type') === 'url';
  const enc = (value: string) => escapeXml(urlEncoded ? encodeURIComponent(value).replace(/%2F/g, '/') : value);
  const listed = await bucket.list({
    prefix,
    delimiter,
    limit: maxKeys,
    cursor: q.get('continuation-token') ?? undefined,
    startAfter: q.get('start-after') ?? undefined,
  });
  const contents = listed.objects
    .map(
      (object) =>
        `<Contents><Key>${enc(object.key)}</Key><LastModified>${object.uploaded.toISOString()}</LastModified><ETag>${escapeXml(quote(object.etag))}</ETag><Size>${object.size}</Size><StorageClass>STANDARD</StorageClass></Contents>`
    )
    .join('');
  const prefixes = listed.delimitedPrefixes.map((p) => `<CommonPrefixes><Prefix>${enc(p)}</Prefix></CommonPrefixes>`).join('');
  const next = listed.truncated ? `<NextContinuationToken>${escapeXml(listed.cursor)}</NextContinuationToken>` : '';
  const token = q.get('continuation-token');
  return xml(
    `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${escapeXml(bucketName)}</Name><Prefix>${enc(prefix)}</Prefix>${delimiter ? `<Delimiter>${enc(delimiter)}</Delimiter>` : ''}<MaxKeys>${maxKeys}</MaxKeys><KeyCount>${listed.objects.length + listed.delimitedPrefixes.length}</KeyCount><IsTruncated>${listed.truncated}</IsTruncated>${token ? `<ContinuationToken>${escapeXml(token)}</ContinuationToken>` : ''}${next}${urlEncoded ? '<EncodingType>url</EncodingType>' : ''}${contents}${prefixes}</ListBucketResult>`
  );
}

/** Reads a request body, unwrapping aws-chunked framing that SDKs use for streaming and trailing checksums. */
async function readBody(request: Request): Promise<Uint8Array> {
  const raw = new Uint8Array(await request.arrayBuffer());
  const sha = request.headers.get('x-amz-content-sha256') ?? '';
  const encoding = request.headers.get('content-encoding') ?? '';
  if (!sha.startsWith('STREAMING-') && !encoding.includes('aws-chunked')) {
    return raw;
  }
  const chunks: Uint8Array[] = [];
  let position = 0;
  while (position < raw.length) {
    let lineEnd = position;
    while (lineEnd + 1 < raw.length && !(raw[lineEnd] === 13 && raw[lineEnd + 1] === 10)) {
      lineEnd++;
    }
    const header = new TextDecoder().decode(raw.subarray(position, lineEnd));
    const size = parseInt(header.split(';')[0]!, 16);
    if (!size) {
      break;
    }
    chunks.push(raw.subarray(lineEnd + 2, lineEnd + 2 + size));
    position = lineEnd + 2 + size + 2;
  }
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function amzMeta(headers: Headers) {
  const meta: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (name.startsWith('x-amz-meta-')) {
      meta[name.slice('x-amz-meta-'.length)] = value;
    }
  });
  return meta;
}

function objectHeaders(object: R2Object) {
  const headers = new Headers({
    ETag: quote(object.etag),
    'Last-Modified': object.uploaded.toUTCString(),
    'Accept-Ranges': 'bytes',
    'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
  });
  for (const [name, value] of Object.entries(object.customMetadata ?? {})) {
    headers.set(`x-amz-meta-${name}`, value);
  }
  return headers;
}

/** A bodyless response with an explicit zero length, so clients never wait for a body. */
function empty(status: number, headers: Record<string, string> = {}) {
  return new Response(null, { status, headers: { ...headers, 'Content-Length': '0' } });
}

function xml(body: string, status = 200) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status,
    headers: { 'Content-Type': 'application/xml' },
  });
}

function s3Error(status: number, code: string, message: string) {
  return xml(`<Error><Code>${code}</Code><Message>${escapeXml(message)}</Message></Error>`, status);
}

const quote = (etag: string) => (etag.startsWith('"') ? etag : `"${etag}"`);
const unquote = (etag: string) => etag.replace(/^"|"$/g, '');
const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const unescapeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');

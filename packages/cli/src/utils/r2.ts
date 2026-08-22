import { createHmac, createHash } from 'node:crypto';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface R2HeadResult {
  etag: string;
  size: number;
}

export interface R2Object {
  key: string;
  size: number;
  etag?: string;
}

export interface R2MultipartPart {
  partNumber: number;
  etag: string;
}

function hmac(key: Uint8Array | string, data: string): Uint8Array {
  return createHmac('sha256', key).update(data).digest();
}

function hmacHex(key: Uint8Array | string, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function iso8601(date = new Date()): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function encodePathKey(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export function r2Host(config: R2Config): string {
  return `${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`;
}

interface SignedRequest {
  method: string;
  path: string;
  query?: string;
  headers?: Record<string, string>;
  payload?: Uint8Array;
  date?: Date;
}

function signRequest(req: SignedRequest, config: R2Config): { url: string; headers: Record<string, string> } {
  const now = req.date ?? new Date();
  const amzDate = iso8601(now);
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const host = r2Host(config);

  const payloadHash = req.payload
    ? sha256Hex(req.payload)
    : req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE'
      ? sha256Hex('')
      : 'UNSIGNED-PAYLOAD';

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(req.headers ?? {}),
  };

  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[k]}`)
    .join('\n');
  const signedHeaders = signedHeaderKeys.join(';');

  const canonicalUri = `/${encodePathKey(req.path)}`;
  const canonicalQuery = req.query ?? '';
  const canonicalRequest = [
    req.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    '',
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmacHex(kSigning, stringToSign);

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const queryStr = canonicalQuery ? `?${canonicalQuery}` : '';
  return {
    url: `https://${host}${canonicalUri}${queryStr}`,
    headers: { ...headers, Authorization: authorization },
  };
}

async function send(config: R2Config, req: SignedRequest, body?: Uint8Array): Promise<Response> {
  const { url, headers } = signRequest(req, config);
  return fetch(url, { method: req.method, headers, body: body ?? req.payload });
}

export async function r2Head(config: R2Config, key: string): Promise<R2HeadResult | null> {
  const res = await send(config, { method: 'HEAD', path: key });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD failed: ${res.status} ${await res.text()}`);
  const etag = res.headers.get('etag')?.replace(/"/g, '') ?? '';
  const size = Number(res.headers.get('content-length') ?? 0);
  return { etag, size };
}

export async function r2Put(config: R2Config, key: string, body: Uint8Array, contentType?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (contentType) headers['content-type'] = contentType;
  const res = await send(config, { method: 'PUT', path: key, headers, payload: body }, body);
  if (!res.ok) throw new Error(`R2 PUT failed: ${res.status} ${await res.text()}`);
}

export async function r2Delete(config: R2Config, key: string): Promise<void> {
  const res = await send(config, { method: 'DELETE', path: key });
  if (!res.ok) throw new Error(`R2 DELETE failed: ${res.status} ${await res.text()}`);
}

/** Fetch an object's bytes from R2 (null when the key does not exist). */
export async function r2Get(config: R2Config, key: string): Promise<Uint8Array | null> {
  const res = await send(config, { method: 'GET', path: key });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET failed: ${res.status} ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function r2List(config: R2Config, prefix: string): Promise<R2Object[]> {
  const res = await send(config, {
    method: 'GET',
    path: '',
    query: `list-type=2&prefix=${encodeURIComponent(prefix)}`,
  });
  if (!res.ok) throw new Error(`R2 LIST failed: ${res.status} ${await res.text()}`);
  const xml = await res.text();
  const keys: R2Object[] = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const key = /<Key>(.*?)<\/Key>/.exec(m[1])?.[1] ?? '';
    const size = Number(/<Size>(.*?)<\/Size>/.exec(m[1])?.[1] ?? 0);
    const etag = /<ETag>(.*?)<\/ETag>/.exec(m[1])?.[1]?.replace(/"/g, '');
    if (key) keys.push({ key, size, etag });
  }
  return keys;
}

export async function r2MultipartStart(config: R2Config, key: string): Promise<string> {
  const res = await send(config, { method: 'POST', path: key, query: 'uploads=' });
  if (!res.ok) throw new Error(`R2 multipart start failed: ${res.status} ${await res.text()}`);
  const xml = await res.text();
  const id = /<UploadId>(.*?)<\/UploadId>/.exec(xml)?.[1];
  if (!id) throw new Error('R2 multipart start: no UploadId in response');
  return id;
}

export async function r2MultipartPart(
  config: R2Config,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Uint8Array,
): Promise<string> {
  const res = await send(
    config,
    {
      method: 'PUT',
      path: key,
      query: `partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`,
      payload: body,
    },
    body,
  );
  if (!res.ok) throw new Error(`R2 multipart part ${partNumber} failed: ${res.status} ${await res.text()}`);
  return res.headers.get('etag')?.replace(/"/g, '') ?? '';
}

export async function r2MultipartComplete(
  config: R2Config,
  key: string,
  uploadId: string,
  parts: R2MultipartPart[],
): Promise<void> {
  const body = new TextEncoder().encode(
    `<CompleteMultipartUpload>${parts
      .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`)
      .join('')}</CompleteMultipartUpload>`,
  );
  const res = await send(
    config,
    {
      method: 'POST',
      path: key,
      query: `uploadId=${encodeURIComponent(uploadId)}`,
      headers: { 'content-type': 'application/xml' },
      payload: body,
    },
    body,
  );
  if (!res.ok) throw new Error(`R2 multipart complete failed: ${res.status} ${await res.text()}`);
}

export async function r2MultipartAbort(config: R2Config, key: string, uploadId: string): Promise<void> {
  const res = await send(config, {
    method: 'DELETE',
    path: key,
    query: `uploadId=${encodeURIComponent(uploadId)}`,
  });
  if (!res.ok) throw new Error(`R2 multipart abort failed: ${res.status} ${await res.text()}`);
}

export const R2_MULTIPART_THRESHOLD = 100 * 1024 * 1024;
export const R2_PART_SIZE = 64 * 1024 * 1024;

export async function r2UploadLarge(
  config: R2Config,
  key: string,
  body: Uint8Array,
  _contentType?: string,
): Promise<void> {
  const uploadId = await r2MultipartStart(config, key);
  try {
    const parts: R2MultipartPart[] = [];
    const total = body.byteLength;
    for (let start = 0, i = 1; start < total; start += R2_PART_SIZE, i++) {
      const chunk = body.subarray(start, Math.min(start + R2_PART_SIZE, total));
      const etag = await r2MultipartPart(config, key, uploadId, i, chunk);
      parts.push({ partNumber: i, etag });
    }
    await r2MultipartComplete(config, key, uploadId, parts);
  } catch (err) {
    await r2MultipartAbort(config, key, uploadId).catch(() => {});
    throw err;
  }
}
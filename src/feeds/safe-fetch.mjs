import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '../errors.mjs';

const MAX_BYTES = Number(process.env.MAX_FETCH_BYTES || 2 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);

function publicIp(address) {
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    return !(
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('::ffff:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('fec') ||
      normalized.startsWith('ff')
    );
  }
  const [a, b] = address.split('.').map(Number);
  const c = Number(address.split('.')[2]);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function isAllowedHost(hostname, domains = []) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return domains.some((domain) => {
    const allowed = domain.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

async function validate(url, domains) {
  const defaultPort = url.protocol === 'https:' ? '443' : '80';
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    (url.port && url.port !== defaultPort) ||
    url.username ||
    url.password ||
    !isAllowedHost(url.hostname, domains)
  )
    throw new AppError(
      'invalid_request',
      'URL must use an allowed feed domain and standard web port',
      400,
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) {
    if (!publicIp(hostname))
      throw new AppError('invalid_request', 'Private or reserved addresses are blocked', 400);
    return;
  }
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM')
      throw new AppError(
        'feed_unavailable',
        `Outbound network access to ${hostname} was denied while resolving DNS; allow the local Node.js process to use DNS and HTTPS`,
        502,
      );
    records = [];
  }
  if (!records.length) throw new AppError('feed_unavailable', 'Could not resolve feed host', 502);
  if (records.some(({ address }) => !publicIp(address)))
    throw new AppError('invalid_request', 'Private or reserved addresses are blocked', 400);
}

export async function safeFetch(input, domains, { allowTruncate = false } = {}) {
  let url = new URL(input);
  for (let hop = 0; hop <= 3; hop++) {
    await validate(url, domains);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'DailyPhrase/0.1 RSS reader',
          accept:
            'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8',
        },
      });
    } catch (error) {
      const reason = error.cause?.code || error.name || 'network error';
      const message =
        reason === 'EACCES' || reason === 'EPERM'
          ? `Outbound network access to ${url.hostname} was denied; allow the local Node.js process to connect over HTTPS`
          : ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_AUTHORITY_INVALID'].includes(reason)
            ? `TLS certificate verification failed for ${url.hostname}; start the app with the system CA store enabled`
            : `Feed request to ${url.hostname} failed (${reason})`;
      throw new AppError(
        error.name === 'AbortError' ? 'fetch_timeout' : 'feed_unavailable',
        message,
        error.name === 'AbortError' ? 504 : 502,
      );
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location || hop === 3)
        throw new AppError('feed_unavailable', 'Invalid or excessive redirects', 502);
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new AppError('feed_unavailable', `Feed returned HTTP ${res.status}`, 502);
    if (!allowTruncate && Number(res.headers.get('content-length') || 0) > MAX_BYTES)
      throw new AppError('feed_unavailable', 'Response exceeds size limit', 502);
    if (allowTruncate && res.body) {
      const reader = res.body.getReader();
      const chunks = [];
      let byteLength = 0;
      let truncated = false;
      try {
        while (byteLength < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          const remaining = MAX_BYTES - byteLength;
          const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
          chunks.push(chunk);
          byteLength += chunk.byteLength;
          if (chunk.byteLength !== value.byteLength) {
            truncated = true;
            break;
          }
        }
        if (!truncated && byteLength === MAX_BYTES) {
          const { done } = await reader.read();
          truncated = !done;
        }
      } finally {
        if (truncated) await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { text: new TextDecoder('utf-8').decode(bytes), url: url.href, truncated };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES)
      throw new AppError('feed_unavailable', 'Response exceeds size limit', 502);
    return { text: new TextDecoder('utf-8').decode(bytes), url: url.href };
  }
  throw new AppError('feed_unavailable', 'Feed request failed', 502);
}

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
  const records = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!records.length) throw new AppError('feed_unavailable', 'Could not resolve feed host', 502);
  if (records.some(({ address }) => !publicIp(address)))
    throw new AppError('invalid_request', 'Private or reserved addresses are blocked', 400);
}

export async function safeFetch(input, domains) {
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
      throw new AppError(
        error.name === 'AbortError' ? 'fetch_timeout' : 'feed_unavailable',
        `Feed request to ${url.hostname} failed (${reason})`,
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
    if (Number(res.headers.get('content-length') || 0) > MAX_BYTES)
      throw new AppError('feed_unavailable', 'Response exceeds size limit', 502);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES)
      throw new AppError('feed_unavailable', 'Response exceeds size limit', 502);
    return { text: new TextDecoder('utf-8').decode(bytes), url: url.href };
  }
  throw new AppError('feed_unavailable', 'Feed request failed', 502);
}

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir } from './config.mjs';
import { AppError } from './errors.mjs';

const tokenPath = path.join(rootDir, 'data/google-drive-auth.json');
const databaseName = 'daily-phrase-study.json';
const states = new Map();
const driveScope = 'https://www.googleapis.com/auth/drive.appdata';

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/drive/callback`;
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) };
}

async function readToken() {
  try {
    return JSON.parse(await readFile(tokenPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeToken(value) {
  await mkdir(path.dirname(tokenPath), { recursive: true });
  const temporary = `${tokenPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, tokenPath);
}

export async function googleDriveStatus() {
  const { configured } = credentials();
  const token = await readToken();
  return { configured, connected: Boolean(configured && token?.refresh_token) };
}

export function googleDriveAuthorizationUrl() {
  const config = credentials();
  if (!config.configured)
    throw new AppError('google_drive_not_configured', 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.', 503);
  const state = randomBytes(32).toString('hex');
  states.set(state, Date.now() + 10 * 60 * 1000);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: driveScope,
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();
  return url.href;
}

export async function finishGoogleDriveAuthorization({ code, state }) {
  const expectedExpiry = states.get(state);
  states.delete(state);
  if (!expectedExpiry || expectedExpiry < Date.now())
    throw new AppError('google_drive_auth_failed', 'Google Drive authorization expired. Please try connecting again.', 400);
  const config = credentials();
  const prior = await readToken();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token)
    throw new AppError('google_drive_auth_failed', tokens.error_description || 'Could not connect to Google Drive.', 502);
  await writeToken({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || prior?.refresh_token,
    expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000,
  });
}

async function accessToken() {
  const config = credentials();
  if (!config.configured)
    throw new AppError('google_drive_not_configured', 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.', 503);
  const token = await readToken();
  if (!token?.refresh_token)
    throw new AppError('google_drive_not_connected', 'Connect Google Drive before saving study records.', 401);
  if (token.expires_at > Date.now() + 60_000) return token.access_token;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const refreshed = await response.json();
  if (!response.ok || !refreshed.access_token)
    throw new AppError('google_drive_auth_failed', 'Google Drive authorization expired. Reconnect the account.', 401);
  await writeToken({ ...token, access_token: refreshed.access_token, expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000 });
  return refreshed.access_token;
}

async function driveFetch(url, options = {}) {
  const token = await accessToken();
  const response = await fetch(url, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new AppError('google_drive_error', `Google Drive request failed (${response.status}): ${detail.slice(0, 300)}`, 502);
  }
  return response;
}

async function findDatabaseFile() {
  const query = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${databaseName}' and trashed=false`,
    fields: 'files(id,name)',
  });
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${query}`);
  const { files = [] } = await response.json();
  return files[0] || null;
}

async function writeDatabase(file, data) {
  const body = JSON.stringify(data, null, 2);
  if (file) {
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    });
    return;
  }
  const boundary = `dailyphrase_${randomBytes(12).toString('hex')}`;
  const metadata = JSON.stringify({ name: databaseName, parents: ['appDataFolder'], mimeType: 'application/json' });
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n--${boundary}--`;
  await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
}

async function readDatabase() {
  const file = await findDatabaseFile();
  if (!file) return { file: null, data: { version: 1, records: [] } };
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
  const data = await response.json();
  if (data.version !== 1 || !Array.isArray(data.records))
    throw new AppError('google_drive_data_invalid', 'The Daily Phrase study file in Google Drive has an unsupported format.', 500);
  return { file, data };
}

export async function listDriveStudyRecords() {
  const { data } = await readDatabase();
  return data.records.sort((a, b) => b.studied_at.localeCompare(a.studied_at));
}

export async function saveDriveStudyRecord(input) {
  const { article, phrases } = input;
  if (!article || typeof article.id !== 'string' || typeof article.title !== 'string' ||
      typeof article.url !== 'string' || typeof article.language !== 'string' ||
      !Array.isArray(phrases) || phrases.length < 1 || phrases.length > 30 ||
      phrases.some((phrase) => typeof phrase.text !== 'string' || typeof phrase.meaning_ko !== 'string'))
    throw new AppError('invalid_request', 'An article and its extracted phrases are required.', 400);
  const { file, data } = await readDatabase();
  const record = {
    article: {
      id: article.id,
      feed_id: article.feed_id,
      feed_name: article.feed_name,
      language: article.language,
      title: article.title,
      title_translation_ko: typeof input.title_translation_ko === 'string' ? input.title_translation_ko : '',
      title_pinyin: typeof input.title_pinyin === 'string' ? input.title_pinyin : '',
      title_reading: typeof input.title_reading === 'string' ? input.title_reading : '',
      url: article.url,
      published_at: article.published_at || null,
    },
    phrases,
    studied_at: new Date().toISOString(),
  };
  const index = data.records.findIndex((item) => item.article?.id === article.id);
  if (index < 0) data.records.push(record);
  else data.records[index] = record;
  await writeDatabase(file, data);
  return record;
}

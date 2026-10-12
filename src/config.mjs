import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const readJson = async (name) =>
  JSON.parse(await readFile(path.join(rootDir, name), 'utf8'));

export async function getLanguages(requested) {
  const config = await readJson('config/languages.json');
  const codes = requested ?? config.default_languages;
  if (!Array.isArray(codes) || !codes.length || codes.some((code) => typeof code !== 'string'))
    throw Object.assign(new Error('languages must be a non-empty array'), {
      type: 'invalid_request',
      status: 400,
    });
  const unknown = codes.filter((code) => !config.languages[code]);
  if (unknown.length)
    throw Object.assign(new Error(`Unsupported language(s): ${unknown.join(', ')}`), {
      type: 'unsupported_language',
      status: 400,
      languages: Object.keys(config.languages),
    });
  return { config, codes: [...new Set(codes)] };
}

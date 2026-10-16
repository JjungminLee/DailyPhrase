import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { rootDir } from '../src/config.mjs';

const apiPort = process.env.PORT || '3000';
const uiPort = process.env.VITE_PORT || '5173';
const env = {
  ...process.env,
  PORT: apiPort,
  DAILY_PHRASE_LOCAL: '1',
  NODE_USE_SYSTEM_CA: '1',
};
let shuttingDown = false;
const children = [];

async function ensureLocalOllama() {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  let ollamaUrl;
  try {
    ollamaUrl = new URL(ollamaBaseUrl);
  } catch {
    console.warn(`Skipping Ollama auto-start: invalid OLLAMA_BASE_URL (${ollamaBaseUrl}).`);
    return;
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(ollamaUrl.hostname)) return;

  const versionUrl = new URL('/api/version', ollamaUrl);
  try {
    const response = await fetch(versionUrl, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      console.log(`Using Ollama at ${ollamaUrl.origin}.`);
      return;
    }
  } catch {
    // Start the local Ollama service below when the API is not reachable.
  }

  const ollamaHost = `${ollamaUrl.hostname}:${ollamaUrl.port || '11434'}`;
  let ollama;
  try {
    ollama = spawn('ollama', ['serve'], {
      cwd: rootDir,
      env: { ...env, OLLAMA_HOST: ollamaHost },
      stdio: 'inherit',
    });
  } catch (error) {
    throw new Error(`Could not start Ollama. Install Ollama and ensure its CLI is on PATH: ${error.message}`);
  }
  children.push(ollama);
  ollama.on('error', (error) => {
    console.error('Could not start Ollama:', error.message);
    stop(1);
  });
  ollama.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`Ollama stopped unexpectedly (exit ${code}).`);
      stop(code || 1);
    }
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (shuttingDown) process.exit(1);
    try {
      const response = await fetch(versionUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        console.log(`Started local Ollama at ${ollamaUrl.origin}.`);
        return;
      }
    } catch {
      // Ollama may still be starting.
    }
    await delay(250);
  }
  throw new Error(`Ollama did not become ready at ${ollamaUrl.origin}.`);
}

function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (!child.killed) child.kill();
  setTimeout(() => process.exit(code), 150).unref();
}

await ensureLocalOllama();

const api = spawn(
  process.execPath,
  ['--env-file-if-exists=.env', '--use-system-ca', 'src/local.mjs'],
  { cwd: rootDir, env, stdio: 'inherit' },
);
children.push(api);
api.on('error', (error) => {
  console.error('Could not start local API:', error.message);
  stop(1);
});
api.on('exit', (code) => {
  if (!shuttingDown) stop(code || 1);
});
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

let ready = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (shuttingDown) process.exit(1);
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    // The local API may not have started listening yet.
  }
  await delay(250);
}
if (!ready) {
  console.error('Local API did not become ready.');
  stop(1);
}

const vite = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--configLoader',
    'native',
    '--host',
    '127.0.0.1',
    '--port',
    uiPort,
    '--strictPort',
  ],
  { cwd: rootDir, env, stdio: 'inherit' },
);
children.push(vite);
vite.on('error', (error) => {
  console.error('Could not start Vite:', error.message);
  stop(1);
});
vite.on('exit', (code) => {
  if (!shuttingDown) stop(code || 1);
});
console.log(`Daily Phrase UI:  http://localhost:${uiPort}`);
console.log(`Daily Phrase API: http://localhost:${apiPort}/api/health`);

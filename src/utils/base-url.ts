import { join } from 'path';
import { glob } from 'glob';
import { readTextFile } from './project.js';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local', '.flaskenv'];
const SOURCE_GLOBS = ['**/*.{js,ts,jsx,tsx,py,go}', 'package.json'];
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
];

export async function detectBaseUrl(projectDir: string): Promise<string> {
  return detectFromEnv(projectDir)
    ?? await detectFromSource(projectDir)
    ?? DEFAULT_BASE_URL;
}

function detectFromEnv(projectDir: string): string | null {
  for (const file of ENV_FILES) {
    const content = readTextFile(join(projectDir, file));
    if (!content) continue;

    const fullUrl = matchFirst(content, [
      /^\s*(?:BASE_URL|API_URL|SERVER_URL|APP_URL)\s*=\s*["']?([^"'\s]+)["']?\s*$/im,
    ]);
    if (fullUrl) return normalizeBaseUrl(fullUrl);

    const port = matchFirst(content, [
      /^\s*(?:PORT|SERVER_PORT|APP_PORT)\s*=\s*["']?(\d{2,5})["']?\s*$/im,
    ]);
    if (port) {
      const host = matchFirst(content, [
        /^\s*(?:HOST|HOSTNAME)\s*=\s*["']?([^"'\s]+)["']?\s*$/im,
      ]);
      return fromHostAndPort(host, port);
    }
  }

  return null;
}

async function detectFromSource(projectDir: string): Promise<string | null> {
  for (const sourceGlob of SOURCE_GLOBS) {
    const files = await glob(join(projectDir, sourceGlob).replace(/\\/g, '/'), { ignore: IGNORE_PATTERNS });

    for (const file of files) {
      const content = readTextFile(file);
      if (!content) continue;

      const url = matchFirst(content, [
        /\b(?:BASE_URL|API_URL|SERVER_URL|APP_URL)\s*[:=]\s*['"`](https?:\/\/[^'"`]+)['"`]/i,
      ]);
      if (url) return normalizeBaseUrl(url);

      const port = matchFirst(content, [
        /\b(?:app|server)\.listen\s*\(\s*(\d{2,5})/i,
        /\blisten\s*\(\s*(?:process\.env\.PORT\s*\|\|\s*)?(\d{2,5})/i,
        /\bPORT\s*=\s*(\d{2,5})/i,
        /\b--port\s+(\d{2,5})/i,
        /\b(?:flask\s+run|uvicorn\s+[\w:.]+)\s+.*--port\s+(\d{2,5})/i,
        /\bapp\.run\s*\([^)]*port\s*=\s*(\d{2,5})/i,
        /\buvicorn\.run\s*\([^)]*port\s*=\s*(\d{2,5})/i,
        /\bRun\s*\(\s*["'`]:?(\d{2,5})["'`]\s*\)/,
      ]);
      if (port) return fromHostAndPort(null, port);
    }
  }

  return null;
}

function matchFirst(content: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function fromHostAndPort(host: string | null, port: string): string {
  const normalizedHost = normalizeHost(host);
  return `http://${normalizedHost}:${port}`;
}

function normalizeHost(host: string | null): string {
  if (!host || host === '0.0.0.0' || host === '::') return 'localhost';
  return host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

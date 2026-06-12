import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
];

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export function readTextFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;

  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function hasNodeDependency(projectDir: string, dependencyName: string): boolean {
  const content = readTextFile(join(projectDir, 'package.json'));
  if (!content) return false;

  try {
    const pkg = JSON.parse(content) as PackageJson;
    return [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
      pkg.optionalDependencies,
    ].some(dependencies => Boolean(dependencies?.[dependencyName]));
  } catch {
    return false;
  }
}

export function hasPythonDependency(projectDir: string, dependencyName: string): boolean {
  const dependencyPattern = new RegExp(`(^|[^a-z0-9_-])${escapeRegExp(dependencyName)}([^a-z0-9_-]|$)`, 'i');
  const files = ['requirements.txt', 'Pipfile', 'pyproject.toml'];

  return files.some(file => {
    const content = readTextFile(join(projectDir, file));
    return content ? dependencyPattern.test(content) : false;
  });
}

export function fileContains(projectDir: string, relativePath: string, patterns: RegExp[]): boolean {
  const content = readTextFile(join(projectDir, relativePath));
  return content ? matchesAny(content, patterns) : false;
}

export async function projectContains(projectDir: string, pattern: string, patterns: RegExp[]): Promise<boolean> {
  const files = await glob(join(projectDir, pattern).replace(/\\/g, '/'), { ignore: DEFAULT_IGNORES });

  for (const file of files) {
    const content = readTextFile(file);
    if (content && matchesAny(content, patterns)) return true;
  }

  return false;
}

function matchesAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

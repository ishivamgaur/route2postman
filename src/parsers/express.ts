import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { glob } from 'glob';
import { RouteParser, RouteInfo } from '../types.js';
import { enrichRoute, extractCallExpression, inferExpressLikeEnrichment } from '../utils/inference.js';

function findEntryFile(projectDir: string): string | null {
  const pkgPath = join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.main) {
        const candidate = join(projectDir, pkg.main);
        if (existsSync(candidate)) return candidate;
      }
    } catch { /* ignore */ }
  }
  for (const name of ['index.js', 'app.js', 'server.js', 'src/index.js', 'src/app.js']) {
    const candidate = join(projectDir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function parseImports(content: string, entryDir: string): Map<string, string> {
  const imports = new Map<string, string>();

  const esmPattern = /import\s+(?:\{\s*[^}]*\s*\})?\s*(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = esmPattern.exec(content)) !== null) {
    const varName = match[1];
    let modulePath = match[2];
    if (modulePath.startsWith('.')) {
      modulePath = resolveModulePath(entryDir, modulePath);
      imports.set(varName, modulePath);
    }
  }

  const cjsPattern = /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsPattern.exec(content)) !== null) {
    const varName = match[1];
    let modulePath = match[2];
    if (modulePath.startsWith('.')) {
      modulePath = resolveModulePath(entryDir, modulePath);
      imports.set(varName, modulePath);
    }
  }

  return imports;
}

function resolveModulePath(baseDir: string, modulePath: string): string {
  let resolved = join(baseDir, modulePath);
  if (existsSync(resolved) && !resolved.endsWith('.js') && !resolved.endsWith('.ts')) {
    resolved = resolved;
  }
  if (!existsSync(resolved)) {
    const withJs = resolved + '.js';
    if (existsSync(withJs)) return withJs;
    const withTs = resolved + '.ts';
    if (existsSync(withTs)) return withTs;
    const indexJs = join(resolved, 'index.js');
    if (existsSync(indexJs)) return indexJs;
    const indexTs = join(resolved, 'index.ts');
    if (existsSync(indexTs)) return indexTs;
  }
  return resolved;
}

function parseMounts(content: string): Map<string, string> {
  const mounts = new Map<string, string>();
  const usePattern = /app\.use\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g;
  let match;
  while ((match = usePattern.exec(content)) !== null) {
    mounts.set(match[2], match[1]);
  }
  return mounts;
}

function resolveRoutesInFile(filePath: string, basePath: string): RouteInfo[] {
  const seen = new Set<string>();
  const routes: RouteInfo[] = [];
  try {
    const content = readFileSync(filePath, 'utf-8');
    const routePattern = /(?:app|router|route)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      let relPath = match[2];

      if (relPath.includes('${')) {
        relPath = relPath.replace(/\$\{[^}]+\}/g, ':param');
      }

      const fullPath = normalizePath(basePath, relPath);
      const key = `${method}:${fullPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        const callSource = extractCallExpression(content, match.index);
        routes.push(enrichRoute(
          { method, path: fullPath },
          inferExpressLikeEnrichment(callSource),
        ));
      }
    }
  } catch { /* ignore */ }
  return routes;
}

function normalizePath(base: string, rel: string): string {
  if (!base) return rel.startsWith('/') ? rel : '/' + rel;
  const baseClean = base.replace(/\/+$/, '');
  if (!rel.startsWith('/')) rel = '/' + rel;
  if (rel === '/') return baseClean || '/';
  return baseClean + rel;
}

export const expressParser: RouteParser = {
  name: 'Express.js',
  async parse(projectDir: string): Promise<RouteInfo[]> {
    const allRoutes = new Map<string, RouteInfo>();

    const entryFile = findEntryFile(projectDir);

    if (!entryFile) {
      const pattern = join(projectDir, '**/*.{js,ts}').replace(/\\/g, '/');
      const files = await glob(pattern, { ignore: '**/node_modules/**' });
      for (const file of files) {
        if (file.includes('node_modules')) continue;
        for (const r of resolveRoutesInFile(file, '')) {
          const key = `${r.method}:${r.path}`;
          if (!allRoutes.has(key)) allRoutes.set(key, r);
        }
      }
      return [...allRoutes.values()];
    }

    const entryContent = readFileSync(entryFile, 'utf-8');
    const entryDir = dirname(entryFile);

    const imports = parseImports(entryContent, entryDir);
    const mountVarToPrefix = parseMounts(entryContent);

    for (const [varName, filePath] of imports) {
      if (existsSync(filePath) && mountVarToPrefix.has(varName)) {
        const prefix = mountVarToPrefix.get(varName)!;
        const fileRoutes = resolveRoutesInFile(filePath, prefix);
        for (const r of fileRoutes) {
          const key = `${r.method}:${r.path}`;
          if (!allRoutes.has(key)) allRoutes.set(key, r);
        }
      }
    }

    const entryRoutes = resolveRoutesInFile(entryFile, '');
    for (const r of entryRoutes) {
      const key = `${r.method}:${r.path}`;
      if (!allRoutes.has(key)) allRoutes.set(key, r);
    }

    return [...allRoutes.values()].sort((a, b) => a.path.localeCompare(b.path));
  },
};

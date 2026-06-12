import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { glob } from 'glob';
import { RouteParser, RouteInfo } from '../types.js';
import { enrichRoute, extractCallExpression, inferExpressLikeEnrichment, splitTopLevel } from '../utils/inference.js';

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

  const namedEsmPattern = /import\s+\{\s*([^}]+)\s*}\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = namedEsmPattern.exec(content)) !== null) {
    const modulePath = resolveImportPath(entryDir, match[2]);
    if (!modulePath) continue;

    for (const specifier of splitTopLevel(match[1])) {
      const [importedName, localName] = specifier.split(/\s+as\s+/).map(part => part.trim());
      imports.set(localName || importedName, modulePath);
    }
  }

  const esmPattern = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = esmPattern.exec(content)) !== null) {
    const varName = match[1];
    const modulePath = resolveImportPath(entryDir, match[2]);
    if (modulePath) imports.set(varName, modulePath);
  }

  const cjsPattern = /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsPattern.exec(content)) !== null) {
    const varName = match[1];
    const modulePath = resolveImportPath(entryDir, match[2]);
    if (modulePath) imports.set(varName, modulePath);
  }

  const destructuredCjsPattern = /(?:const|let|var)\s+\{\s*([^}]+)\s*}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = destructuredCjsPattern.exec(content)) !== null) {
    const modulePath = resolveImportPath(entryDir, match[2]);
    if (!modulePath) continue;

    for (const specifier of splitTopLevel(match[1])) {
      const [importedName, localName] = specifier.split(/\s*:\s*/).map(part => part.trim());
      imports.set(localName || importedName, modulePath);
    }
  }

  return imports;
}

function resolveImportPath(baseDir: string, modulePath: string): string | null {
  return modulePath.startsWith('.') ? resolveModulePath(baseDir, modulePath) : null;
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
    const imports = parseImports(content, dirname(filePath));
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
        const handlerSource = resolveHandlerSources(content, imports, callSource);
        routes.push(enrichRoute(
          { method, path: fullPath },
          inferExpressLikeEnrichment(`${callSource}\n${handlerSource}`),
        ));
      }
    }
  } catch { /* ignore */ }
  return routes;
}

function resolveHandlerSources(content: string, imports: Map<string, string>, callSource: string): string {
  const sources: string[] = [];
  const handlerRefs = extractHandlerReferences(callSource);

  for (const handlerRef of handlerRefs) {
    const [objectName, memberName] = handlerRef.split('.');
    const importedFile = imports.get(objectName);

    if (memberName && importedFile && existsSync(importedFile)) {
      const importedContent = readFileSync(importedFile, 'utf-8');
      const source = findFunctionSource(importedContent, memberName);
      if (source) sources.push(source);
      continue;
    }

    const localSource = findFunctionSource(content, objectName);
    if (localSource) {
      sources.push(localSource);
      continue;
    }

    if (importedFile && existsSync(importedFile)) {
      const importedContent = readFileSync(importedFile, 'utf-8');
      const source = findFunctionSource(importedContent, objectName) ?? importedContent;
      sources.push(source);
    }
  }

  return sources.join('\n');
}

function extractHandlerReferences(callSource: string): string[] {
  const args = splitTopLevel(callSource.slice(callSource.indexOf('(') + 1, callSource.lastIndexOf(')')));
  const handlerArgs = args.slice(1).join(',');
  const refs = new Set<string>();
  const refPattern = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\b/g;
  const ignored = new Set(['req', 'res', 'next', 'async', 'function', 'return', 'true', 'false', 'null', 'undefined']);

  let match;
  while ((match = refPattern.exec(handlerArgs)) !== null) {
    const ref = match[1];
    const root = ref.split('.')[0];
    if (!ignored.has(root) && !ref.startsWith('req.') && !ref.startsWith('res.')) refs.add(ref);
  }

  return [...refs];
}

function findFunctionSource(content: string, functionName: string): string | null {
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(functionName)}\\s*\\(`),
    new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${escapeRegExp(functionName)}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`),
    new RegExp(`(?:exports|module\\.exports)\\.${escapeRegExp(functionName)}\\s*=\\s*(?:async\\s*)?(?:function\\s*)?\\(?`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match) return content.slice(match.index, match.index + 3000);
  }

  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

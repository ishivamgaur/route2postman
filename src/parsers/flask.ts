import { readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { RouteParser, RouteInfo } from '../types.js';
import { enrichRoute, inferFlaskEnrichment } from '../utils/inference.js';
import { DEFAULT_IGNORES, sortRoutes } from '../utils/project.js';

const ROUTE_PATTERN = /@(?:app|bp|blueprint)\.route\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*methods\s*=\s*\[([^\]]*)\])?/gi;

export const flaskParser: RouteParser = {
  name: 'Flask',
  async parse(projectDir: string): Promise<RouteInfo[]> {
    const seen = new Set<string>();
    const routes: RouteInfo[] = [];
    const pattern = join(projectDir, '**/*.py').replace(/\\/g, '/');
    const files = await glob(pattern, { ignore: DEFAULT_IGNORES });

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        let match;
        while ((match = ROUTE_PATTERN.exec(content)) !== null) {
          let path = match[1];
          if (!path.startsWith('/')) path = '/' + path;

          const methodsStr = match[2];
          const methods: string[] = [];

          if (methodsStr) {
            let m;
            const methodsRegex = /['"](GET|POST|PUT|DELETE|PATCH|OPTIONS)['"]/gi;
            while ((m = methodsRegex.exec(methodsStr)) !== null) {
              methods.push(m[1]);
            }
          }

          if (methods.length === 0) {
            methods.push('GET');
          }

          for (const method of methods) {
            const key = `${method.toUpperCase()}:${path}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const handlerSource = extractPythonFunctionAfter(content, match.index);
            routes.push(enrichRoute(
              { method: method.toUpperCase(), path },
              inferFlaskEnrichment(handlerSource),
            ));
          }
        }
      } catch { /* ignore */ }
    }

    return sortRoutes(routes);
  },
};

function extractPythonFunctionAfter(content: string, startIndex: number): string {
  const functionMatch = /\ndef\s+\w+\s*\([^)]*\)\s*:/.exec(content.slice(startIndex));
  if (!functionMatch) return content.slice(startIndex, startIndex + 1200);

  const functionStart = startIndex + functionMatch.index + 1;
  const rest = content.slice(functionStart);
  const lines = rest.split(/\r?\n/);
  const collected: string[] = [];

  for (const line of lines) {
    if (collected.length > 0 && /^\S/.test(line) && !line.startsWith('@')) break;
    collected.push(line);
  }

  return collected.join('\n');
}

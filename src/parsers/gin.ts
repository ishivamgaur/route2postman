import { readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { RouteParser, RouteInfo } from '../types.js';
import { enrichRoute, extractCallExpression, inferGinEnrichment } from '../utils/inference.js';
import { DEFAULT_IGNORES, sortRoutes } from '../utils/project.js';

const ROUTE_PATTERN = /(?:r|router|engine)\.(GET|POST|PUT|DELETE|PATCH|OPTIONS)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

export const ginParser: RouteParser = {
  name: 'Gin',
  async parse(projectDir: string): Promise<RouteInfo[]> {
    const seen = new Set<string>();
    const routes: RouteInfo[] = [];
    const pattern = join(projectDir, '**/*.go').replace(/\\/g, '/');
    const files = await glob(pattern, { ignore: DEFAULT_IGNORES });

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        let match;
        while ((match = ROUTE_PATTERN.exec(content)) !== null) {
          const method = match[1].toUpperCase();
          let path = match[2];
          if (!path.startsWith('/')) path = '/' + path;
          const key = `${method}:${path}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const callSource = extractCallExpression(content, match.index);
          routes.push(enrichRoute(
            { method, path },
            inferGinEnrichment(callSource),
          ));
        }
      } catch { /* ignore */ }
    }

    return sortRoutes(routes);
  },
};

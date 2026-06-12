import { readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { RouteParser, RouteInfo } from '../types.js';
import { enrichRoute, extractCallExpression, inferHonoEnrichment } from '../utils/inference.js';

const ROUTE_PATTERN = /app\.(get|post|put|delete|patch|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

export const honoParser: RouteParser = {
  name: 'Hono',
  async parse(projectDir: string): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];
    const pattern = join(projectDir, '**/*.{js,ts,jsx,tsx}').replace(/\\/g, '/');
    const files = await glob(pattern, { ignore: '**/node_modules/**' });

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        let match;
        while ((match = ROUTE_PATTERN.exec(content)) !== null) {
          const method = match[1].toUpperCase();
          let path = match[2];
          if (!path.startsWith('/')) path = '/' + path;
          const callSource = extractCallExpression(content, match.index);
          routes.push(enrichRoute(
            { method, path },
            inferHonoEnrichment(callSource, method),
          ));
        }
      } catch { /* ignore */ }
    }

    return routes;
  },
};

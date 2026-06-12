import { readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { RouteParser, RouteInfo } from '../types.js';
import { enrichRoute } from '../utils/inference.js';
import { DEFAULT_IGNORES, sortRoutes } from '../utils/project.js';

const URL_PATTERNS = [
  /path\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:[^,]+,\s*)?(?:views\.\w+\s*(?:\.as_view\(\))?)/gi,
  /re_path\s*\(\s*['"]([^'"]+)['"]/gi,
  /path\s*\(\s*['"]([^'"]+)['"]\s*,\s*include\s*\(/gi,
];

export const djangoParser: RouteParser = {
  name: 'Django',
  async parse(projectDir: string): Promise<RouteInfo[]> {
    const seen = new Set<string>();
    const routes: RouteInfo[] = [];
    const pattern = join(projectDir, '**/urls.py').replace(/\\/g, '/');
    const files = await glob(pattern, { ignore: DEFAULT_IGNORES });

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        for (const regex of URL_PATTERNS) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            let path = match[1];
            if (path.endsWith('/') && path !== '/') path = path.slice(0, -1);
            if (!path.startsWith('/')) path = '/' + path;
            const key = `GET:${path}`;
            if (seen.has(key)) continue;
            seen.add(key);
            routes.push(enrichRoute({ method: 'GET', path, name: 'Django view' }));
          }
        }
      } catch { /* ignore */ }
    }

    return sortRoutes(routes);
  },
};

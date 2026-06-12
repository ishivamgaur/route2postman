import { FrameworkDetector } from '../types.js';
import { hasNodeDependency, projectContains } from '../utils/project.js';

const HONO_SIGNATURES = [
  /\bfrom\s+['"]hono['"]/,
  /\brequire\s*\(\s*['"]hono['"]\s*\)/,
  /\bnew\s+Hono\s*\(/,
];

export const honoDetector: FrameworkDetector = {
  name: 'Hono',
  async detect(projectDir: string): Promise<number> {
    if (hasNodeDependency(projectDir, 'hono')) return 90;

    if (await projectContains(projectDir, '**/*.{js,ts,jsx,tsx}', HONO_SIGNATURES)) {
      return 70;
    }

    return 0;
  },
};

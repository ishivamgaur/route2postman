import { FrameworkDetector } from '../types.js';
import { hasNodeDependency, projectContains } from '../utils/project.js';

const EXPRESS_SIGNATURES = [
  /\bfrom\s+['"]express['"]/,
  /\brequire\s*\(\s*['"]express['"]\s*\)/,
  /\bexpress\s*\(/,
  /\bexpress\.Router\s*\(/,
];

export const expressDetector: FrameworkDetector = {
  name: 'Express.js',
  async detect(projectDir: string): Promise<number> {
    if (hasNodeDependency(projectDir, 'express')) return 90;

    if (await projectContains(projectDir, '**/*.{js,ts,jsx,tsx}', EXPRESS_SIGNATURES)) {
      return 70;
    }

    return 0;
  },
};

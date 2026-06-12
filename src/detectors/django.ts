import { existsSync } from 'fs';
import { join } from 'path';
import { FrameworkDetector } from '../types.js';
import { hasPythonDependency, projectContains } from '../utils/project.js';

const DJANGO_SIGNATURES = [
  /\bfrom\s+django\./,
  /\bdjango\.urls\b/,
  /\burlpatterns\s*=/,
  /\bpath\s*\(/,
];

export const djangoDetector: FrameworkDetector = {
  name: 'Django',
  async detect(projectDir: string): Promise<number> {
    if (hasPythonDependency(projectDir, 'django')) return 90;
    if (existsSync(join(projectDir, 'manage.py'))) return 75;

    if (await projectContains(projectDir, '**/urls.py', DJANGO_SIGNATURES)) {
      return 70;
    }

    return 0;
  },
};

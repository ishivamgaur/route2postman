import { FrameworkDetector } from '../types.js';
import { hasPythonDependency, projectContains } from '../utils/project.js';

const FLASK_SIGNATURES = [
  /\bfrom\s+flask\s+import\s+.*\b(?:Flask|Blueprint)\b/,
  /\bFlask\s*\(\s*__name__\s*\)/,
  /@(?:app|bp|blueprint)\.route\s*\(/,
];

export const flaskDetector: FrameworkDetector = {
  name: 'Flask',
  async detect(projectDir: string): Promise<number> {
    if (hasPythonDependency(projectDir, 'flask')) return 90;

    if (await projectContains(projectDir, '**/*.py', FLASK_SIGNATURES)) {
      return 70;
    }

    return 0;
  },
};

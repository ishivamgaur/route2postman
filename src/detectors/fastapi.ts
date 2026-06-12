import { FrameworkDetector } from '../types.js';
import { hasPythonDependency, projectContains } from '../utils/project.js';

const FASTAPI_SIGNATURES = [
  /\bfrom\s+fastapi\s+import\s+.*\b(?:FastAPI|APIRouter)\b/,
  /\bFastAPI\s*\(/,
  /@(?:app|router)\.(?:get|post|put|delete|patch|options)\s*\(/,
];

export const fastapiDetector: FrameworkDetector = {
  name: 'FastAPI',
  async detect(projectDir: string): Promise<number> {
    if (hasPythonDependency(projectDir, 'fastapi')) return 90;

    if (await projectContains(projectDir, '**/*.py', FASTAPI_SIGNATURES)) {
      return 70;
    }

    return 0;
  },
};

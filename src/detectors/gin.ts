import { FrameworkDetector } from '../types.js';
import { fileContains, projectContains } from '../utils/project.js';

const GIN_DEPENDENCY_SIGNATURES = [/github\.com\/gin-gonic\/gin/i];
const GIN_CODE_SIGNATURES = [
  /github\.com\/gin-gonic\/gin/,
  /\bgin\.(?:Default|New)\s*\(/,
  /\b(?:r|router|engine)\.(?:GET|POST|PUT|DELETE|PATCH|OPTIONS)\s*\(/,
];

export const ginDetector: FrameworkDetector = {
  name: 'Gin',
  async detect(projectDir: string): Promise<number> {
    if (fileContains(projectDir, 'go.mod', GIN_DEPENDENCY_SIGNATURES)) return 90;

    if (await projectContains(projectDir, '**/*.go', GIN_CODE_SIGNATURES)) {
      return 70;
    }

    return 0;
  },
};

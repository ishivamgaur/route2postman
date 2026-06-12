import { FrameworkDetector, DetectedFramework, RouteParser } from '../types.js';
import { expressDetector } from './express.js';
import { fastapiDetector } from './fastapi.js';
import { flaskDetector } from './flask.js';
import { djangoDetector } from './django.js';
import { honoDetector } from './hono.js';
import { ginDetector } from './gin.js';
import { expressParser } from '../parsers/express.js';
import { fastapiParser } from '../parsers/fastapi.js';
import { flaskParser } from '../parsers/flask.js';
import { djangoParser } from '../parsers/django.js';
import { honoParser } from '../parsers/hono.js';
import { ginParser } from '../parsers/gin.js';

const detectors: { detector: FrameworkDetector; parser: RouteParser }[] = [
  { detector: expressDetector, parser: expressParser },
  { detector: fastapiDetector, parser: fastapiParser },
  { detector: flaskDetector, parser: flaskParser },
  { detector: djangoDetector, parser: djangoParser },
  { detector: honoDetector, parser: honoParser },
  { detector: ginDetector, parser: ginParser },
];

export function listSupportedFrameworks(): string[] {
  return detectors.map(({ detector }) => detector.name);
}

export function getFrameworkByName(name: string): DetectedFramework | null {
  const normalizedName = normalizeFrameworkName(name);
  const match = detectors.find(({ detector }) => normalizeFrameworkName(detector.name) === normalizedName);

  if (!match) return null;

  return {
    name: match.detector.name,
    confidence: 100,
    parser: match.parser,
  };
}

export async function detectFramework(projectDir: string): Promise<DetectedFramework | null> {
  const results: DetectedFramework[] = [];

  for (const { detector, parser } of detectors) {
    const confidence = await detector.detect(projectDir);
    if (confidence > 0) {
      results.push({ name: detector.name, confidence, parser });
    }
  }

  if (results.length === 0) return null;
  results.sort((a, b) => b.confidence - a.confidence);
  return results[0];
}

function normalizeFrameworkName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

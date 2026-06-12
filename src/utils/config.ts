import { join } from 'path';
import { readTextFile } from './project.js';
import type { RouteGroupingMode } from './grouping.js';

export interface Route2PostmanConfig {
  collectionName?: string;
  baseUrl?: string;
  output?: string;
  framework?: string;
  grouping?: RouteGroupingMode;
  groups?: Record<string, string[]>;
}

const CONFIG_FILES = ['route2postman.config.json', '.route2postmanrc.json'];

export function loadRoute2PostmanConfig(projectDir: string): Route2PostmanConfig {
  for (const file of CONFIG_FILES) {
    const content = readTextFile(join(projectDir, file));
    if (!content) continue;

    try {
      return normalizeConfig(JSON.parse(content) as Route2PostmanConfig);
    } catch {
      console.warn(`  Ignoring invalid config file: ${file}`);
    }
  }

  return {};
}

function normalizeConfig(config: Route2PostmanConfig): Route2PostmanConfig {
  return {
    collectionName: readString(config.collectionName),
    baseUrl: readString(config.baseUrl),
    output: readString(config.output),
    framework: readString(config.framework),
    grouping: readGroupingMode(config.grouping),
    groups: readGroups(config.groups),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readGroups(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const groups: Record<string, string[]> = {};
  for (const [name, patterns] of Object.entries(value)) {
    if (!Array.isArray(patterns)) continue;

    const cleanPatterns = patterns
      .filter((pattern): pattern is string => typeof pattern === 'string')
      .map(pattern => pattern.trim())
      .filter(Boolean);

    if (name.trim() && cleanPatterns.length > 0) {
      groups[name.trim()] = cleanPatterns;
    }
  }

  return Object.keys(groups).length > 0 ? groups : undefined;
}

function readGroupingMode(value: unknown): RouteGroupingMode | undefined {
  if (value === 'path' || value === 'smart' || value === 'none') return value;
  return undefined;
}

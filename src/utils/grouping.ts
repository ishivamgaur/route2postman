import { RouteInfo } from '../types.js';

export type RouteGroupingMode = 'path' | 'smart' | 'none';

interface AssignRouteGroupOptions {
  customGroups?: Record<string, string[]>;
  mode?: RouteGroupingMode;
}

const TECHNICAL_PREFIXES = new Set(['api', 'apis', 'rest', 'graphql', 'rpc']);
const VERSION_SEGMENT = /^v\d+$/i;

export function assignRouteGroups(
  routes: RouteInfo[],
  options: AssignRouteGroupOptions = {},
): RouteInfo[] {
  const mode = options.mode ?? 'path';
  const customGroups = options.customGroups ?? {};

  return routes.map(route => {
    if (mode === 'none') {
      return { ...route, group: null };
    }

    const customGroup = findGroup(route.path, customGroups);
    if (customGroup) return { ...route, group: customGroup };

    if (route.group) return route;

    return {
      ...route,
      group: mode === 'smart' ? groupFromMeaningfulPath(route.path) : groupFromPath(route.path),
    };
  });
}

function findGroup(path: string, groups: Record<string, string[]>): string | null {
  for (const [group, patterns] of Object.entries(groups)) {
    if (patterns.some(pattern => matchesPattern(path, pattern))) return group;
  }

  return null;
}

function matchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);

  if (normalizedPattern.includes('*')) {
    return wildcardToRegExp(normalizedPattern).test(normalizedPath);
  }

  if (normalizedPattern.includes(':')) {
    return paramPatternToRegExp(normalizedPattern).test(normalizedPath);
  }

  return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

function groupFromPath(path: string): string {
  const firstSegment = normalizePath(path).split('/').filter(Boolean)[0];
  if (!firstSegment || firstSegment.startsWith(':')) return 'General';

  return titleCase(firstSegment);
}

function groupFromMeaningfulPath(path: string): string {
  const meaningfulSegment = normalizePath(path)
    .split('/')
    .filter(Boolean)
    .find(segment => !isTechnicalSegment(segment) && !segment.startsWith(':'));

  return meaningfulSegment ? titleCase(meaningfulSegment) : groupFromPath(path);
}

function isTechnicalSegment(segment: string): boolean {
  return TECHNICAL_PREFIXES.has(segment) || VERSION_SEGMENT.test(segment);
}

function normalizePath(path: string): string {
  const normalized = path.trim().toLowerCase();
  return normalized.startsWith('/') ? normalized.replace(/\/+$/, '') || '/' : `/${normalized.replace(/\/+$/, '')}`;
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = escapeRegExp(pattern).replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function paramPatternToRegExp(pattern: string): RegExp {
  const escaped = escapeRegExp(pattern).replace(/:[a-z_][a-z0-9_]*/gi, '[^/]+');
  return new RegExp(`^${escaped}(?:/.*)?$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

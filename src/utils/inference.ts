import { RouteInfo } from '../types.js';

export interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
}

export interface RouteEnrichment {
  params?: FieldInfo[];
  queryParams?: FieldInfo[];
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  description?: string;
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const AUTH_HEADER_NAMES = new Set(['authorization', 'x-api-key', 'api-key']);

export function enrichRoute(route: RouteInfo, enrichment: RouteEnrichment = {}): RouteInfo {
  const headers = { ...enrichment.headers };
  const body = enrichment.body ?? createDefaultBody(route.method);
  const auth = Boolean(enrichment.auth);

  if (body !== undefined && !hasHeader(headers, 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth && !hasAnyHeader(headers, [...AUTH_HEADER_NAMES])) {
    headers.Authorization = 'Bearer {{token}}';
  }

  return {
    ...route,
    params: dedupeFields([...inferPathParams(route.path), ...(enrichment.params ?? [])]),
    queryParams: dedupeFields(enrichment.queryParams ?? []),
    body,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    auth,
    description: enrichment.description ?? buildRouteDescription(route, enrichment),
  };
}

export function inferPathParams(path: string): FieldInfo[] {
  const params: FieldInfo[] = [];

  for (const match of path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)) {
    params.push(toField(match[1]));
  }

  for (const match of path.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)(?::[^}]+)?}/g)) {
    params.push(toField(match[1]));
  }

  for (const match of path.matchAll(/<(?:(int|str|slug|uuid|path):)?([A-Za-z_][A-Za-z0-9_]*)>/g)) {
    params.push(toField(match[2], toCommonType(match[1])));
  }

  return dedupeFields(params);
}

export function inferAuthFromText(text: string): boolean {
  return /\b(auth|authenticate|authorization|bearer|jwt|token|passport|requireAuth|verifyToken|isAuthenticated|login_required|permission_classes)\b/i
    .test(text);
}

export function inferExpressLikeEnrichment(handlerSource: string, method: string): RouteEnrichment {
  const bodyFields = [
    ...fieldsFromMemberAccess(handlerSource, /\breq\.body\.([A-Za-z_][A-Za-z0-9_]*)/g),
    ...fieldsFromStringAccess(handlerSource, /\breq\.body\[['"`]([^'"`]+)['"`]\]/g),
    ...fieldsFromDestructure(handlerSource, /\b(?:const|let|var)\s+\{([^}]+)}\s*=\s*req\.body/g),
  ];
  const queryParams = [
    ...fieldsFromMemberAccess(handlerSource, /\breq\.query\.([A-Za-z_][A-Za-z0-9_]*)/g),
    ...fieldsFromStringAccess(handlerSource, /\breq\.query\[['"`]([^'"`]+)['"`]\]/g),
    ...fieldsFromDestructure(handlerSource, /\b(?:const|let|var)\s+\{([^}]+)}\s*=\s*req\.query/g),
  ];
  const params = [
    ...fieldsFromMemberAccess(handlerSource, /\breq\.params\.([A-Za-z_][A-Za-z0-9_]*)/g),
    ...fieldsFromStringAccess(handlerSource, /\breq\.params\[['"`]([^'"`]+)['"`]\]/g),
    ...fieldsFromDestructure(handlerSource, /\b(?:const|let|var)\s+\{([^}]+)}\s*=\s*req\.params/g),
  ];
  const headers = inferHeaders(handlerSource, [
    /\breq\.headers\.([A-Za-z_][A-Za-z0-9_-]*)/g,
    /\breq\.(?:get|header)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\breq\.headers\[['"`]([^'"`]+)['"`]\]/g,
  ]);

  return {
    params,
    queryParams,
    headers,
    auth: inferAuthFromText(handlerSource),
    body: bodyFields.length > 0 || BODY_METHODS.has(method)
      ? sampleBodyFromFields(bodyFields)
      : undefined,
  };
}

export function inferHonoEnrichment(handlerSource: string, method: string): RouteEnrichment {
  const bodyFields = fieldsFromDestructure(handlerSource, /\b(?:const|let|var)\s+\{([^}]+)}\s*=\s*await\s+c\.req\.json\s*\(\s*\)/g);
  const queryParams = [
    ...fieldsFromStringAccess(handlerSource, /\bc\.req\.query\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g),
    ...fieldsFromStringAccess(handlerSource, /\bc\.req\.queries\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g),
  ];
  const params = fieldsFromStringAccess(handlerSource, /\bc\.req\.param\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
  const headers = inferHeaders(handlerSource, [
    /\bc\.req\.header\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ]);

  return {
    params,
    queryParams,
    headers,
    auth: inferAuthFromText(handlerSource),
    body: bodyFields.length > 0 || /\bc\.req\.json\s*\(/.test(handlerSource) || BODY_METHODS.has(method)
      ? sampleBodyFromFields(bodyFields)
      : undefined,
  };
}

export function inferFlaskEnrichment(handlerSource: string, method: string): RouteEnrichment {
  const bodyFields = [
    ...fieldsFromStringAccess(handlerSource, /\brequest\.(?:json|form)\.get\s*\(\s*['"]([^'"]+)['"]/g),
    ...fieldsFromStringAccess(handlerSource, /\brequest\.get_json\s*\(\s*\)\.get\s*\(\s*['"]([^'"]+)['"]/g),
    ...fieldsFromStringAccess(handlerSource, /\bdata\.get\s*\(\s*['"]([^'"]+)['"]/g),
  ];
  const queryParams = fieldsFromStringAccess(handlerSource, /\brequest\.args\.get\s*\(\s*['"]([^'"]+)['"]/g);
  const headers = inferHeaders(handlerSource, [
    /\brequest\.headers\.get\s*\(\s*['"]([^'"]+)['"]/g,
    /\brequest\.headers\[['"]([^'"]+)['"]\]/g,
  ]);

  return {
    queryParams,
    headers,
    auth: inferAuthFromText(handlerSource),
    body: bodyFields.length > 0 || BODY_METHODS.has(method)
      ? sampleBodyFromFields(bodyFields)
      : undefined,
  };
}

export function inferGinEnrichment(handlerSource: string, method: string): RouteEnrichment {
  const queryParams = fieldsFromStringAccess(handlerSource, /\bc\.(?:Query|DefaultQuery)\s*\(\s*["`]([^"`]+)["`]/g);
  const params = fieldsFromStringAccess(handlerSource, /\bc\.Param\s*\(\s*["`]([^"`]+)["`]\s*\)/g);
  const headers = inferHeaders(handlerSource, [
    /\bc\.GetHeader\s*\(\s*["`]([^"`]+)["`]\s*\)/g,
    /\bc\.Request\.Header\.Get\s*\(\s*["`]([^"`]+)["`]\s*\)/g,
  ]);
  const bodyFields = fieldsFromGinStructTags(handlerSource);

  return {
    params,
    queryParams,
    headers,
    auth: inferAuthFromText(handlerSource),
    body: bodyFields.length > 0 || /ShouldBindJSON|BindJSON/.test(handlerSource) || BODY_METHODS.has(method)
      ? sampleBodyFromFields(bodyFields)
      : undefined,
  };
}

export function extractCallExpression(content: string, startIndex: number): string {
  const openIndex = content.indexOf('(', startIndex);
  if (openIndex === -1) return content.slice(startIndex);

  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let i = openIndex; i < content.length; i++) {
    const char = content[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') depth++;
    if (char === ')') depth--;

    if (depth === 0) return content.slice(startIndex, i + 1);
  }

  return content.slice(startIndex);
}

export function sampleBodyFromFields(fields: FieldInfo[]): Record<string, unknown> {
  const uniqueFields = dedupeFields(fields);
  const entries = uniqueFields.length > 0
    ? uniqueFields
    : [toField('example')];

  return Object.fromEntries(entries.map(field => [field.name, sampleValueForField(field.name, field.type)]));
}

export function toField(name: string, type = 'string', required = true): FieldInfo {
  return {
    name,
    type: normalizeType(type),
    required,
  };
}

export function dedupeFields(fields: FieldInfo[]): FieldInfo[] {
  const deduped = new Map<string, FieldInfo>();

  for (const field of fields) {
    if (!field.name || deduped.has(field.name)) continue;
    deduped.set(field.name, field);
  }

  return [...deduped.values()];
}

export function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if ('([{'.includes(char)) depth++;
    if (')]}'.includes(char)) depth--;

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function createDefaultBody(method: string): Record<string, unknown> | undefined {
  return BODY_METHODS.has(method) ? sampleBodyFromFields([]) : undefined;
}

function buildRouteDescription(route: RouteInfo, enrichment: RouteEnrichment): string {
  const details: string[] = [];
  if (enrichment.auth) details.push('auth required');
  if (enrichment.queryParams?.length) details.push(`${enrichment.queryParams.length} query param(s)`);
  if (enrichment.body !== undefined) details.push('JSON body');

  return details.length > 0
    ? `${route.method} ${route.path} (${details.join(', ')})`
    : `${route.method} ${route.path}`;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some(key => key.toLowerCase() === name.toLowerCase());
}

function hasAnyHeader(headers: Record<string, string>, names: string[]): boolean {
  return names.some(name => hasHeader(headers, name));
}

function inferHeaders(source: string, patterns: RegExp[]): Record<string, string> | undefined {
  const headers: Record<string, string> = {};

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const headerName = normalizeHeaderName(match[1]);
      headers[headerName] = sampleHeaderValue(headerName);
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function fieldsFromMemberAccess(source: string, pattern: RegExp): FieldInfo[] {
  return fieldsFromStringAccess(source, pattern);
}

function fieldsFromStringAccess(source: string, pattern: RegExp): FieldInfo[] {
  const fields: FieldInfo[] = [];
  pattern.lastIndex = 0;

  let match;
  while ((match = pattern.exec(source)) !== null) {
    fields.push(toField(match[1]));
  }

  return fields;
}

function fieldsFromDestructure(source: string, pattern: RegExp): FieldInfo[] {
  const fields: FieldInfo[] = [];
  pattern.lastIndex = 0;

  let match;
  while ((match = pattern.exec(source)) !== null) {
    fields.push(...match[1]
      .split(',')
      .map(part => part.trim())
      .map(part => part.replace(/=.*$/, '').replace(/:.*/, '').replace(/^\.\.\./, '').trim())
      .filter(Boolean)
      .map(name => toField(name)));
  }

  return fields;
}

function fieldsFromGinStructTags(source: string): FieldInfo[] {
  const fields: FieldInfo[] = [];
  const tagPattern = /json:"([^",]+)(?:,[^"]*)?"/g;
  tagPattern.lastIndex = 0;

  let match;
  while ((match = tagPattern.exec(source)) !== null) {
    if (match[1] !== '-') fields.push(toField(match[1]));
  }

  return fields;
}

function sampleValueForField(name: string, type: string): unknown {
  const normalizedName = name.toLowerCase();
  const normalizedType = normalizeType(type);

  if (normalizedType === 'number' || /\b(id|age|count|limit|page|total|price|amount|qty|quantity)\b/.test(normalizedName)) {
    return 1;
  }

  if (normalizedType === 'boolean' || /^(is|has|can|should|active|enabled|published)/.test(normalizedName)) {
    return true;
  }

  if (normalizedName.includes('email')) return 'user@example.com';
  if (normalizedName.includes('password')) return 'password123';
  if (normalizedName.includes('phone')) return '+15555550100';
  if (normalizedName.includes('date')) return '2026-01-01';
  if (normalizedName.includes('url') || normalizedName.includes('avatar')) return 'https://example.com';
  if (normalizedName.includes('name')) return 'Example Name';
  if (normalizedName.includes('title')) return 'Example Title';
  if (normalizedName.includes('description')) return 'Example description';

  return `example_${name}`;
}

function sampleHeaderValue(headerName: string): string {
  const normalized = headerName.toLowerCase();
  if (normalized === 'authorization') return 'Bearer {{token}}';
  if (normalized.includes('api-key')) return '{{api_key}}';
  if (normalized === 'content-type') return 'application/json';
  return `{{${normalized.replace(/-/g, '_')}}}`;
}

function normalizeHeaderName(name: string): string {
  return name
    .split('-')
    .map(part => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
    .join('-');
}

function normalizeType(type: string): string {
  const lowerType = type.toLowerCase();
  if (['int', 'integer', 'float', 'double', 'number'].includes(lowerType)) return 'number';
  if (['bool', 'boolean'].includes(lowerType)) return 'boolean';
  return 'string';
}

function toCommonType(type: string | undefined): string {
  if (!type) return 'string';
  if (type === 'int') return 'number';
  if (type === 'uuid' || type === 'slug' || type === 'path') return 'string';
  return type;
}

import { readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { RouteParser, RouteInfo } from '../types.js';
import {
  type FieldInfo,
  enrichRoute,
  inferAuthFromText,
  inferPathParams,
  sampleBodyFromFields,
  splitTopLevel,
  toField,
} from '../utils/inference.js';

const DECORATOR_PATTERN = /@(?:app|router)\.(get|post|put|delete|patch|options)\s*\(\s*['"]([^'"]+)['"]/gi;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export const fastapiParser: RouteParser = {
  name: 'FastAPI',
  async parse(projectDir: string): Promise<RouteInfo[]> {
    const seen = new Set<string>();
    const routes: RouteInfo[] = [];
    const pattern = join(projectDir, '**/*.py').replace(/\\/g, '/');
    const files = await glob(pattern);

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const models = parsePydanticModels(content);
        let match;
        while ((match = DECORATOR_PATTERN.exec(content)) !== null) {
          const method = match[1].toUpperCase();
          let path = match[2];
          if (!path.startsWith('/')) path = '/' + path;
          const key = `${method}:${path}`;
          if (!seen.has(key)) {
            seen.add(key);
            const handlerSource = extractPythonFunctionAfter(content, match.index);
            routes.push(enrichRoute(
              { method, path },
              inferFastApiEnrichment(handlerSource, path, method, models),
            ));
          }
        }
      } catch { /* ignore */ }
    }

    return routes;
  },
};

function inferFastApiEnrichment(
  handlerSource: string,
  path: string,
  method: string,
  models: Map<string, FieldInfo[]>,
) {
  const pathParamNames = new Set(inferPathParams(path).map(param => param.name));
  const queryParams: FieldInfo[] = [];
  const headers: Record<string, string> = {};
  let body: Record<string, unknown> | undefined;

  const signatureMatch = /(?:async\s+)?def\s+\w+\s*\(([\s\S]*?)\)\s*:/.exec(handlerSource);
  if (signatureMatch) {
    for (const arg of splitTopLevel(signatureMatch[1])) {
      const parsed = parsePythonArg(arg);
      if (!parsed || shouldSkipFastApiArg(parsed.name)) continue;

      if (pathParamNames.has(parsed.name)) continue;

      if (/Header\s*\(/.test(parsed.raw)) {
        headers[toHeaderName(parsed.name)] = parsed.name.toLowerCase().includes('auth')
          ? 'Bearer {{token}}'
          : `{{${parsed.name}}}`;
        continue;
      }

      if (/Depends\s*\(/.test(parsed.raw) || /Security\s*\(/.test(parsed.raw)) {
        continue;
      }

      const modelFields = parsed.type ? models.get(parsed.type) : undefined;
      if (modelFields) {
        body = sampleBodyFromFields(modelFields);
        continue;
      }

      if (BODY_METHODS.has(method) && parsed.type && !isPrimitivePythonType(parsed.type)) {
        body = sampleBodyFromFields([toField(parsed.name, parsed.type)]);
        continue;
      }

      queryParams.push(toField(parsed.name, parsed.type ?? 'string', parsed.defaultValue === undefined));
    }
  }

  return {
    queryParams,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    auth: inferAuthFromText(handlerSource) || /Depends\s*\([^)]*(auth|user|token|jwt)/i.test(handlerSource),
    body,
  };
}

function parsePydanticModels(content: string): Map<string, FieldInfo[]> {
  const models = new Map<string, FieldInfo[]>();
  const modelPattern = /^class\s+(\w+)\s*\([^)]*BaseModel[^)]*\)\s*:\s*$/gm;

  let match;
  while ((match = modelPattern.exec(content)) !== null) {
    const className = match[1];
    const body = extractIndentedBlock(content, match.index);
    const fields: FieldInfo[] = [];
    const fieldPattern = /^\s{4,}(\w+)\s*:\s*([^=\n#]+)/gm;

    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(body)) !== null) {
      fields.push(toField(fieldMatch[1], fieldMatch[2].trim()));
    }

    models.set(className, fields);
  }

  return models;
}

function parsePythonArg(rawArg: string): { name: string; type?: string; defaultValue?: string; raw: string } | null {
  const raw = rawArg.trim();
  if (!raw || raw.startsWith('*')) return null;

  const [left, defaultValue] = raw.split(/=(.+)/, 2).map(value => value?.trim());
  const [name, type] = left.split(/:(.+)/, 2).map(value => value?.trim());
  if (!name) return null;

  return {
    name,
    type: type ? normalizePythonType(type) : undefined,
    defaultValue,
    raw,
  };
}

function extractPythonFunctionAfter(content: string, startIndex: number): string {
  const functionMatch = /\n(?:async\s+)?def\s+\w+\s*\([\s\S]*?\)\s*:/.exec(content.slice(startIndex));
  if (!functionMatch) return content.slice(startIndex, startIndex + 1600);

  const functionStart = startIndex + functionMatch.index + 1;
  return extractIndentedBlock(content, functionStart);
}

function extractIndentedBlock(content: string, startIndex: number): string {
  const rest = content.slice(startIndex);
  const lines = rest.split(/\r?\n/);
  const collected: string[] = [];

  for (const line of lines) {
    if (collected.length > 0 && /^\S/.test(line) && !line.startsWith('@')) break;
    collected.push(line);
  }

  return collected.join('\n');
}

function shouldSkipFastApiArg(name: string): boolean {
  return ['self', 'request', 'response', 'background_tasks', 'db', 'session'].includes(name);
}

function isPrimitivePythonType(type: string): boolean {
  return ['str', 'int', 'float', 'bool', 'string', 'number', 'boolean'].includes(type.toLowerCase());
}

function normalizePythonType(type: string): string {
  return type
    .replace(/^Optional\[(.+)]$/, '$1')
    .replace(/^Annotated\[(.+?),[\s\S]+]$/, '$1')
    .replace(/^list\[(.+)]$/i, '$1[]')
    .trim();
}

function toHeaderName(name: string): string {
  return name
    .replace(/_/g, '-')
    .split('-')
    .map(part => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join('-');
}

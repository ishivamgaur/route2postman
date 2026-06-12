export interface RouteInfo {
  method: string;
  path: string;
  name?: string;
  description?: string;
  params?: { name: string; type: string; required: boolean }[];
  queryParams?: { name: string; type: string; required: boolean }[];
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  group?: string | null;
}

export interface FrameworkDetector {
  name: string;
  detect(projectDir: string): Promise<number>;
}

export interface RouteParser {
  name: string;
  parse(projectDir: string): Promise<RouteInfo[]>;
}

export interface DetectedFramework {
  name: string;
  confidence: number;
  parser: RouteParser;
}

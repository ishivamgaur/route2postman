#!/usr/bin/env node

import { Command } from 'commander';
import { basename, resolve } from 'path';
import { writeFileSync } from 'fs';
import { detectFramework, getFrameworkByName, listSupportedFrameworks } from './detectors/index.js';
import { generatePostmanCollection } from './generators/postman.js';

const program = new Command();
const supportedFrameworks = listSupportedFrameworks();

program
  .name('route2postman')
  .description('Auto-detect your API framework and generate a Postman collection')
  .version('0.1.0')
  .argument('[directory]', 'Project directory to scan', '.')
  .option('-o, --output <path>', 'Output file for the Postman collection')
  .option('--base-url <url>', 'Base URL for API requests', 'http://localhost:3000')
  .option('-n, --name <name>', 'Postman collection name. Defaults to the scanned directory name')
  .option('-f, --framework <name>', `Force a framework parser (${supportedFrameworks.join(', ')})`)
  .option('--list-frameworks', 'Print supported frameworks and exit')
  .showHelpAfterError()
  .action(async (
    directory: string,
    options: { output?: string; baseUrl: string; name?: string; framework?: string; listFrameworks?: boolean },
  ) => {
    if (options.listFrameworks) {
      console.log(supportedFrameworks.join('\n'));
      return;
    }

    const projectDir = resolve(directory);
    const outputFile = options.output || resolve(projectDir, 'postman_collection.json');
    const collectionName = options.name?.trim() || basename(projectDir) || 'API Collection';

    console.log(`\n  Scanning: ${projectDir}\n`);

    const framework = options.framework
      ? getFrameworkByName(options.framework)
      : await detectFramework(projectDir);

    if (!framework) {
      const message = options.framework
        ? `  Unsupported framework: ${options.framework}`
        : '  No supported API framework detected.';

      console.log(message);
      console.log('  Supported: Express.js, FastAPI, Flask, Django, Hono, Gin\n');
      process.exit(1);
    }

    if (options.framework) {
      console.log(`  Using: ${framework.name} (forced)\n`);
    } else {
      console.log(`  Detected: ${framework.name} (confidence: ${framework.confidence}%)\n`);
    }

    const routes = await framework.parser.parse(projectDir);

    if (routes.length === 0) {
      console.log('  No routes found.\n');
      process.exit(0);
    }

    console.log(`  Found ${routes.length} route(s):\n`);
    for (const route of routes) {
      const details = summarizeRoute(route);
      console.log(`    ${route.method.padEnd(7)} ${route.path}${details ? `  ${details}` : ''}`);
    }
    console.log();

    const collection = generatePostmanCollection(routes, framework.name, options.baseUrl, collectionName);
    writeFileSync(outputFile, collection, 'utf-8');

    console.log(`  Collection name: ${collectionName}`);
    console.log(`  Postman collection saved to: ${outputFile}\n`);
  });

program.parse();

function summarizeRoute(route: {
  auth?: boolean;
  body?: unknown;
  queryParams?: { name: string }[];
  headers?: Record<string, string>;
}): string {
  const details: string[] = [];

  if (route.auth) details.push('auth');
  if (route.body !== undefined) details.push('body');
  if (route.queryParams?.length) details.push(`query: ${route.queryParams.map(param => param.name).join(', ')}`);
  if (route.headers && Object.keys(route.headers).length > 0) details.push(`headers: ${Object.keys(route.headers).join(', ')}`);

  return details.length > 0 ? `(${details.join('; ')})` : '';
}

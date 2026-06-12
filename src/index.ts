#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface, type Interface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { basename, isAbsolute, resolve } from 'path';
import { writeFileSync } from 'fs';
import { detectFramework, getFrameworkByName, listSupportedFrameworks } from './detectors/index.js';
import { generatePostmanCollection } from './generators/postman.js';
import { detectBaseUrl } from './utils/base-url.js';

const program = new Command();
const supportedFrameworks = listSupportedFrameworks();

program
  .name('route2postman')
  .description('Auto-detect your API framework and generate a Postman collection')
  .version('0.1.1')
  .argument('[directory]', 'Project directory to scan')
  .option('-o, --output <path>', 'Output file for the Postman collection')
  .option('--base-url <url>', 'Override the detected base URL')
  .option('-n, --name <name>', 'Postman collection name. Defaults to the scanned directory name')
  .option('-f, --framework <name>', `Force a framework parser (${supportedFrameworks.join(', ')})`)
  .option('-i, --interactive', 'Prompt for project directory, collection name, base URL, and output file')
  .option('--no-prompt', 'Disable prompts and use defaults for missing values')
  .option('--list-frameworks', 'Print supported frameworks and exit')
  .showHelpAfterError()
  .action(async (
    directory: string | undefined,
    options: {
      output?: string;
      baseUrl?: string;
      name?: string;
      framework?: string;
      interactive?: boolean;
      prompt?: boolean;
      listFrameworks?: boolean;
    },
  ) => {
    if (options.listFrameworks) {
      console.log(supportedFrameworks.join('\n'));
      return;
    }

    const canPrompt = options.prompt !== false && Boolean(input.isTTY && output.isTTY);
    const useInteractiveFlow = Boolean(options.interactive && canPrompt);
    const shouldPromptForName = canPrompt && !options.name;
    const rl = useInteractiveFlow || shouldPromptForName || (!directory && canPrompt)
      ? createInterface({ input, output })
      : null;

    try {
      const projectInput = useInteractiveFlow || (!directory && canPrompt)
        ? await promptWithDefault(rl, 'Project directory to scan', directory ?? '.')
        : directory ?? '.';
      const projectDir = resolve(projectInput);
      const defaultOutputFile = resolve(projectDir, 'postman_collection.json');
      const detectedBaseUrl = await detectBaseUrl(projectDir);
      const defaultBaseUrl = options.baseUrl ?? detectedBaseUrl;

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

      const defaultCollectionName = basename(projectDir) || 'API Collection';
      const collectionName = options.name?.trim() || (shouldPromptForName
        ? await promptWithDefault(rl, 'Postman collection name', defaultCollectionName)
        : defaultCollectionName);
      const baseUrl = useInteractiveFlow
        ? await promptWithDefault(rl, 'Base URL', defaultBaseUrl)
        : defaultBaseUrl;
      const outputFileInput = options.output || (useInteractiveFlow
        ? await promptWithDefault(rl, 'Output file', defaultOutputFile)
        : defaultOutputFile);
      const outputFile = resolveOutputPath(projectDir, outputFileInput);

      const collection = generatePostmanCollection(routes, framework.name, baseUrl, collectionName);
      writeFileSync(outputFile, collection, 'utf-8');

      console.log(`  Collection name: ${collectionName}`);
      console.log(`  Base URL: ${baseUrl}`);
      console.log(`  Postman collection saved to: ${outputFile}\n`);
    } finally {
      rl?.close();
    }
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

async function promptWithDefault(rl: Interface | null, label: string, defaultValue: string): Promise<string> {
  if (!rl) return defaultValue;

  const answer = await rl.question(`  ${label} (${defaultValue}): `);
  return answer.trim() || defaultValue;
}

function resolveOutputPath(projectDir: string, outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(projectDir, outputPath);
}

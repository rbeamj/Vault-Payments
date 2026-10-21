#!/usr/bin/env node
/**
 * Vault-Payments CLI.
 *
 * Phase 1 walking skeleton: `generate --provider <id>` emits a native provider
 * integration from a manifest. `--dry-run` prints the file plan without writing
 * anything, so what will be written is always visible first.
 *
 * The engine contains no provider names. Every provider difference lives in
 * `providers/<id>/manifest.yaml` and the universal templates.
 */

import { resolve } from 'node:path';
import process from 'node:process';
import { defaultProvidersDir, listProviderIds, loadProvider } from './manifest/registry.js';
import { buildPlan, formatPlan } from './planner/plan.js';
import { renderFiles, writeFiles } from './emit/emitter.js';
import { defaultTemplatesDir, loadTemplates } from './emit/templates.js';

const HELP = `Vault-Payments — generate a payment integration from a provider manifest.

Usage
  vault-payments generate --provider <id> [options]

Commands
  generate      Emit a provider integration.

Options
  --provider <id>     Provider id from providers/<id>/manifest.yaml.
  --out <dir>         Output directory (default: ./generated/<provider>).
  --dry-run           Print the file plan and required environment, write nothing.
  --providers <dir>   Manifest directory (default: the bundled providers/).
  --templates <dir>   Template directory (default: the bundled templates/).
  --list              List available providers and exit.
  -h, --help          Show this help.

The generator never sits in the request path: it writes code into your
repository and gets out of the way.
`;

interface Options {
  command: string | null;
  provider: string | null;
  out: string | null;
  dryRun: boolean;
  providersDir: string | null;
  templatesDir: string | null;
  list: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    command: null,
    provider: null,
    out: null,
    dryRun: false,
    providersDir: null,
    templatesDir: null,
    list: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case 'generate': {
        if (options.command === null) options.command = 'generate';
        break;
      }
      case '--provider': {
        const value = argv[index + 1];
        if (value === undefined) throw new Error('--provider requires a value.');
        options.provider = value;
        index += 1;
        break;
      }
      case '--out': {
        const value = argv[index + 1];
        if (value === undefined) throw new Error('--out requires a value.');
        options.out = value;
        index += 1;
        break;
      }
      case '--providers': {
        const value = argv[index + 1];
        if (value === undefined) throw new Error('--providers requires a value.');
        options.providersDir = value;
        index += 1;
        break;
      }
      case '--templates': {
        const value = argv[index + 1];
        if (value === undefined) throw new Error('--templates requires a value.');
        options.templatesDir = value;
        index += 1;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}. Run with --help for usage.`);
    }
  }

  return options;
}

async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const providersDir = resolve(options.providersDir ?? defaultProvidersDir());

  if (options.list) {
    const ids = await listProviderIds(providersDir);
    process.stdout.write(
      ids.length > 0 ? `${ids.join('\n')}\n` : `No providers found in ${providersDir}\n`,
    );
    return 0;
  }

  if (options.command !== 'generate') {
    process.stderr.write(`${HELP}\n`);
    return 1;
  }

  if (!options.provider) {
    process.stderr.write('Error: generate requires --provider <id>.\n\n');
    process.stderr.write(`${HELP}\n`);
    return 1;
  }

  const manifest = await loadProvider(providersDir, options.provider);
  const outDir = resolve(options.out ?? `./generated/${manifest.id}`);
  const plan = buildPlan(manifest, outDir);

  if (options.dryRun) {
    process.stdout.write(`${formatPlan(plan)}\n`);
    process.stdout.write('Dry run: nothing was written.\n');
    return 0;
  }

  const templates = await loadTemplates(resolve(options.templatesDir ?? defaultTemplatesDir()));
  const files = renderFiles(manifest, plan, templates);
  const written = await writeFiles(outDir, files);

  process.stdout.write(`Emitted ${written.length} files for ${manifest.display_name}:\n`);
  for (const path of written) {
    process.stdout.write(`  ${path}\n`);
  }

  if (plan.gaps.length > 0) {
    process.stdout.write(
      `\n${plan.gaps.length} operation(s) emitted as throwing stubs rather than working code.\n`,
    );
  }

  if (plan.warnings.length > 0) {
    process.stdout.write(`\n${plan.warnings.length} warning(s):\n`);
    for (const warning of plan.warnings) {
      process.stdout.write(`  ! ${warning}\n`);
    }
  }

  return 0;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`Error: ${(error as Error).message}\n`);
  process.exitCode = 1;
});

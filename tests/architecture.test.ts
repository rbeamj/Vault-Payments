import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { repoRoot } from './helpers.js';

/**
 * The 13th-provider rule: the engine must never branch on a provider name.
 *
 * Every provider difference lives in `providers/<id>/manifest.yaml` and the
 * universal templates. If a provider name appears anywhere under `src/` or
 * `templates/`, this test fails — a new provider should be a manifest, not a
 * code change.
 */
const PROVIDER_NAMES = [
  'stripe',
  'square',
  'adyen',
  'paypal',
  'braintree',
  'authorizenet',
  'authorize.net',
  'worldpay',
  'fiserv',
  'shift4',
  'clover',
  'godaddy',
  'globalpayments',
  'globalpay',
  'killbill',
  'hyperswitch',
] as const;

/**
 * The one place the *tool* Prism may be named.
 *
 * Prism is not a provider — it is an optional build-time conformance oracle,
 * and `src/oracle/prism.ts` exists to integrate with it. Naming it there is the
 * point. Naming Hyperswitch-the-platform anywhere else is still a violation,
 * and *provider* names are violations even inside the oracle module.
 */
const PRISM_TOOL_MODULE = 'prism.ts';

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(target)));
    } else if (/\.(ts|json|hbs|md)$/u.test(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

describe('architecture: engine is provider-agnostic', () => {
  it('contains no provider names in the engine or the templates', async () => {
    const directories = [join(repoRoot, 'src'), join(repoRoot, 'templates')];
    const offenders: string[] = [];

    for (const directory of directories) {
      const files = await walk(directory);
      for (const file of files) {
        const contents = await readFile(file, 'utf8');
        const isOracleModule = file.endsWith(PRISM_TOOL_MODULE);
        for (const name of PROVIDER_NAMES) {
          // The oracle module may name the Prism *tool*; it may still not name a provider.
          if (isOracleModule && name === 'hyperswitch') continue;
          if (new RegExp(name.replace('.', '\\.'), 'iu').test(contents)) {
            offenders.push(`${file}: contains "${name}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

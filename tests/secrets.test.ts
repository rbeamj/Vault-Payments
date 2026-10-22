import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { repoRoot } from './helpers.js';

/**
 * Secrets must never be committable.
 *
 * The whole security posture depends on credentials living outside version
 * control. This test runs the real `git check-ignore` against a scratch tree
 * so a regression in `.gitignore` — for example a pattern that stops matching
 * nested paths — fails loudly here rather than leaking a key into a commit.
 *
 * Known boundary: an arbitrarily-named file such as `api_key.txt` is *not*
 * caught, because matching any file containing "key" would ignore legitimate
 * source. The guarantee is deliberately scoped to env files, key-material
 * extensions, credential-named files, secret-named files and a secrets
 * directory — which is where credentials actually land in practice.
 */

const MUST_BE_IGNORED = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'nested/.env',
  'nested/deep/.env',
  'webhook_secret.txt',
  'stripe_secret_key.txt',
  'credentials.json',
  'stripe_credentials.json',
  'server.key',
  'private.pem',
  'secrets/anything.txt',
];

const MUST_BE_TRACKED = ['.env.example', 'README.md', 'src/config.ts'];

function checkIgnore(paths: string[]): { path: string; ignored: boolean }[] {
  // Run inside a scratch directory so the probe never touches real files.
  const scratch = mkdtempSync(join(tmpdir(), 'vault-secrets-'));
  try {
    for (const relative of paths) {
      const target = join(scratch, relative);
      mkdirSync(resolve(target, '..'), { recursive: true });
      writeFileSync(target, 'probe');
    }
    // Copy the ignore rules under test into the scratch tree and make it a
    // repository: `git check-ignore` only evaluates rules inside a repo.
    const ignoreSource = resolve(repoRoot, '.gitignore');
    const rules = execFileSync('node', ['-e', 'process.stdout.write(require("fs").readFileSync(process.argv[1],"utf8"))', ignoreSource], {
      encoding: 'utf8',
    });
    writeFileSync(join(scratch, '.gitignore'), rules);
    execFileSync('git', ['init', '-q'], { cwd: scratch });

    return paths.map((relative) => {
      let ignored = false;
      try {
        execFileSync('git', ['check-ignore', '-q', relative], { cwd: scratch });
        ignored = true;
      } catch {
        ignored = false;
      }
      return { path: relative, ignored };
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe('secrets never enter version control', () => {
  it('ignores every secret-shaped path, at any depth', () => {
    const results = checkIgnore(MUST_BE_IGNORED);
    const tracked = results.filter((result) => !result.ignored);
    expect(
      tracked.map((result) => result.path),
    ).toEqual([]);
  });

  it('still tracks the .env.example template and normal source', () => {
    const results = checkIgnore(MUST_BE_TRACKED);
    const wronglyIgnored = results.filter((result) => result.ignored);
    expect(wronglyIgnored.map((result) => result.path)).toEqual([]);
  });

  it('ignores nested .env files the same as root ones', () => {
    const results = checkIgnore(['.env', 'a/.env', 'a/b/c/.env']);
    for (const result of results) {
      expect(result.ignored, `${result.path} must be ignored`).toBe(true);
    }
  });

  it('does not swallow our own source tree', () => {
    // Run in the real repository: the scratch-tree probe above can only test
    // what patterns do in isolation, never whether one of them hides the
    // engine's own files. That failure class is real — a bare `MANIFEST`
    // pattern from an inherited template once excluded the whole
    // `src/manifest/` directory case-insensitively on Windows filesystems.
    const ours = [
      'src/manifest/schema.json',
      'src/manifest/check.ts',
      'src/manifest/types.ts',
      'tests/secrets.test.ts',
      'tests/manifest.test.ts',
      'templates/universal/client.ts.hbs',
      'providers/stripe/manifest.yaml',
      'package.json',
    ];
    const hidden = ours.filter((relative) => {
      try {
        execFileSync('git', ['check-ignore', '-q', relative], { cwd: repoRoot });
        return true;
      } catch {
        // exit 1: not ignored, which is the required outcome
        return false;
      }
    });
    expect(hidden).toEqual([]);
  });
});

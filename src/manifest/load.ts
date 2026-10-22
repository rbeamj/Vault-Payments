import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { checkManifest } from './check.js';
import { validateManifest } from './validate.js';
import type { Manifest } from './types.js';

const YAML_EXTENSIONS = ['.yaml', '.yml'];

export function isYamlPath(path: string): boolean {
  return YAML_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext));
}

/**
 * Parse manifest text. YAML is the authoring format; JSON is accepted so that
 * tools can round-trip manifests without a YAML parser.
 */
export function parseManifestText(text: string, path = '<inline>'): unknown {
  try {
    return isYamlPath(path) ? parseYaml(text) : JSON.parse(text);
  } catch (cause) {
    throw new Error(
      `Could not parse manifest "${path}": ${(cause as Error).message}`,
    );
  }
}

/** Read, parse, schema-validate and semantically check a manifest from disk. */
export async function loadManifestFile(path: string): Promise<Manifest> {
  const text = await readFile(path, 'utf8');
  return checkParsedManifest(parseManifestText(text, path), path);
}

/** Validate an already-parsed value, including semantic cross-field checks. */
export function checkParsedManifest(value: unknown, subject = '<inline>'): Manifest {
  const manifest = validateManifest(value, subject);
  const problems = checkManifest(manifest);
  if (problems.length > 0) {
    throw new Error(
      `Manifest "${subject}" is semantically invalid:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  }
  return manifest;
}

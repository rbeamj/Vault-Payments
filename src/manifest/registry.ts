import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifestFile } from './load.js';
import type { Manifest } from './types.js';

/**
 * The bundled `providers/` directory.
 *
 * Both `src/manifest/registry.ts` and the compiled `dist/manifest/registry.js`
 * sit two levels below the package root, so the same relative hop works for the
 * development runner and the built CLI.
 */
export function defaultProvidersDir(): string {
  return fileURLToPath(new URL('../../providers/', import.meta.url));
}

export const MANIFEST_FILENAME = 'manifest.yaml';

export function providerDir(providersDir: string, id: string): string {
  return join(resolve(providersDir), id);
}

export function providerManifestPath(providersDir: string, id: string): string {
  return join(providerDir(providersDir, id), MANIFEST_FILENAME);
}

/** Provider ids that have a manifest on disk, sorted for deterministic output. */
export async function listProviderIds(providersDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(resolve(providersDir));
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const dir = providerDir(providersDir, entry);
    const info = await stat(dir).catch(() => null);
    if (!info?.isDirectory()) continue;
    const manifest = await stat(providerManifestPath(providersDir, entry)).catch(() => null);
    if (manifest?.isFile()) found.push(entry);
  }
  return found.sort();
}

/** Load and validate one provider manifest by id. */
export async function loadProvider(
  providersDir: string,
  id: string,
): Promise<Manifest> {
  const path = providerManifestPath(providersDir, id);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) {
    const available = await listProviderIds(providersDir);
    const hint = available.length
      ? ` Available providers: ${available.join(', ')}.`
      : ' No providers are available.';
    throw new Error(`No manifest for provider "${id}" at ${path}.${hint}`);
  }
  return loadManifestFile(path);
}

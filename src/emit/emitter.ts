import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Manifest } from '../manifest/types.js';
import type { Plan } from '../planner/plan.js';
import { compileTemplate, type TemplateSource } from './templates.js';
import { buildViewModel, type ViewModel } from './view.js';

/** Emitted file path (relative to the output directory) → file contents. */
export type RenderedFiles = Record<string, string>;

/** Emitting must be deterministic: golden tests diff this output byte for byte. */
function normalise(text: string): string {
  return `${text.replace(/\s+$/u, '')}\n`;
}

/**
 * Render every file in the plan.
 *
 * Both the dry-run output and this function read the same {@link Plan}, so what
 * is shown is exactly what gets written — the plan is the contract.
 */
export function renderFiles(
  manifest: Manifest,
  plan: Plan,
  templates: TemplateSource,
): RenderedFiles {
  const view: ViewModel = buildViewModel(manifest, plan);
  const compiled = Object.fromEntries(
    Object.entries(templates).map(([id, source]) => [id, compileTemplate(source)]),
  );

  const rendered: RenderedFiles = {};
  for (const file of plan.files) {
    const template = compiled[file.template];
    if (!template) {
      throw new Error(`No template registered for "${file.template}".`);
    }
    rendered[file.path] = normalise(template(view));
  }
  return rendered;
}

/** Write rendered files. Directories are created on demand; files are overwritten. */
export async function writeFiles(outDir: string, files: RenderedFiles): Promise<string[]> {
  const written: string[] = [];
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = join(outDir, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
    written.push(target);
  }
  return written.sort();
}

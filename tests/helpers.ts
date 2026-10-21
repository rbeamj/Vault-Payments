import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifestFile } from '../src/manifest/load.js';
import { buildPlan } from '../src/planner/plan.js';
import { loadTemplates, type TemplateSource } from '../src/emit/templates.js';
import { renderFiles, type RenderedFiles } from '../src/emit/emitter.js';
import type { Manifest } from '../src/manifest/types.js';
import type { Plan } from '../src/planner/plan.js';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const providersDir = resolve(repoRoot, 'providers');
export const templatesDir = resolve(repoRoot, 'templates/universal');
export const goldenDir = resolve(repoRoot, 'tests/golden/stripe');

export interface StripeFixture {
  manifest: Manifest;
  plan: Plan;
  templates: TemplateSource;
  rendered: RenderedFiles;
}

/**
 * The real Stripe manifest, loaded through the real pipeline. Tests exercise
 * the shipped configuration, not a copy of it.
 */
export async function stripeFixture(outDir = '/out/stripe'): Promise<StripeFixture> {
  const manifest = await loadManifestFile(resolve(providersDir, 'stripe/manifest.yaml'));
  const plan = buildPlan(manifest, outDir);
  const templates = await loadTemplates(templatesDir);
  const rendered = renderFiles(manifest, plan, templates);
  return { manifest, plan, templates, rendered };
}

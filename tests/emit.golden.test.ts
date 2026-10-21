import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPlan } from '../src/planner/plan.js';
import { renderFiles, writeFiles } from '../src/emit/emitter.js';
import { goldenDir, stripeFixture, templatesDir } from './helpers.js';
import { loadTemplates } from '../src/emit/templates.js';
import type { Manifest } from '../src/manifest/types.js';

/**
 * Golden-file test: emitted output is compared byte for byte against fixtures
 * checked into the repository. Regenerate deliberately with GOLDEN_UPDATE=1 —
 * never by hand.
 */
describe('golden files', () => {
  it('emits exactly the planned files', async () => {
    const { plan, rendered } = await stripeFixture();
    expect(Object.keys(rendered).sort()).toEqual(plan.files.map((file) => file.path).sort());
  });

  it('matches the checked-in fixtures byte for byte', async () => {
    const { rendered } = await stripeFixture();

    if (process.env['GOLDEN_UPDATE'] === '1') {
      await writeFiles(goldenDir, rendered);
    }

    for (const [path, contents] of Object.entries(rendered)) {
      const fixture = await readFile(resolve(goldenDir, path), 'utf8');
      expect(contents, `golden mismatch for ${path}`).toBe(fixture);
    }
  });

  it('is deterministic across runs and independent of the output directory', async () => {
    const first = await stripeFixture('/a');
    const second = await stripeFixture('/b');
    expect(Object.values(first.rendered)).toEqual(Object.values(second.rendered));
  });

  it('never writes a secret value into emitted source', async () => {
    const { rendered } = await stripeFixture();
    for (const [path, contents] of Object.entries(rendered)) {
      expect(contents, `${path} must not contain a secret value`).not.toMatch(
        /sk_(live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}/,
      );
    }
  });

  it('reads env vars from process.env, never from a literal', async () => {
    const { rendered } = await stripeFixture();
    const config = rendered['src/config.ts'] ?? '';
    expect(config).toMatch(/process\.env/);
    expect(config).toContain('STRIPE_SECRET_KEY');
  });

  it('documents an unsigned webhook scheme instead of emitting a verifier', async () => {
    const { manifest, templates } = await stripeFixture();
    const unsigned: Manifest = structuredClone(manifest);
    unsigned.webhooks.verification = 'unsigned_allowlist';
    const plan = buildPlan(unsigned, '/out/unsigned');
    const output = renderFiles(unsigned, plan, templates);
    const readme = output['README.md'] ?? '';

    expect(readme).toContain('Webhooks are unsigned');
    expect(readme).toContain('cannot verify authenticity');
  });

  it('keeps templates provider-agnostic: no template names a processor', async () => {
    const templates = await loadTemplates(templatesDir);
    const source = Object.values(templates).join('\n');
    expect(source).not.toMatch(/stripe|square|adyen|braintree|worldpay|fiserv|clover/i);
  });
});

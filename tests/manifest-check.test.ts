import { describe, expect, it } from 'vitest';
import { checkManifest } from '../src/manifest/check.js';
import { providersDir, stripeFixture } from './helpers.js';
import type { Manifest } from '../src/manifest/types.js';

/** Structured clone that lets tests break one field at a time. */
function clone(manifest: Manifest): Manifest {
  return JSON.parse(JSON.stringify(manifest)) as Manifest;
}

describe('manifest semantic checks', () => {
  it('accepts the documented stripe manifest untouched', async () => {
    const problems = checkManifest((await stripeFixture()).manifest);
    expect(problems).toEqual([]);
  });

  it('rejects hmac_local verification without a signature block', async () => {
    const manifest = clone((await stripeFixture()).manifest);
    delete (manifest.webhooks as { signature?: unknown }).signature;
    const problems = checkManifest(manifest);
    expect(problems.some((problem) => problem.includes('signature is missing'))).toBe(true);
  });

  it('rejects hmac_local without a replay window', async () => {
    const manifest = clone((await stripeFixture()).manifest);
    delete (manifest.webhooks.signature as { tolerance_seconds?: number }).tolerance_seconds;
    const problems = checkManifest(manifest);
    expect(problems.some((problem) => problem.includes('tolerance_seconds'))).toBe(true);
  });

  it('rejects a signature secret that references an undeclared credential', async () => {
    const manifest = clone((await stripeFixture()).manifest);
    manifest.webhooks.signature!.secret = 'not_a_declared_field';
    const problems = checkManifest(manifest);
    expect(problems.some((problem) => problem.includes('not declared in auth.credential_fields'))).toBe(true);
  });

  it('rejects a signature block under unsigned_allowlist', async () => {
    const manifest = clone((await stripeFixture()).manifest);
    manifest.webhooks.verification = 'unsigned_allowlist';
    const problems = checkManifest(manifest);
    expect(problems.some((problem) => problem.includes('unsigned_allowlist'))).toBe(true);
  });

  it('requires an event id field for dedupe', async () => {
    const manifest = clone((await stripeFixture()).manifest);
    delete (manifest.webhooks as { event_id_field?: unknown }).event_id_field;
    const problems = checkManifest(manifest);
    expect(problems.some((problem) => problem.includes('event_id_field'))).toBe(true);
  });

  it('rejects a tokenization publishable key that is not declared', async () => {
    const manifest = clone((await stripeFixture()).manifest);
    manifest.tokenization!.publishable_key = 'undeclared_field';
    const problems = checkManifest(manifest);
    expect(problems.some((problem) => problem.includes('not declared in auth.credential_fields'))).toBe(true);
  });

  it('rejects a tokenization publishable key marked as a secret', async () => {
    const manifest = clone((await stripeFixture()).manifest);
    manifest.auth.credential_fields.find(
      (field) => field.name === 'publishable_key',
    )!.secret = true;
    const problems = checkManifest(manifest);
    expect(problems.some((problem) => problem.includes('must be declared with secret: false'))).toBe(true);
  });

  it('the providers dir resolves for every other suite', () => {
    expect(providersDir).toMatch(/providers$/);
  });
});

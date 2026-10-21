import { describe, expect, it } from 'vitest';
import { buildPlan, formatPlan } from '../src/planner/plan.js';
import type { Manifest } from '../src/manifest/types.js';
import { stripeFixture } from './helpers.js';

function cloneWith(
  base: Manifest,
  mutate: (manifest: Manifest) => void,
): Manifest {
  const manifest = structuredClone(base);
  mutate(manifest);
  return manifest;
}

describe('plan: the shipped Stripe manifest', () => {
  it('plans one entry per canonical operation, in canonical order', async () => {
    const { plan } = await stripeFixture();
    expect(plan.operations.map((operation) => operation.operation)).toEqual([
      'authorize',
      'capture',
      'void',
      'refund',
      'status',
    ]);
  });

  it('emits all five operations as working code', async () => {
    const { plan } = await stripeFixture();
    expect(plan.gaps).toEqual([]);
    expect(plan.operations.every((operation) => operation.disposition === 'emit')).toBe(true);
  });

  it('carries a source URL and status for every emitted operation', async () => {
    const { plan } = await stripeFixture();
    for (const operation of plan.operations) {
      expect(operation.source, `${operation.operation} needs a source`).toMatch(/^https:\/\//);
      expect(operation.status).toBe('verified');
    }
  });

  it('exposes provider and generator environment variables', async () => {
    const { plan } = await stripeFixture();
    const env = plan.envVars.map((variable) => variable.env);
    expect(env).toContain('STRIPE_SECRET_KEY');
    expect(env).toContain('STRIPE_WEBHOOK_SECRET');
    expect(env).toContain('VAULT_ENVIRONMENT');
    expect(env).toContain('VAULT_ALLOW_LIVE');
    expect(env.filter((name) => name.startsWith('STRIPE_')).length).toBe(2);
  });

  it('flags that terminal support does not follow processor support', async () => {
    const { plan } = await stripeFixture();
    expect(
      plan.warnings.some((warning) => warning.includes('does not follow processor support')),
    ).toBe(true);
  });

  it('renders a plan that names the provider, files and warnings', async () => {
    const { plan } = await stripeFixture();
    const text = formatPlan(plan);
    expect(text).toContain('Stripe');
    expect(text).toContain('native');
    expect(text).toContain('src/client.ts');
    expect(text).toContain('Warnings');
  });
});

describe('plan: honest handling of unverified capabilities', () => {
  it('turns an `unknown` capability into a throwing stub, never working code', async () => {
    const { manifest } = await stripeFixture();

    const degraded = cloneWith(manifest, (candidate) => {
      candidate.capabilities['payment.capture'] = {
        status: 'unknown',
        notes: 'Not found in provider documentation.',
      };
    });

    const plan = buildPlan(degraded, '/out/x');
    const capture = plan.operations.find((operation) => operation.operation === 'capture');

    expect(capture?.disposition).toBe('stub');
    expect(plan.gaps.map((gap) => gap.operation)).toContain('capture');
    expect(
      plan.warnings.some((warning) => warning.includes('capture') && warning.includes('unknown')),
    ).toBe(true);
  });

  it('emits a `partial` capability with its limitation carried through', async () => {
    const { manifest } = await stripeFixture();

    const partial = cloneWith(manifest, (candidate) => {
      candidate.capabilities['payment.refund'] = {
        status: 'partial',
        notes: 'Partial refunds only.',
      };
    });

    const plan = buildPlan(partial, '/out/x');
    const refund = plan.operations.find((operation) => operation.operation === 'refund');

    expect(refund?.disposition).toBe('emit_with_limitation');
    expect(refund?.reason).toBe('Partial refunds only.');
    expect(plan.gaps).toEqual([]);
  });

  it('treats an unmodelled operation as a documented gap', async () => {
    const { manifest } = await stripeFixture();

    const reduced = cloneWith(manifest, (candidate) => {
      delete candidate.operations['status'];
    });

    const plan = buildPlan(reduced, '/out/x');
    const status = plan.operations.find((operation) => operation.operation === 'status');

    expect(status?.disposition).toBe('stub');
    expect(status?.status).toBe('absent');
  });

  it('warns when webhooks are unsigned', async () => {
    const { manifest } = await stripeFixture();

    const unsigned = cloneWith(manifest, (candidate) => {
      candidate.webhooks.verification = 'unsigned_allowlist';
    });

    const plan = buildPlan(unsigned, '/out/x');
    expect(plan.warnings.some((warning) => warning.includes('UNSIGNED'))).toBe(true);
  });

  it('warns when the webhook signature binds the notification URL', async () => {
    const { manifest } = await stripeFixture();

    const urlBound = cloneWith(manifest, (candidate) => {
      candidate.webhooks.notification_url_binding = true;
    });

    const plan = buildPlan(urlBound, '/out/x');
    expect(plan.warnings.some((warning) => warning.includes('notification URL'))).toBe(true);
  });

  it('warns when the manifest permits vendoring an SDK', async () => {
    const { manifest } = await stripeFixture();

    const permissive = cloneWith(manifest, (candidate) => {
      candidate.distribution.vendor_sdk = 'allowed';
    });

    const plan = buildPlan(permissive, '/out/x');
    expect(plan.warnings.some((warning) => warning.includes('vendor_sdk'))).toBe(true);
  });
});

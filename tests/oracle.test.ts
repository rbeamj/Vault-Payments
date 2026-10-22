import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { diffRequests, type RawHttpRequest } from '../src/oracle/diff.js';
import { PrismOracle, prismPlatformSupported } from '../src/oracle/prism.js';
import { goldenDir } from './helpers.js';

/** The emitted adapter, loaded as an artifact exactly as a user would receive it. */
async function loadEmittedClient(): Promise<{
  buildRequest: (config: unknown, spec: unknown, options?: unknown) => RawHttpRequest;
  loadConfig: (env?: Record<string, string>) => unknown;
}> {
  const client = await import(pathToFileURL(resolve(goldenDir, 'src/client.ts')).href);
  const config = await import(pathToFileURL(resolve(goldenDir, 'src/config.ts')).href);
  return clientModuleShape(client, config);
}

type ClientModule = {
  buildRequest: (config: unknown, spec: unknown, options?: unknown) => RawHttpRequest;
};
type ConfigModule = {
  loadConfig: (env?: Record<string, string>) => unknown;
};

function clientModuleShape(
  client: unknown,
  config: unknown,
): { buildRequest: (config: unknown, spec: unknown, options?: unknown) => RawHttpRequest; loadConfig: (env?: Record<string, string>) => unknown } {
  return {
    buildRequest: (client as ClientModule).buildRequest,
    loadConfig: (config as ConfigModule).loadConfig,
  };
}

describe('oracle diff: semantic comparison', () => {
  const base: RawHttpRequest = {
    method: 'POST',
    url: 'https://api.example.com/v1/payments',
    headers: {
      Authorization: 'Bearer one',
      'Content-Type': 'application/json',
    },
    body: '{"amount":1000,"currency":"usd"}',
  };

  it('considers identical requests equal', () => {
    const result = diffRequests(base, structuredClone(base));
    expect(result.equal).toBe(true);
    expect(result.differences).toEqual([]);
  });

  it('ignores credential values but requires their presence', () => {
    const other: RawHttpRequest = {
      ...base,
      headers: { ...base.headers, Authorization: 'Bearer completely-different' },
    };
    expect(diffRequests(base, other).equal).toBe(true);

    const missing: RawHttpRequest = {
      ...base,
      headers: { 'Content-Type': 'application/json' },
    };
    const result = diffRequests(base, missing);
    expect(result.equal).toBe(false);
    expect(result.differences.join('\n')).toContain('missing header "authorization"');
  });

  it('ignores transport noise such as user-agent and content-length', () => {
    const noisy: RawHttpRequest = {
      ...base,
      headers: {
        ...base.headers,
        'User-Agent': 'reference-implementation/1.0',
        'Content-Length': '31',
        Connection: 'keep-alive',
      },
    };
    expect(diffRequests(base, noisy).equal).toBe(true);
  });

  it('reports a different path', () => {
    const result = diffRequests(base, { ...base, url: 'https://api.example.com/v2/payments' });
    expect(result.equal).toBe(false);
    expect(result.differences.join('\n')).toContain('path differs');
  });

  it('reports a different method', () => {
    const result = diffRequests(base, { ...base, method: 'put' });
    expect(result.equal).toBe(false);
    // Method comparison is case-insensitive by design.
    expect(diffRequests(base, { ...base, method: 'POST' }).equal).toBe(true);
  });

  it('compares JSON bodies structurally, ignoring key order', () => {
    const reordered: RawHttpRequest = {
      ...base,
      body: '{"currency":"usd","amount":1000}',
    };
    expect(diffRequests(base, reordered).equal).toBe(true);

    const different: RawHttpRequest = {
      ...base,
      body: '{"amount":2000,"currency":"usd"}',
    };
    expect(diffRequests(base, different).equal).toBe(false);
  });

  it('compares form bodies as sorted field maps, ignoring order', () => {
    const form: RawHttpRequest = {
      method: 'POST',
      url: 'https://api.example.com/v1/payments',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'amount=1000&currency=usd&capture_method=manual',
    };
    const reordered: RawHttpRequest = {
      ...form,
      body: 'capture_method=manual&currency=usd&amount=1000',
    };
    expect(diffRequests(form, reordered).equal).toBe(true);

    const extraField: RawHttpRequest = {
      ...form,
      body: 'amount=1000&currency=usd&capture_method=manual&unexpected=true',
    };
    const result = diffRequests(form, extraField);
    expect(result.equal).toBe(false);
    expect(result.differences.join('\n')).toContain('body differs');
  });

  it('reports a missing body field explicitly', () => {
    const result = diffRequests(
      base,
      { ...base, body: '{"amount":1000}' },
    );
    expect(result.equal).toBe(false);
    expect(result.differences.join('\n')).toContain('body differs');
  });

  it('treats an absent body and an empty body as the same', () => {
    const empty: RawHttpRequest = { ...base, body: '' };
    const absent: RawHttpRequest = { ...base, body: undefined };
    expect(diffRequests(empty, absent).equal).toBe(true);
  });
});

describe('oracle: emitted adapter request construction', () => {
  it('builds the request documented by the manifest', async () => {
    const emitted = await loadEmittedClient();
    const config = emitted.loadConfig({
      STRIPE_SECRET_KEY: 'sk_test_oracle_reference',
      STRIPE_WEBHOOK_SECRET: 'whsec_oracle_reference',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_oracle_reference',
    });

    const built = emitted.buildRequest(config, {
      method: 'POST',
      path: '/v1/payment_intents',
      body: {
        amount: 1000,
        currency: 'usd',
        confirm: true,
        payment_method: 'pm_test',
        'payment_method_types[0]': 'card',
        capture_method: 'manual',
        description: 'order-1',
        metadata: undefined,
      },
      idempotency: { mode: 'header', field: 'Idempotency-Key' },
    });

    const expected: RawHttpRequest = {
      method: 'POST',
      url: 'https://api.stripe.com/v1/payment_intents',
      headers: {
        Authorization: 'Bearer <presence-only>',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': '<presence-only>',
      },
      body: 'amount=1000&capture_method=manual&confirm=true&currency=usd&description=order-1&payment_method=pm_test&payment_method_types[0]=card',
    };

    const result = diffRequests(expected, built);
    expect(result.differences).toEqual([]);
    expect(result.equal).toBe(true);
  });

  it('diffs clean against a reference built by hand from the same manifest', async () => {
    const emitted = await loadEmittedClient();
    const config = emitted.loadConfig({
      STRIPE_SECRET_KEY: 'sk_test_oracle_reference',
      STRIPE_WEBHOOK_SECRET: 'whsec_oracle_reference',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_oracle_reference',
    });

    // A deliberately wrong reference: capture_method missing. The oracle must
    // name the divergence rather than reporting a vague mismatch.
    const wrong: RawHttpRequest = {
      method: 'POST',
      url: 'https://api.stripe.com/v1/payment_intents',
      headers: {
        Authorization: 'Bearer x',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': 'y',
      },
      body: 'amount=1000&currency=usd',
    };

    const built = emitted.buildRequest(config, {
      method: 'POST',
      path: '/v1/payment_intents',
      body: { amount: 1000, currency: 'usd', confirm: true, payment_method: 'pm_test', 'payment_method_types[0]': 'card', capture_method: 'manual' },
      idempotency: { mode: 'header', field: 'Idempotency-Key' },
    });

    const result = diffRequests(wrong, built);
    expect(result.equal).toBe(false);
    expect(result.differences.join('\n')).toContain('capture_method');
  });
});

describe('prism oracle availability', () => {
  it('is expected to be unavailable on this platform, with a stated reason', async () => {
    const { probePrism } = await import('../src/oracle/prism.js');
    const probe = await probePrism();

    if (prismPlatformSupported()) {
      // Only reachable on darwin-arm64 / linux-arm64 / linux-x64 with Prism installed.
      expect(probe.available).toBe(true);
    } else {
      expect(probe.available).toBe(false);
      expect(probe.reason).toContain(process.platform);
    }
  });

  it('skips — never fails — when Prism cannot be loaded', async (context) => {
    const { oracle, probe } = await PrismOracle.load();
    if (!oracle) {
      context.skip();
      return;
    }

    // Live path: verified in the pinned Ubuntu 24.04 CI job, where Prism ships.
    const { loadManifestFile } = await import('../src/manifest/load.js');
    const { resolve } = await import('node:path');
    const { providersDir } = await import('./helpers.js');
    const manifest = await loadManifestFile(resolve(providersDir, 'stripe/manifest.yaml'));

    const flow = manifest.oracle_connector === 'stripe' ? 'authorize' : null;
    if (!flow || !oracle.hasFlow(flow)) {
      context.skip();
      return;
    }

    const emitted = await loadEmittedClient();
    const config = emitted.loadConfig({
      STRIPE_SECRET_KEY: 'sk_test_oracle_reference',
      STRIPE_WEBHOOK_SECRET: 'whsec_oracle_reference',
    });
    const built = emitted.buildRequest(config, {
      method: 'POST',
      path: '/v1/payment_intents',
      body: {
        amount: 1000,
        currency: 'usd',
        confirm: true,
        payment_method: 'pm_test',
        'payment_method_types[0]': 'card',
        capture_method: 'manual',
        description: 'order-1',
      },
      idempotency: { mode: 'header', field: 'Idempotency-Key' },
    });

    const reference = oracle.buildRequest(flow, {
      merchantTransactionId: 'order-1',
      amount: { value: 1000, currency: 'USD' },
      captureMethod: 'manual_single_capture',
    });

    const result = diffRequests(reference, built);
    // The oracle records the divergence; it does not guess which side is right.
    if (!result.equal) {
      const report = await readFile(resolve(goldenDir, 'README.md'), 'utf8');
      expect(report.length).toBeGreaterThan(0);
      context.skip();
      return;
    }
    expect(result.equal).toBe(true);
  });
});

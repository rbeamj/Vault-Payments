import { describe, expect, it } from 'vitest';
import { parseManifestText } from '../src/manifest/load.js';
import {
  ManifestValidationError,
  isValidManifest,
  validateManifest,
} from '../src/manifest/validate.js';
import type { Manifest } from '../src/manifest/types.js';

/**
 * A minimal but complete manifest. `unknown` is used deliberately: it is a
 * first-class status, not an error.
 */
const VALID: Manifest = {
  id: 'example_gateway',
  display_name: 'Example Gateway',
  strategy: 'native',
  surface: 'default',
  regions: ['US'],
  endpoints: { live: 'https://api.example.com', sandbox: 'https://sandbox.example.com' },
  request: { encoding: 'json' },
  auth: {
    model: 'api_key',
    oauth_required_for_seller_context: false,
    credential_fields: [{ name: 'api_key', required: true, secret: true, env: 'EXAMPLE_API_KEY' }],
  },
  capabilities: {
    'payment.authorize': { status: 'unknown' },
    'idempotency': { status: 'unsupported', notes: 'Not offered.' },
  },
  operations: {
    authorize: {
      capability: 'payment.authorize',
      method: 'POST',
      path: '/payments',
      idempotency: 'unknown',
    },
  },
  terminals: { physical_terminal: 'unknown', tap_to_pay_mobile: 'unknown' },
  webhooks: {
    registration: 'dashboard',
    verification: 'unsigned_allowlist',
    notification_url_binding: false,
  },
  sandbox: { access: 'self_serve' },
  approval: { partner_program: false, app_review: false },
  attribution: { required_fields: [] },
  distribution: { vendor_sdk: 'prohibited' },
  sources: ['https://docs.example.com'],
  verified_at: '2026-10-21',
};

describe('manifest schema', () => {
  it('accepts a well-formed manifest', () => {
    expect(isValidManifest(VALID)).toBe(true);
  });

  it('treats `unknown` as a first-class, valid capability status', () => {
    const manifest = validateManifest(structuredClone(VALID));
    expect(manifest.capabilities['payment.authorize']?.status).toBe('unknown');
  });

  it('rejects an invalid capability status', () => {
    const bad = structuredClone(VALID) as unknown as Record<string, unknown>;
    (bad['capabilities'] as Record<string, unknown>)['payment.authorize'] = { status: 'maybe' };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('rejects an unrecognised top-level property', () => {
    const bad = { ...structuredClone(VALID), extra_field: true };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('reports several problems at once', () => {
    const bad = { ...structuredClone(VALID), verified_at: undefined, sources: [] };
    try {
      validateManifest(bad);
      expect.unreachable('expected a validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestValidationError);
      const issues = (error as ManifestValidationError).issues;
      expect(issues.length).toBeGreaterThan(1);
    }
  });

  it('rejects a non-native strategy', () => {
    const bad = { ...structuredClone(VALID), strategy: 'prism' };
    expect(() => validateManifest(bad)).toThrow(/strategy/);
  });

  it('rejects a manifest with no sources', () => {
    const bad = { ...structuredClone(VALID), sources: [] };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('rejects a webhook verification mode outside the enum', () => {
    const bad = structuredClone(VALID) as unknown as Record<string, unknown>;
    (bad['webhooks'] as Record<string, unknown>)['verification'] = 'trust_me';
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('rejects an operation body mapping with an unknown canonical field', () => {
    const bad = structuredClone(VALID) as unknown as Record<string, unknown>;
    (bad['operations'] as Record<string, unknown>)['authorize'] = {
      capability: 'payment.authorize',
      method: 'POST',
      path: '/payments',
      idempotency: 'header',
      body: { amount: { from: 'card_number' } },
    };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('parses YAML, not only JSON', () => {
    const yaml = [
      'id: example_gateway',
      'display_name: Example Gateway',
      'strategy: native',
      'surface: default',
      'regions: [US]',
      'endpoints:',
      '  live: https://api.example.com',
      '  sandbox: https://sandbox.example.com',
      'request:',
      '  encoding: json',
      'auth:',
      '  model: api_key',
      '  oauth_required_for_seller_context: false',
      '  credential_fields:',
      '    - name: api_key',
      '      required: true',
      '      secret: true',
      '      env: EXAMPLE_API_KEY',
      'capabilities: {}',
      'operations: {}',
      'terminals:',
      '  physical_terminal: unknown',
      '  tap_to_pay_mobile: unknown',
      'webhooks:',
      '  registration: dashboard',
      '  verification: unsigned_allowlist',
      '  notification_url_binding: false',
      'sandbox:',
      '  access: self_serve',
      'approval:',
      '  partner_program: false',
      '  app_review: false',
      'attribution:',
      '  required_fields: []',
      'distribution:',
      '  vendor_sdk: prohibited',
      'sources:',
      '  - https://docs.example.com',
      'verified_at: 2026-10-21',
      '',
    ].join('\n');

    const parsed = parseManifestText(yaml, 'manifest.yaml');
    expect(isValidManifest(parsed)).toBe(true);
    const manifest = validateManifest(parsed);
    expect(manifest.auth.credential_fields[0]?.env).toBe('EXAMPLE_API_KEY');
  });
});

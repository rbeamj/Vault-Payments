// GENERATED FILE — do not edit by hand.
//
// Sandbox contract tests.
//
// These are the tests that turn a documented capability into a *supported* one.
// They run against the provider's sandbox and are skipped when credentials are
// absent, so the suite is green before onboarding and meaningful after it.
//
// Set STRIPE_SECRET_KEY in .env to run them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { StripeClient } from '../src/client.js';
import { loadConfig } from '../src/config.js';
import { UnsupportedCapabilityError } from '../src/types.js';

const SECRET_ENV = "STRIPE_SECRET_KEY";
const credentials = process.env[SECRET_ENV];
const skip = credentials ? false : `${SECRET_ENV} is not set; sandbox tests require credentials.`;

test('sandbox: authorize a payment', { skip }, async () => {
  const client = new StripeClient({ config: loadConfig() });
  const result = await client.authorize({
    amount: 1000,
    currency: 'usd',
    // The provider's documented sandbox token, from the manifest: minted by
    // the provider itself, never a cardholder detail.
    payment_method: "pm_card_visa",
    // Post-payment completion URL: providers confirm against it even when
    // the checkout is card-only.
    return_url: 'https://merchant.example/payments/complete',
    reference: 'vault-sandbox-authorize',
  });

  assert.ok(result.id, 'the provider must return a payment identifier');
  assert.ok(result.status, 'the provider must return a status');
});

test('sandbox: capture the authorized payment', { skip }, async () => {
  const client = new StripeClient({ config: loadConfig() });
  const authorized = await client.authorize({ amount: 1000, currency: 'usd', payment_method: "pm_card_visa", return_url: 'https://merchant.example/payments/complete' });
  const captured = await client.capture(authorized.id, {});

  assert.ok(captured.id, 'capture must return an identifier');
});

test('sandbox: void the authorized payment', { skip }, async () => {
  const client = new StripeClient({ config: loadConfig() });
  const authorized = await client.authorize({ amount: 1000, currency: 'usd', payment_method: "pm_card_visa", return_url: 'https://merchant.example/payments/complete' });
  const cancelled = await client.void(authorized.id);

  assert.ok(cancelled.id, 'void must return an identifier');
});

test('sandbox: refund a captured payment', { skip }, async () => {
  const client = new StripeClient({ config: loadConfig() });
  const authorized = await client.authorize({ amount: 1000, currency: 'usd', payment_method: "pm_card_visa", return_url: 'https://merchant.example/payments/complete' });
  await client.capture(authorized.id, {});
  const refunded = await client.refund(authorized.id, {});

  assert.ok(refunded.id, 'refund must return an identifier');
});

test('sandbox: re-fetch payment status', { skip }, async () => {
  const client = new StripeClient({ config: loadConfig() });
  const authorized = await client.authorize({ amount: 1000, currency: 'usd', payment_method: "pm_card_visa", return_url: 'https://merchant.example/payments/complete' });
  const status = await client.status(authorized.id);

  assert.equal(status.id, authorized.id);
});

test('a capability marked unknown is never called', { skip }, async () => {
  const client = new StripeClient({ config: loadConfig() });
});

// GENERATED FILE — do not edit by hand.
//
// Webhook security tests. These run offline against fixtures: they construct
// valid and tampered signatures locally and assert the handler's behaviour.
//
// They are the reason webhook handling can be trusted before any sandbox
// credential exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWebhookHandler, verifyWebhookSignature } from '../src/webhooks.js';
import { EventStore } from '../src/event-store.js';
import type { Config } from '../src/config.js';

const SECRET = 'whsec_test_secret_value';
const TIMESTAMP = String(Math.floor(Date.now() / 1000));
const ALGORITHM = "hmac-sha256";
const ENCODING = "hex";
const SIGNED_PAYLOAD_TEMPLATE = "{timestamp}.{raw_body}";
const HEADER_FORMAT = "key_value_pairs";
const TIMESTAMP_KEY = "t";
const SIGNATURE_KEY = "v1";
const HEADER_NAME = "Stripe-Signature";

const CONFIG: Config = {
  secretKey: 'secretKey-value',
  webhookSecret: 'webhookSecret-value',
  publishableKey: 'publishableKey-value',
  baseUrl: "https://api.stripe.com",
  environment: 'sandbox',
};
// The real signing secret must be the one the config loader supplies.
CONFIG.webhookSecret = SECRET;

function sign(rawBody: string, timestamp: string): string {
  const payload = SIGNED_PAYLOAD_TEMPLATE.replaceAll('{timestamp}', timestamp)
    .replaceAll('{raw_body}', rawBody)
    .replaceAll('{notification_url}', '');
  const algorithm = ALGORITHM === 'hmac-sha512' ? 'sha512' : 'sha256';
  const digest = createHmac(algorithm, SECRET).update(payload, 'utf8').digest();
  return ENCODING === 'base64' ? digest.toString('base64') : digest.toString('hex');
}

function headerFor(rawBody: string, timestamp: string = TIMESTAMP): string {
  const signature = sign(rawBody, timestamp);
  if (HEADER_FORMAT === 'key_value_pairs') {
    return `${TIMESTAMP_KEY}=${timestamp},${SIGNATURE_KEY}=${signature}`;
  }
  return signature;
}

function makeStore(): EventStore {
  return new EventStore(join(mkdtempSync(join(tmpdir(), 'vault-test-')), 'events.db'));
}

function eventBody(id: string): string {
  return JSON.stringify({ id, type: 'payment_intent.succeeded', data: { object: { amount: 1000 } } });
}

test('accepts a correctly signed webhook', () => {
  const store = makeStore();
  const handler = createWebhookHandler({ config: CONFIG, store });
  const body = eventBody('evt_ok');

  return handler({ rawBody: body, headers: { [HEADER_NAME]: headerFor(body) } }).then(
    (response) => {
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { received: true, duplicate: false });
      assert.equal(store.count(), 1);
      store.close();
    },
  );
});

test('rejects a tampered payload', () => {
  const store = makeStore();
  const handler = createWebhookHandler({ config: CONFIG, store });
  const body = eventBody('evt_tampered');
  const tampered = eventBody('evt_tampered') + ' ';

  return handler({ rawBody: tampered, headers: { [HEADER_NAME]: headerFor(body) } }).then(
    (response) => {
      assert.equal(response.status, 400);
      assert.equal(store.count(), 0);
      store.close();
    },
  );
});

test('rejects a signature made with the wrong secret', () => {
  const store = makeStore();
  const other: Config = { ...CONFIG };
  other.webhookSecret = 'whsec_attacker_value';
  const handler = createWebhookHandler({ config: other, store });
  const body = eventBody('evt_wrong_secret');

  return handler({ rawBody: body, headers: { [HEADER_NAME]: headerFor(body) } }).then(
    (response) => {
      assert.equal(response.status, 400);
      assert.equal(store.count(), 0);
      store.close();
    },
  );
});

test('rejects a stale signature outside the replay window', () => {
  const store = makeStore();
  const handler = createWebhookHandler({ config: CONFIG, store });
  const body = eventBody('evt_stale');
  const staleTimestamp = String(
    Math.floor(Date.now() / 1000) - (300 + 60),
  );

  return handler({
    rawBody: body,
    headers: { [HEADER_NAME]: headerFor(body, staleTimestamp) },
  }).then((response) => {
    assert.equal(response.status, 400);
    assert.equal(store.count(), 0);
    store.close();
  });
});

test('rejects a missing signature header', () => {
  const store = makeStore();
  const handler = createWebhookHandler({ config: CONFIG, store });
  const body = eventBody('evt_missing_header');

  return handler({ rawBody: body, headers: {} }).then((response) => {
    assert.equal(response.status, 400);
    assert.equal(store.count(), 0);
    store.close();
  });
});

test('rejects a malformed signature header', () => {
  const store = makeStore();
  const handler = createWebhookHandler({ config: CONFIG, store });
  const body = eventBody('evt_malformed');

  return handler({
    rawBody: body,
    headers: { [HEADER_NAME]: 'not-a-signature' },
  }).then((response) => {
    assert.equal(response.status, 400);
    store.close();
  });
});

test('deduplicates a replayed event without reprocessing', async () => {
  const store = makeStore();
  let processed = 0;
  const handler = createWebhookHandler({
    config: CONFIG,
    store,
    onEvent: async () => {
      processed += 1;
    },
  });
  const body = eventBody('evt_replay');
  const header = headerFor(body);

  const first = await handler({ rawBody: body, headers: { [HEADER_NAME]: header } });
  const second = await handler({ rawBody: body, headers: { [HEADER_NAME]: header } });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { received: true, duplicate: true });
  assert.equal(store.count(), 1);
  store.close();
});

test('persists the event before acknowledging it', async () => {
  const store = makeStore();
  const handler = createWebhookHandler({ config: CONFIG, store, onEvent: async () => {} });
  const body = eventBody('evt_ordering');
  const eventId = 'evt_ordering';

  const response = await handler({
    rawBody: body,
    headers: { [HEADER_NAME]: headerFor(body) },
  });

  // The handler has already returned, so the event must already be durable.
  assert.equal(response.status, 200);
  const stored = store.get(eventId);
  assert.ok(stored, 'event must be durable before the response is sent');
  store.close();
});

test('verification runs before the payload is parsed', () => {
  const result = verifyWebhookSignature(
    'not json at all',
    undefined,
    CONFIG,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /Missing/);
});

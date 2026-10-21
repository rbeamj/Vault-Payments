// GENERATED FILE — do not edit by hand.
//
// Strategy: native. This client calls Stripe
// directly over HTTPS with your own credentials. It contains no Vault-Payments
// runtime, no connector binary, and no vendored provider SDK.
//
// Capability claims are documentation-level findings verified 2026-10-21.
// Nothing here has been tested against a provider sandbox.

import { randomUUID } from 'node:crypto';
import { UnsupportedCapabilityError } from './types.js';
import type {
  RequestOptions,
  PaymentResult,
  RefundResult,
  AuthorizeRequest,
  CaptureRequest,
  RefundRequest,
} from './types.js';
import { loadConfig, type Config } from './config.js';

export interface ClientOptions {
  /** Pre-built configuration. Loaded from the environment when omitted. */
  config?: Config;
  /** Injectable fetch implementation, for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface RequestSpec {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  idempotency?: { mode: string; field?: string };
}

/** The exact HTTP request the client would send, without sending it. */
export interface BuiltRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** Raised when the provider answers with a non-2xx response. */
export class ProviderHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.body = body;
  }
}

const REQUEST_ENCODING: string = "form";

const CONTENT_TYPE: Record<string, string> = {
  form: 'application/x-www-form-urlencoded',
  json: 'application/json',
};

/** Drops fields the caller left undefined so provider defaults still apply. */
function omitUndefined(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Serialise a request body in the encoding the provider expects.
 *
 * The manifest declares the encoding because providers genuinely differ — some
 * take JSON, some take form-encoded bodies with bracket notation for nesting.
 */
function encodeBody(input: Record<string, unknown>, encoding: string): string {
  if (encoding === 'json') {
    return JSON.stringify(input);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
    } else if (typeof value === 'object') {
      for (const [child, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (childValue === undefined || childValue === null) {
          continue;
        }
        params.append(`${key}[${child}]`, String(childValue));
      }
    } else {
      params.append(key, String(value));
    }
  }
  return params.toString();
}

function authHeaders(config: Config): Record<string, string> {
  const value = config.secretKey;
  return { ["Authorization"]: `Bearer ${value}` };
}

/**
 * Assemble the request the client would send, without sending it.
 *
 * Exported so the build-time conformance oracle and tests can compare this
 * request against a reference implementation without touching the network.
 */
export function buildRequest(
  config: Config,
  spec: RequestSpec,
  options: RequestOptions = {},
): BuiltRequest {
  const headers: Record<string, string> = {
    ...authHeaders(config),
    Accept: 'application/json',
  };

  if (spec.idempotency?.mode === 'header' && spec.idempotency.field) {
    // Auto-generated per call, which makes one request safe to retry inside
    // this client. Supply your own key for retries that span processes.
    headers[spec.idempotency.field] = options.idempotencyKey ?? randomUUID();
  }

  let body: string | undefined;
  if (spec.body) {
    const fields = omitUndefined(spec.body);
    if (Object.keys(fields).length > 0) {
      headers['Content-Type'] = CONTENT_TYPE[REQUEST_ENCODING] ?? 'application/json';
      body = encodeBody(fields, REQUEST_ENCODING);
    }
  }

  return {
    method: spec.method,
    url: `${config.baseUrl}${spec.path}`,
    headers,
    body,
  };
}

export class StripeClient {
  readonly #config: Config;
  readonly #fetchImpl: typeof fetch;

  constructor(options: ClientOptions = {}) {
    this.#config = options.config ?? loadConfig();
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Source: https://docs.stripe.com/api/payment_intents/create
   * Documented and mapped to POST /v1/payment_intents.
   */
  async authorize(request: AuthorizeRequest, options: RequestOptions = {}): Promise<PaymentResult> {
    return this.#request<PaymentResult>({
      method: "POST",
      path: "/v1/payment_intents",
      body: {
        amount: request.amount,
        currency: request.currency,
        capture_method: "manual",
        description: request.reference,
        metadata: request.metadata,
      },
      idempotency: { mode: "header", field: "Idempotency-Key" },
    }, options);
  }

  /**
   * Source: https://docs.stripe.com/api/payment_intents/capture
   * Documented and mapped to POST /v1/payment_intents/{id}/capture.
   */
  async capture(id: string, request: CaptureRequest, options: RequestOptions = {}): Promise<PaymentResult> {
    return this.#request<PaymentResult>({
      method: "POST",
      path: `/v1/payment_intents/${encodeURIComponent(id)}/capture`,
      body: {
        amount_to_capture: request.amount,
      },
      idempotency: { mode: "header", field: "Idempotency-Key" },
    }, options);
  }

  /**
   * Source: https://docs.stripe.com/api/payment_intents/cancel
   * Documented and mapped to POST /v1/payment_intents/{id}/cancel.
   */
  async void(id: string, options: RequestOptions = {}): Promise<PaymentResult> {
    return this.#request<PaymentResult>({
      method: "POST",
      path: `/v1/payment_intents/${encodeURIComponent(id)}/cancel`,
      idempotency: { mode: "header", field: "Idempotency-Key" },
    }, options);
  }

  /**
   * Source: https://docs.stripe.com/api/refunds/create
   * Documented and mapped to POST /v1/refunds.
   */
  async refund(id: string, request: RefundRequest, options: RequestOptions = {}): Promise<RefundResult> {
    return this.#request<RefundResult>({
      method: "POST",
      path: "/v1/refunds",
      body: {
        payment_intent: id,
        amount: request.amount,
      },
      idempotency: { mode: "header", field: "Idempotency-Key" },
    }, options);
  }

  /**
   * Source: https://docs.stripe.com/api/payment_intents/retrieve
   * Documented and mapped to GET /v1/payment_intents/{id}.
   */
  async status(id: string, options: RequestOptions = {}): Promise<PaymentResult> {
    return this.#request<PaymentResult>({
      method: "GET",
      path: `/v1/payment_intents/${encodeURIComponent(id)}`,
      idempotency: { mode: "none" },
    }, options);
  }

  async #request<T>(spec: RequestSpec, options: RequestOptions): Promise<T> {
    const request = buildRequest(this.#config, spec, options);

    const response = await this.#fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    const text = await response.text();
    const parsed = text.length > 0 ? safeJson(text) : null;

    if (!response.ok) {
      throw new ProviderHttpError(
        response.status,
        parsed,
        `Request failed: ${spec.method} ${spec.path} responded ${response.status}.`,
      );
    }

    return parsed as T;
  }
}

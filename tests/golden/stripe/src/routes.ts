// GENERATED FILE — do not edit by hand.
//
// Framework-agnostic route handlers. Each one validates its input and delegates
// to the client. None of them touches raw cardholder data, and none of them
// performs business logic — that belongs to the caller.

import type {
  RequestOptions,
  PaymentResult,
  RefundResult,
  AuthorizeRequest,
  CaptureRequest,
  RefundRequest,
} from './types.js';
import type { StripeClient } from './client.js';
import { createWebhookHandler, type WebhookDependencies } from './webhooks.js';

export interface RouteRequest {
  /** Path parameters, already decoded by the host framework. */
  params?: Record<string, string | undefined>;
  /** Parsed JSON body, if any. */
  body?: unknown;
  /**
   * RAW request body. Required by the webhook route: the signature covers
   * these bytes, so a re-serialised object cannot be verified.
   */
  rawBody?: string;
  headers?: Record<string, string | undefined>;
}

export interface RouteResponse {
  status: number;
  body: unknown;
}

export type Handler = (request: RouteRequest) => Promise<RouteResponse>;

export interface Route {
  method: string;
  path: string;
  name: string;
  handler: Handler;
}

/** Raised when caller input does not match the canonical interface. */
export class ValidationError extends Error {
  readonly field: string;

  constructor(field: string, expectation: string) {
    super(`Invalid request: "${field}" must be ${expectation}.`);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(field, 'a positive integer amount in minor units');
  }
  return value;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireInteger(value, field);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(field, 'a non-empty string');
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireString(value, field);
}

function optionalStringMap(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value);
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string') {
      throw new ValidationError(field, 'a map of string to string');
    }
    record[key] = entry;
  }
  return record as Record<string, string>;
}

async function handleAuthorize(client: StripeClient, request: RouteRequest): Promise<RouteResponse> {
  const body = asRecord(request.body);
  const amount = requireInteger(body["amount"], "amount");
  const currency = requireString(body["currency"], "currency");
  const payment_method = optionalString(body["payment_method"], "payment_method");
  const return_url = optionalString(body["return_url"], "return_url");
  const reference = optionalString(body["reference"], "reference");
  const metadata = optionalStringMap(body["metadata"], "metadata");
  return { status: 200, body: await client.authorize({ amount, currency, payment_method, return_url, reference, metadata }) };
}

async function handleCapture(client: StripeClient, request: RouteRequest): Promise<RouteResponse> {
  const id = request.params?.['id'];
  if (id === undefined || id === '') {
    throw new ValidationError('id', 'a non-empty path parameter');
  }
  const body = asRecord(request.body);
  const amount = optionalInteger(body["amount"], "amount");
  return { status: 200, body: await client.capture(id, { amount }) };
}

async function handleVoid(client: StripeClient, request: RouteRequest): Promise<RouteResponse> {
  const id = request.params?.['id'];
  if (id === undefined || id === '') {
    throw new ValidationError('id', 'a non-empty path parameter');
  }
  return { status: 200, body: await client.void(id) };
}

async function handleRefund(client: StripeClient, request: RouteRequest): Promise<RouteResponse> {
  const id = request.params?.['id'];
  if (id === undefined || id === '') {
    throw new ValidationError('id', 'a non-empty path parameter');
  }
  const body = asRecord(request.body);
  const amount = optionalInteger(body["amount"], "amount");
  return { status: 200, body: await client.refund(id, { amount }) };
}

async function handleStatus(client: StripeClient, request: RouteRequest): Promise<RouteResponse> {
  const id = request.params?.['id'];
  if (id === undefined || id === '') {
    throw new ValidationError('id', 'a non-empty path parameter');
  }
  return { status: 200, body: await client.status(id) };
}

export function routes(client: StripeClient): Route[] {
  return [
    {
      method: "POST",
      path: "/payments/authorize",
      name: "authorize",
      handler: (request) => handleAuthorize(client, request),
    },
    {
      method: "POST",
      path: "/payments/{id}/capture",
      name: "capture",
      handler: (request) => handleCapture(client, request),
    },
    {
      method: "POST",
      path: "/payments/{id}/void",
      name: "void",
      handler: (request) => handleVoid(client, request),
    },
    {
      method: "POST",
      path: "/payments/{id}/refund",
      name: "refund",
      handler: (request) => handleRefund(client, request),
    },
    {
      method: "GET",
      path: "/payments/{id}",
      name: "status",
      handler: (request) => handleStatus(client, request),
    },
  ];
}

/**
 * The webhook route.
 *
 * Mount this at the URL registered with the provider, and make sure your HTTP
 * layer supplies `rawBody` — a framework that parses JSON before the handler
 * runs will break signature verification.
 */
export function webhookRoute(dependencies: WebhookDependencies): Route {
  const handler = createWebhookHandler(dependencies);
  return {
    method: 'POST',
    path: "/webhooks/stripe",
    name: 'webhook',
    handler: (request) =>
      handler({
        rawBody: request.rawBody ?? '',
        headers: request.headers ?? {},
        notificationUrl: request.headers?.['x-forwarded-url'],
      }),
  };
}

/** Every route this integration serves: payment operations plus the webhook. */
export function allRoutes(
  client: StripeClient,
  webhookDependencies: WebhookDependencies,
): Route[] {
  return [...routes(client), webhookRoute(webhookDependencies)];
}

/**
 * Vault-Payments provider manifest — the single source of truth.
 *
 * Everything else (capability matrix, generated clients, routes, webhook
 * handlers, tests, docs) is derived from this contract. The engine must never
 * branch on a provider name; all provider difference lives in this data.
 *
 * Design rules (see docs/ARCHITECTURE_OPTIONS.md §6.2):
 *  - every capability carries a status, and `unknown` is first-class;
 *  - every claim carries a source URL and a `verified_at` date;
 *  - the generator refuses to emit a capability marked `unknown`/`unsupported`
 *    — it emits a stub plus a documented gap instead.
 */

/**
 * Canonical integration interface. The generator owns this vocabulary.
 *
 * `authorize` deliberately absorbs provider-specific "create payment" calls:
 * an authorization-only request is the same operation with capture deferred.
 */
export const CANONICAL_OPERATIONS = [
  'authorize',
  'capture',
  'void',
  'refund',
  'status',
] as const;

export type CanonicalOperation = (typeof CANONICAL_OPERATIONS)[number];

/** Documentation-level confidence. Not the same thing as product support. */
export const CAPABILITY_STATUSES = ['verified', 'partial', 'unsupported', 'unknown'] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

/**
 * Capabilities the MVP requires. Keys are stable and referenced by
 * `operations[].capability`.
 */
export const CAPABILITY_KEYS = [
  'payment.create',
  'payment.authorize',
  'payment.capture',
  'payment.void',
  'payment.refund',
  'payment.status',
  'idempotency',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type AuthModel =
  | 'bearer'
  | 'api_key'
  | 'oauth2_client_credentials'
  | 'signature';

export type Surface = 'default' | 'hosted_checkout' | 'platform';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * How a retried request avoids double-charging.
 * `unknown` is honest and must not be rendered as if it were safe.
 */
export type IdempotencyMode = 'header' | 'body_field' | 'none' | 'unknown';

/** How the provider proves a webhook is genuine. Never defaulted. */
export type WebhookVerification =
  | 'hmac_local'
  | 'static_secret_header'
  | 'remote_verify'
  | 'unsigned_allowlist';

export interface CredentialField {
  /** Identifier used inside generated code, e.g. `secret_key`. */
  name: string;
  required: boolean;
  /** When true, the value must never be logged, echoed, or written to disk. */
  secret: boolean;
  /** Environment variable read by the generated config loader. */
  env: string;
  description?: string;
}

export interface Auth {
  model: AuthModel;
  /** True when acting on behalf of a seller requires an OAuth token flow. */
  oauth_required_for_seller_context: boolean;
  /** Header name the credential is sent in, for header-based models. */
  header?: string;
  credential_fields: CredentialField[];
}

/** Fields the canonical interface exposes to callers. */
export const CANONICAL_FIELDS = [
  'id',
  'amount',
  'currency',
  'payment_method',
  'reference',
  'metadata',
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/**
 * How one provider body field is populated.
 *
 * `from` lifts a canonical request field; `const` pins a literal the provider
 * requires (for example deferring capture so an authorize stays uncaptured).
 * Provider difference is data, so no template ever hard-codes a field name.
 */
export type BodyMapping =
  | { from: CanonicalField }
  | { const: string | number | boolean };

export interface Operation {
  /** Which capability this operation satisfies. */
  capability: CapabilityKey;
  method: HttpMethod;
  /** Path template. `{id}` placeholders become typed function parameters. */
  path: string;
  idempotency: IdempotencyMode;
  /** Header or body field name, required when idempotency is not `none`/`unknown`. */
  idempotency_field?: string;
  /** Maps the canonical request onto the provider's request body. */
  body?: Record<string, BodyMapping>;
  /**
   * Provider-documented sandbox token for the emitted contract tests, e.g. a
   * test-mode payment-method token. Provider data lives here, never in the
   * universal templates.
   */
  sandbox_token?: string;
}

export interface Capability {
  status: CapabilityStatus;
  /** Human-readable limitation, required for `partial`/`unsupported`. */
  notes?: string;
  /** Source URL proving the status. Required by the design rules. */
  source?: string;
}

/**
 * How the signature header is parsed into its parts.
 *
 * Genuinely differs per provider: one sends `t=<ts>,v1=<sig>` key/value pairs,
 * another sends a single opaque value. This is data, not a template branch.
 */
export type SignatureHeaderFormat =
  | { type: 'key_value_pairs'; timestamp_key: string; signature_key: string }
  | { type: 'single' };

export type WebhookAlgorithm = 'hmac-sha256' | 'hmac-sha512';

/** How the provider encodes the signature bytes. Differs per provider. */
export type SignatureEncoding = 'hex' | 'base64';

export interface WebhookSignature {
  header?: string;
  algorithm?: WebhookAlgorithm;
  /** Encoding of the signature bytes in the header. */
  encoding?: SignatureEncoding;
  /**
   * How the signed string is built, with `{timestamp}`, `{raw_body}` and
   * `{notification_url}` placeholders. For example `{timestamp}.{raw_body}`.
   */
  signed_payload?: string;
  header_format?: SignatureHeaderFormat;
  /** Replay window. Requests older than this are rejected. */
  tolerance_seconds?: number;
  /** Credential field name holding the signing secret. */
  secret?: string;
}

export interface Webhooks {
  registration: 'api' | 'dashboard' | 'none';
  verification: WebhookVerification;
  /** True when the callback URL is part of the signed string. */
  notification_url_binding: boolean;
  signature?: WebhookSignature;
  /** JSON path to the provider event id, used for durable dedupe. */
  event_id_field?: string;
  /** JSON path to the provider event type. */
  event_type_field?: string;
  retry_window?: string;
  replay_protection?: 'automatic' | 'manual' | 'none';
  notes?: string;
  source?: string;
}

/**
 * How the frontend collects payment details without the server ever seeing
 * cardholder data. Absent means server-only: no frontend is emitted.
 */
export interface Tokenization {
  kind: 'hosted_fields' | 'none';
  /** Provider script URL, loaded from the provider's CDN. Never bundled. */
  script_url: string;
  /** Global the provider script installs, taken from the manifest. */
  global_name: string;
  /** Credential field name holding the publishable (non-secret) key. */
  publishable_key: string;
  /** CSS selector → hosted element type to mount. */
  mount: Record<string, string>;
  /** Selector of the form whose submit triggers tokenization. */
  submit_target: string;
  /** Server route the token is posted to. */
  route: string;
}

export interface Terminals {
  physical_terminal: CapabilityStatus;
  tap_to_pay_mobile: CapabilityStatus;
  notes?: string;
}

export interface Endpoints {
  live: string;
  sandbox: string;
}

/** How request bodies are serialised. Genuinely differs per provider. */
export type RequestEncoding = 'form' | 'json';

export interface RequestFormat {
  encoding: RequestEncoding;
}

export interface Sandbox {
  access: 'self_serve' | 'partner_gated';
  notes?: string;
}

export interface Approval {
  partner_program: boolean;
  app_review: boolean;
  notes?: string;
}

export interface Attribution {
  /**
   * Fields injected on every request, for providers that mandate
   * application-identification data. Generated, never left to the caller.
   */
  required_fields: string[];
  notes?: string;
}

export interface Distribution {
  /** Provider SDKs are declared dependencies, never copied into output. */
  vendor_sdk: 'prohibited' | 'allowed';
}

export interface Manifest {
  id: string;
  display_name: string;
  /** The only runtime strategy. */
  strategy: 'native';
  surface: Surface;
  /**
   * Optional Prism connector used *only* as a build-time conformance oracle.
   * Never a dependency of generated code.
   */
  oracle_connector?: string;
  regions: string[];
  summary?: string;
  endpoints: Endpoints;
  request: RequestFormat;
  auth: Auth;
  capabilities: Partial<Record<CapabilityKey, Capability>>;
  operations: Partial<Record<CanonicalOperation, Operation>>;
  terminals: Terminals;
  webhooks: Webhooks;
  /** Absent means server-only: no frontend tokenization is emitted. */
  tokenization?: Tokenization;
  sandbox: Sandbox;
  approval: Approval;
  attribution: Attribution;
  distribution: Distribution;
  sources: string[];
  verified_at: string;
}

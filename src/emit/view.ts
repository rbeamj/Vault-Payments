import {
  CANONICAL_OPERATIONS,
  CAPABILITY_KEYS,
  type CanonicalField,
  type CanonicalOperation,
  type CapabilityKey,
  type CapabilityStatus,
  type Manifest,
} from '../manifest/types.js';
import type {
  EnvVar,
  OperationDisposition,
  OperationPlan,
  Plan,
} from '../planner/plan.js';

/**
 * The canonical interface's own knowledge — deliberately provider-independent.
 * Which fields an operation accepts is a property of the interface we own, not
 * of any processor, so it lives here rather than in a manifest.
 */
const ACCEPTED_FIELDS: Record<CanonicalOperation, CanonicalField[]> = {
  authorize: ['amount', 'currency', 'reference', 'metadata'],
  capture: ['amount'],
  void: [],
  refund: ['amount'],
  status: [],
};

const REQUIRED_FIELDS: Partial<Record<CanonicalOperation, CanonicalField[]>> = {
  authorize: ['amount', 'currency'],
};

type FieldKind = 'integer' | 'string' | 'stringMap';

const FIELD_KINDS: Record<CanonicalField, { kind: FieldKind; tsType: string; doc: string }> = {
  id: { kind: 'string', tsType: 'string', doc: 'Identifier.' },
  amount: {
    kind: 'integer',
    tsType: 'number',
    doc: 'Amount in minor units (for example cents). Never a floating-point major-unit amount.',
  },
  currency: {
    kind: 'string',
    tsType: 'string',
    doc: 'ISO-4217 code, lower-case (for example "usd").',
  },
  reference: {
    kind: 'string',
    tsType: 'string',
    doc: 'Your own reference for this payment. Never place cardholder data here.',
  },
  metadata: {
    kind: 'stringMap',
    tsType: 'Record<string, string>',
    doc: 'Free-form key/value metadata passed through to the provider.',
  },
};

const KIND_PASCAL: Record<FieldKind, string> = {
  integer: 'Integer',
  string: 'String',
  stringMap: 'StringMap',
};

function fieldView(field: CanonicalField, required: boolean): FieldView {
  const spec = FIELD_KINDS[field];
  return {
    name: field,
    kind: spec.kind,
    tsType: spec.tsType,
    doc: spec.doc,
    kindPascal: KIND_PASCAL[spec.kind],
    required,
  };
}

const REQUEST_TYPES: Partial<Record<CanonicalOperation, string>> = {
  authorize: 'AuthorizeRequest',
  capture: 'CaptureRequest',
  refund: 'RefundRequest',
};

const RESULT_TYPES: Partial<Record<CanonicalOperation, string>> = {
  refund: 'RefundResult',
};

export interface FieldView {
  name: CanonicalField;
  kind: FieldKind;
  /** TypeScript type for the emitted interface. */
  tsType: string;
  /** Documentation line for the emitted interface. */
  doc: string;
  /** Name of the generated validator helper, e.g. `Integer` → `requireInteger`. */
  kindPascal: string;
  required: boolean;
}

export interface BodyEntryView {
  /** Provider body field name. */
  field: string;
  /** TypeScript expression producing the value. */
  expression: string;
}

export interface OperationView {
  name: CanonicalOperation;
  method: string;
  path: string;
  /** Ready-to-emit TypeScript expression for the URL, as a string literal or template. */
  pathExpression: string;
  hasId: boolean;
  hasBody: boolean;
  functionName: string;
  /** Generated route-handler function name, e.g. `handleAuthorize`. */
  handlerName: string;
  /** Function parameter declarations, already typed. */
  params: string[];
  /** Arguments forwarded to the client method by the route handler. */
  callArgs: string;
  requestType: string | null;
  resultType: string;
  bodyEntries: BodyEntryView[];
  fields: FieldView[];
  routePath: string;
  capability: CapabilityKey | null;
  status: CapabilityStatus | 'absent';
  disposition: OperationDisposition;
  reason: string;
  source?: string;
  idempotencyMode: string;
  idempotencyField?: string;
}

export interface CapabilityView {
  key: string;
  status: CapabilityStatus | 'absent';
  notes?: string;
  source?: string;
}

export interface RequestTypeView {
  name: string;
  fields: FieldView[];
}

export interface AuthCredentialView {
  /** camelCase config property name, e.g. `secretKey`. */
  name: string;
  /** Environment variable the value is read from. */
  env: string;
  /** Header the credential is sent in, e.g. `Authorization`. */
  header: string;
  model: string;
}

export interface WebhookView {
  registration: string;
  verification: string;
  notificationUrlBinding: boolean;
  header?: string;
  algorithm?: string;
  signedPayload?: string;
  retryWindow?: string;
  replayProtection?: string;
  notes?: string;
  source?: string;
  /** True when no signature exists and the handler must not pretend otherwise. */
  unsigned: boolean;
  /** True when verification is not a local HMAC. */
  notLocalHmac: boolean;
}

export interface EnvVarView {
  env: string;
  name: string;
  /** camelCase config property name, e.g. `secretKey`. */
  camelName: string;
  required: boolean;
  secret: boolean;
  description?: string;
  origin: 'provider' | 'generator';
}

export interface ViewModel {
  clientClassName: string;
  provider: {
    id: string;
    displayName: string;
    strategy: string;
    surface: string;
    oracleConnector?: string;
    summary?: string;
  };
  /** `form` or `json` — drives the transport's serialiser. */
  requestEncoding: string;
  authModel: string;
  authHeader: string;
  /** The credential that authenticates every request. */
  authCredential: AuthCredentialView;
  oauthRequired: boolean;
  endpoints: { live: string; sandbox: string };
  sandboxAccess: string;
  envVars: EnvVarView[];
  /** Variables that come from the provider manifest (secrets, keys). */
  providerEnvVars: EnvVarView[];
  /** Variables every generated integration understands. */
  generatorEnvVars: EnvVarView[];
  operations: OperationView[];
  emitted: OperationView[];
  stubs: OperationView[];
  capabilities: CapabilityView[];
  webhook: WebhookView;
  terminals: { physical: string; tapToPay: string; notes?: string };
  attribution: { requiredFields: string[]; notes?: string };
  distribution: { vendorSdk: string };
  approval: { partnerProgram: boolean; appReview: boolean; notes?: string };
  sources: string[];
  verifiedAt: string;
  warnings: string[];
  /** Distinct request/result type names the emitted code needs. */
  requestTypes: string[];
  /** Request types with their field shapes, so `types.ts` can be emitted. */
  requestTypeShapes: RequestTypeView[];
  resultTypes: string[];
}

function pathParamsOf(path: string): string[] {
  return [...path.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]!);
}

function pathExpressionOf(path: string, params: string[]): string {
  if (params.length === 0) return JSON.stringify(path);
  const interpolated = path.replace(
    /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_match, name: string) => '${encodeURIComponent(' + name + ')}',
  );
  return '`' + interpolated + '`';
}

function bodyEntriesOf(
  body: Record<string, { from?: CanonicalField; const?: string | number | boolean }> | undefined,
): BodyEntryView[] {
  if (!body) return [];
  return Object.entries(body).map(([field, mapping]) => {
    if ('const' in mapping && mapping.const !== undefined) {
      return { field, expression: JSON.stringify(mapping.const) };
    }
    const from = mapping.from!;
    // A path parameter is a function argument; everything else lives on the
    // canonical request object.
    return { field, expression: from === 'id' ? 'id' : `request.${from}` };
  });
}

function routePathOf(operation: CanonicalOperation, hasId: boolean): string {
  if (operation === 'status') return '/payments/{id}';
  return hasId ? `/payments/{id}/${operation}` : `/payments/${operation}`;
}

function planFor(plan: Plan, operation: CanonicalOperation): OperationPlan {
  const found = plan.operations.find((candidate) => candidate.operation === operation);
  // buildPlan always produces one entry per canonical operation.
  return found!;
}

function toOperationView(manifest: Manifest, plan: Plan, operation: CanonicalOperation): OperationView {
  const planned = planFor(plan, operation);
  const op = manifest.operations[operation];
  const accepted = ACCEPTED_FIELDS[operation];
  const required = REQUIRED_FIELDS[operation] ?? [];

  if (!op) {
    // Absent operations still get a view so the emitted stub is symmetric and
    // the route surface is identical across providers.
    return {
      name: operation,
      method: 'POST',
      path: '',
      pathExpression: JSON.stringify(''),
      hasId: false,
      hasBody: false,
      functionName: operation,
      handlerName: `handle${pascalCase(operation)}`,
      params: ['options: RequestOptions = {}'],
      callArgs: 'options',
      requestType: null,
      resultType: RESULT_TYPES[operation] ?? 'PaymentResult',
      bodyEntries: [],
      fields: [],
      routePath: routePathOf(operation, false),
      capability: null,
      status: 'absent',
      disposition: 'stub',
      reason: planned.reason,
      idempotencyMode: 'none',
    };
  }

  const pathParams = pathParamsOf(op.path);
  const bodyEntries = bodyEntriesOf(op.body);
  const hasBody = bodyEntries.length > 0;
  // `id` is a canonical input that may arrive as a path parameter (capture) or
  // as a body field (a refund identifies its payment in the body).
  const hasId = pathParams.includes('id') || bodyEntries.some((entry) => entry.expression === 'id');
  const requestType = hasBody ? (REQUEST_TYPES[operation] ?? null) : null;

  const params: string[] = [];
  if (hasId) params.push('id: string');
  if (requestType) params.push(`request: ${requestType}`);
  params.push('options: RequestOptions = {}');

  const fields = accepted.map((field) =>
    fieldView(field, required.includes(field)),
  );
  const callArgs = hasId
    ? hasBody
      ? `id, { ${fields.map((field) => field.name).join(', ')} }`
      : 'id'
    : `{ ${fields.map((field) => field.name).join(', ')} }`;

  return {
    name: operation,
    method: op.method,
    path: op.path,
    pathExpression: pathExpressionOf(op.path, pathParams),
    hasId,
    hasBody,
    functionName: operation,
    handlerName: `handle${pascalCase(operation)}`,
    params,
    callArgs,
    requestType,
    resultType: RESULT_TYPES[operation] ?? 'PaymentResult',
    bodyEntries,
    fields,
    routePath: routePathOf(operation, hasId),
    capability: planned.capability,
    status: planned.status,
    disposition: planned.disposition,
    reason: planned.reason,
    ...(planned.source ? { source: planned.source } : {}),
    idempotencyMode: op.idempotency,
    ...(op.idempotency_field ? { idempotencyField: op.idempotency_field } : {}),
  };
}

function toCapabilityView(manifest: Manifest): CapabilityView[] {
  return CAPABILITY_KEYS.map((key) => {
    const capability = manifest.capabilities[key];
    if (!capability) return { key, status: 'absent' as const };
    return {
      key,
      status: capability.status,
      ...(capability.notes ? { notes: capability.notes } : {}),
      ...(capability.source ? { source: capability.source } : {}),
    };
  });
}

function toWebhookView(manifest: Manifest): WebhookView {
  const webhooks = manifest.webhooks;
  const signature = webhooks.signature;
  return {
    registration: webhooks.registration,
    verification: webhooks.verification,
    notificationUrlBinding: webhooks.notification_url_binding,
    ...(signature?.header ? { header: signature.header } : {}),
    ...(signature?.algorithm ? { algorithm: signature.algorithm } : {}),
    ...(signature?.signed_payload ? { signedPayload: signature.signed_payload } : {}),
    ...(webhooks.retry_window ? { retryWindow: webhooks.retry_window } : {}),
    ...(webhooks.replay_protection ? { replayProtection: webhooks.replay_protection } : {}),
    ...(webhooks.notes ? { notes: webhooks.notes } : {}),
    ...(webhooks.source ? { source: webhooks.source } : {}),
    unsigned: webhooks.verification === 'unsigned_allowlist',
    notLocalHmac: webhooks.verification !== 'hmac_local',
  };
}

function camelCase(input: string): string {
  return input.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function pascalCase(input: string): string {
  const camel = camelCase(input);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * The credential that authenticates every request: the first required, secret
 * field declared by the manifest. Providers with several secrets (e.g. a
 * webhook secret) still have exactly one that signs outbound requests.
 */
function authCredentialOf(manifest: Manifest): AuthCredentialView {
  const field =
    manifest.auth.credential_fields.find((candidate) => candidate.required && candidate.secret) ??
    manifest.auth.credential_fields[0];

  if (!field) {
    throw new Error(
      `Manifest "${manifest.id}" declares no credential fields; nothing could authenticate.`,
    );
  }

  return {
    name: camelCase(field.name),
    env: field.env,
    header: manifest.auth.header ?? 'Authorization',
    model: manifest.auth.model,
  };
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

/** Build the render context. Templates stay dumb; all shaping happens here. */
export function buildViewModel(manifest: Manifest, plan: Plan): ViewModel {
  const operations = CANONICAL_OPERATIONS.map((operation) =>
    toOperationView(manifest, plan, operation),
  );
  const emitted = operations.filter((operation) => operation.disposition !== 'stub');

  const envVars: EnvVarView[] = plan.envVars.map((envVar) => ({
    ...envVar,
    camelName: camelCase(envVar.name),
  }));

  return {
    clientClassName: `${pascalCase(manifest.id)}Client`,
    provider: {
      id: manifest.id,
      displayName: manifest.display_name,
      strategy: manifest.strategy,
      surface: manifest.surface,
      ...(manifest.oracle_connector ? { oracleConnector: manifest.oracle_connector } : {}),
      ...(manifest.summary ? { summary: manifest.summary } : {}),
    },
    requestEncoding: manifest.request.encoding,
    authModel: manifest.auth.model,
    authHeader: manifest.auth.header ?? 'Authorization',
    authCredential: authCredentialOf(manifest),
    oauthRequired: manifest.auth.oauth_required_for_seller_context,
    endpoints: manifest.endpoints,
    sandboxAccess: manifest.sandbox.access,
    envVars,
    providerEnvVars: envVars.filter((envVar) => envVar.origin === 'provider'),
    generatorEnvVars: envVars.filter((envVar) => envVar.origin === 'generator'),
    operations,
    emitted,
    stubs: operations.filter((operation) => operation.disposition === 'stub'),
    capabilities: toCapabilityView(manifest),
    webhook: toWebhookView(manifest),
    terminals: {
      physical: manifest.terminals.physical_terminal,
      tapToPay: manifest.terminals.tap_to_pay_mobile,
      ...(manifest.terminals.notes ? { notes: manifest.terminals.notes } : {}),
    },
    attribution: {
      requiredFields: manifest.attribution.required_fields,
      ...(manifest.attribution.notes ? { notes: manifest.attribution.notes } : {}),
    },
    distribution: { vendorSdk: manifest.distribution.vendor_sdk },
    approval: {
      partnerProgram: manifest.approval.partner_program,
      appReview: manifest.approval.app_review,
      ...(manifest.approval.notes ? { notes: manifest.approval.notes } : {}),
    },
    sources: manifest.sources,
    verifiedAt: manifest.verified_at,
    warnings: plan.warnings,
    requestTypes: unique(emitted.map((operation) => operation.requestType)),
    requestTypeShapes: unique(emitted.map((operation) => operation.requestType)).map(
      (name) => ({
        name,
        fields:
          emitted.find((operation) => operation.requestType === name)?.fields ?? [],
      }),
    ),
    resultTypes: unique(emitted.map((operation) => operation.resultType)),
  };
}

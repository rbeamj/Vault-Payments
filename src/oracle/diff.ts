/**
 * Request comparison for the build-time conformance oracle.
 *
 * The oracle's value is comparing *semantics*, not bytes: two implementations
 * of the same provider call will legitimately differ in transport noise, and
 * will always differ in credential values because the reference implementation
 * runs with its own test credentials. Both are handled here so a real
 * divergence — wrong path, wrong field, missing signature component — is the
 * only thing that can fail the check.
 */

/** A request as either implementation produces it. */
export interface RawHttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | null | undefined;
}

export interface NormalizedRequest {
  method: string;
  origin: string;
  path: string;
  query: Record<string, string[]>;
  headers: Record<string, string>;
  body: unknown;
}

export interface DiffResult {
  equal: boolean;
  differences: string[];
}

/**
 * Transport noise. These describe the HTTP client, not the request's meaning,
 * so they are excluded before comparison.
 */
const IGNORED_HEADERS = new Set([
  'host',
  'content-length',
  'user-agent',
  'accept',
  'accept-encoding',
  'accept-charset',
  'connection',
  'date',
  'cache-control',
  'pragma',
]);

/**
 * Credential-bearing headers. The reference implementation authenticates with
 * its own test credentials, so these are compared for presence only — a
 * missing credential header is a real difference, its value is not.
 */
const PRESENCE_ONLY =
  /^(authorization|x-api-key|api-key|api-key-version|idempotency-key|.*secret.*|.*token.*|.*signature.*|.*credential.*)$/i;

function sortedQuery(params: URLSearchParams): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of params.entries()) {
    const existing = out[key];
    if (existing) {
      existing.push(value);
    } else {
      out[key] = [value];
    }
  }
  for (const values of Object.values(out)) {
    values.sort();
  }
  return out;
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (IGNORED_HEADERS.has(lower)) continue;
    out[lower] = value;
  }
  return out;
}

/** Recursively orders object keys so that two equal structures compare equal. */
function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSort);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = deepSort(source[key]);
    }
    return out;
  }
  return value;
}

/**
 * Decode a body into a comparable structure.
 *
 * Form-encoded bodies are compared as sorted key→values maps because field
 * order carries no meaning; JSON is compared structurally. Anything else is
 * compared as an exact string.
 */
function normalizeBody(body: string | null | undefined, contentType?: string): unknown {
  if (body === undefined || body === null || body === '') return null;

  const type = contentType ?? '';
  if (type.includes('json')) {
    try {
      return deepSort(JSON.parse(body));
    } catch {
      return body;
    }
  }

  if (type.includes('x-www-form-urlencoded')) {
    const out: Record<string, string[]> = {};
    for (const [key, value] of new URLSearchParams(body).entries()) {
      const existing = out[key];
      if (existing) {
        existing.push(value);
      } else {
        out[key] = [value];
      }
    }
    for (const values of Object.values(out)) {
      values.sort();
    }
    return out;
  }

  return body;
}

export function normalizeRequest(request: RawHttpRequest): NormalizedRequest {
  const url = new URL(request.url);
  const headers = normalizeHeaders(request.headers);
  return {
    method: request.method.toUpperCase(),
    origin: url.origin,
    path: url.pathname,
    query: sortedQuery(url.searchParams),
    headers,
    body: normalizeBody(request.body, headers['content-type']),
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => key in right && deepEqual(left[key], right[key]));
  }
  return false;
}

function headerDiff(
  expected: Record<string, string>,
  actual: Record<string, string>,
): string[] {
  const differences: string[] = [];
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();

  for (const name of names) {
    const inExpected = name in expected;
    const inActual = name in actual;

    if (inExpected && !inActual) {
      differences.push(`missing header "${name}"`);
      continue;
    }
    if (!inExpected && inActual) {
      differences.push(`unexpected header "${name}"`);
      continue;
    }
    if (PRESENCE_ONLY.test(name)) {
      // Both present: the value is credential-bearing and legitimately differs.
      continue;
    }
    if (expected[name] !== actual[name]) {
      differences.push(
        `header "${name}" differs: expected ${JSON.stringify(expected[name])}, got ${JSON.stringify(actual[name])}`,
      );
    }
  }

  return differences;
}

/**
 * Compare two requests and report every semantic difference.
 *
 * An empty `differences` array means the two implementations construct the
 * same request. Nothing is fuzzy: a different path, an extra field, or a
 * missing header is reported explicitly.
 */
export function diffRequests(expected: RawHttpRequest, actual: RawHttpRequest): DiffResult {
  const left = normalizeRequest(expected);
  const right = normalizeRequest(actual);
  const differences: string[] = [];

  if (left.method !== right.method) {
    differences.push(`method differs: expected ${left.method}, got ${right.method}`);
  }
  if (left.origin !== right.origin) {
    differences.push(`origin differs: expected ${left.origin}, got ${right.origin}`);
  }
  if (left.path !== right.path) {
    differences.push(`path differs: expected ${left.path}, got ${right.path}`);
  }
  if (!deepEqual(left.query, right.query)) {
    differences.push(
      `query differs: expected ${JSON.stringify(left.query)}, got ${JSON.stringify(right.query)}`,
    );
  }
  differences.push(...headerDiff(left.headers, right.headers));
  if (!deepEqual(left.body, right.body)) {
    differences.push(
      `body differs:\n    expected: ${JSON.stringify(left.body)}\n    got:      ${JSON.stringify(right.body)}`,
    );
  }

  return { equal: differences.length === 0, differences };
}

import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import schema from './schema.json' with { type: 'json' };
import type { Manifest } from './types.js';

/** A manifest that failed schema validation, with per-field messages. */
export class ManifestValidationError extends Error {
  readonly issues: string[];

  constructor(subject: string, issues: string[]) {
    super(
      `Manifest "${subject}" failed validation:\n` +
        issues.map((issue) => `  - ${issue}`).join('\n'),
    );
    this.name = 'ManifestValidationError';
    this.issues = issues;
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });

// Registered locally rather than pulling in ajv-formats: the generator only
// needs to reject obviously malformed URLs and dates, not to be a URI parser.
ajv.addFormat('uri', /^https?:\/\/[^\s]+$/);
ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);

const compiled = ajv.compile<Manifest>(schema);

function describe(error: ErrorObject): string {
  const path = error.instancePath || '(root)';
  const extra = error.params as Record<string, unknown>;
  const detail =
    typeof extra['additionalProperty'] === 'string'
      ? ` (unexpected property "${extra['additionalProperty']}")`
      : typeof extra['allowedValues'] === 'string' ||
          Array.isArray(extra['allowedValues'])
        ? ` (allowed: ${(extra['allowedValues'] as unknown[]).join(', ')})`
        : '';
  return `${path} ${error.message ?? 'is invalid'}${detail}`;
}

/**
 * Validate an unknown value against the manifest JSON Schema.
 *
 * Returns the typed manifest, or throws {@link ManifestValidationError}.
 * `unknown` is never silently coerced into a default — absence of evidence is
 * not evidence of support.
 */
export function validateManifest(value: unknown, subject = '<inline>'): Manifest {
  if (!compiled(value)) {
    const issues = (compiled.errors ?? []).map(describe);
    throw new ManifestValidationError(subject, issues);
  }
  return value;
}

/** True when a value satisfies the schema. Used by tests and the UI layer. */
export function isValidManifest(value: unknown): boolean {
  return compiled(value) === true;
}

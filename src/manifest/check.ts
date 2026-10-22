import type { Manifest } from './types.js';

/**
 * Semantic checks that JSON Schema cannot express: cross-field invariants
 * where a well-shaped manifest would still generate something unsafe or
 * silently broken.
 *
 * These are hard failures. Generating a webhook handler that cannot verify a
 * signature, or a client that references a credential the config loader never
 * loads, is worse than refusing to emit.
 */
export function checkManifest(manifest: Manifest): string[] {
  const problems: string[] = [];
  const { webhooks, auth } = manifest;
  const verification = webhooks.verification;
  const signature = webhooks.signature;
  const credentialNames = new Set(auth.credential_fields.map((field) => field.name));

  const needsSignature = verification === 'hmac_local' || verification === 'static_secret_header';
  if (needsSignature && !signature) {
    problems.push(
      `webhooks.verification is "${verification}" but webhooks.signature is missing.`,
    );
  }

  if (signature) {
    if (signature.secret && !credentialNames.has(signature.secret)) {
      problems.push(
        `webhooks.signature.secret references credential "${signature.secret}", which is not declared in auth.credential_fields.`,
      );
    }
    if (verification === 'hmac_local' && !signature.tolerance_seconds) {
      problems.push(
        'webhooks.signature.tolerance_seconds is required for hmac_local: without a replay window a captured request can be replayed indefinitely.',
      );
    }
    if (verification === 'unsigned_allowlist' && signature) {
      problems.push(
        'webhooks.signature is declared but verification is unsigned_allowlist. A signature that is never checked is misleading; remove it or set verification to hmac_local.',
      );
    }
  }

  if (!webhooks.event_id_field) {
    problems.push(
      'webhooks.event_id_field is required: without it events cannot be deduplicated and every retry would be processed twice.',
    );
  }

  if (manifest.tokenization) {
    const { publishable_key: publishableKey } = manifest.tokenization;
    if (!credentialNames.has(publishableKey)) {
      problems.push(
        `tokenization.publishable_key references credential "${publishableKey}", which is not declared in auth.credential_fields.`,
      );
    }
    const referenced = auth.credential_fields.find((field) => field.name === publishableKey);
    if (referenced?.secret) {
      problems.push(
        `tokenization.publishable_key references "${publishableKey}", which is marked secret. A publishable key is sent to the browser and must be declared with secret: false.`,
      );
    }
  }

  return problems;
}

// GENERATED FILE — do not edit by hand.
//
// Fail-closed configuration. The integration refuses to run with incomplete or
// unsafe settings rather than guessing, defaulting to live, or silently
// degrading. Every missing variable is reported at once.

export interface Config {
  /** Secret API key. `sk_test_…` in sandbox, `sk_live_…` in production. */
  secretKey: string;
  /** Endpoint signing secret (`whsec_…`) used to verify inbound webhooks. */
  webhookSecret: string;
  /** Publishable key (`pk_test_…`) for the browser tokenization component. Not a secret. */
  publishableKey: string;
  /** Base URL for the selected environment. */
  baseUrl: string;
  /** 'sandbox' unless VAULT_ENVIRONMENT says otherwise. */
  environment: 'sandbox' | 'live';
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function read(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Load configuration from the environment. Fails closed.
 *
 * Live traffic is opt-in: the default environment is sandbox, and the live base
 * URL is refused unless VAULT_ALLOW_LIVE is explicitly 'true'.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing: string[] = [];

  const secretKey = read(env, "STRIPE_SECRET_KEY");
  if (secretKey === undefined) {
    missing.push("STRIPE_SECRET_KEY");
  }
  const webhookSecret = read(env, "STRIPE_WEBHOOK_SECRET");
  if (webhookSecret === undefined) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }
  const publishableKey = read(env, "STRIPE_PUBLISHABLE_KEY");
  if (publishableKey === undefined) {
    missing.push("STRIPE_PUBLISHABLE_KEY");
  }

  if (missing.length > 0) {
    throw new ConfigurationError(
      'Missing required configuration. Set the following environment variables and try again:\n' +
        missing.map((name) => `  - ${name}`).join('\n'),
    );
  }

  const environment = read(env, 'VAULT_ENVIRONMENT') ?? 'sandbox';
  if (environment !== 'sandbox' && environment !== 'live') {
    throw new ConfigurationError(
      `VAULT_ENVIRONMENT must be 'sandbox' or 'live'; got "${environment}".`,
    );
  }

  if (environment === 'live' && read(env, 'VAULT_ALLOW_LIVE') !== 'true') {
    throw new ConfigurationError(
      'Refusing to run against the live API. Set VAULT_ALLOW_LIVE=true to opt in; sandbox is the default.',
    );
  }

  const baseUrl =
    environment === 'live' ? "https://api.stripe.com" : "https://api.stripe.com";

  return {
    secretKey: secretKey!,
    webhookSecret: webhookSecret!,
    publishableKey: publishableKey!,
    baseUrl,
    environment,
  };
}

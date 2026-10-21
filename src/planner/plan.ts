import {
  CANONICAL_OPERATIONS,
  type CanonicalOperation,
  type CapabilityKey,
  type CapabilityStatus,
  type Manifest,
  type Surface,
} from '../manifest/types.js';

/** Template ids the emitter knows how to render. */
export const TEMPLATE_IDS = [
  'package_json',
  'tsconfig',
  'env_example',
  'types',
  'config',
  'client',
  'routes',
  'readme',
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

/**
 * What the generator will do with one canonical operation.
 *
 * `stub` is not a failure — it is the honest outcome for a capability that is
 * `unknown`, `unsupported`, or not modelled at all. The generator emits a
 * throwing function plus a documented gap rather than pretending.
 */
export type OperationDisposition = 'emit' | 'emit_with_limitation' | 'stub';

export interface OperationPlan {
  operation: CanonicalOperation;
  capability: CapabilityKey | null;
  status: CapabilityStatus | 'absent';
  disposition: OperationDisposition;
  reason: string;
  source?: string;
}

export interface EnvVar {
  /** Environment variable the generated config loader reads. */
  env: string;
  /** Logical field name used in generated code. */
  name: string;
  required: boolean;
  secret: boolean;
  description?: string;
  /** `provider` variables come from the manifest; `generator` ones are universal. */
  origin: 'provider' | 'generator';
}

/**
 * Variables every generated integration understands, independent of provider.
 * `VAULT_ALLOW_LIVE` makes live traffic opt-in: sandbox is the default and a
 * live base URL is refused unless it is explicitly enabled.
 */
export const GENERATOR_ENV_VARS: ReadonlyArray<EnvVar> = [
  {
    env: 'VAULT_ENVIRONMENT',
    name: 'environment',
    required: false,
    secret: false,
    origin: 'generator',
    description: "Target environment: 'sandbox' (default) or 'live'.",
  },
  {
    env: 'VAULT_ALLOW_LIVE',
    name: 'allow_live',
    required: false,
    secret: false,
    origin: 'generator',
    description: "Must be 'true' to permit the live base URL. Refused otherwise.",
  },
];

export interface PlannedFile {
  /** Path relative to the output directory, POSIX separators. */
  path: string;
  template: TemplateId;
  description: string;
}

export interface Plan {
  provider: {
    id: string;
    display_name: string;
    strategy: 'native';
    surface: Surface;
    oracle_connector?: string;
  };
  outDir: string;
  files: PlannedFile[];
  envVars: EnvVar[];
  operations: OperationPlan[];
  gaps: OperationPlan[];
  warnings: string[];
}

const FILE_PLAN: ReadonlyArray<PlannedFile> = [
  {
    path: 'package.json',
    template: 'package_json',
    description: 'Generated project manifest (no runtime dependencies)',
  },
  {
    path: 'tsconfig.json',
    template: 'tsconfig',
    description: 'TypeScript configuration for the generated project',
  },
  {
    path: '.env.example',
    template: 'env_example',
    description: 'Required environment variables, with no secret values',
  },
  {
    path: 'src/types.ts',
    template: 'types',
    description: 'Shared request/response types for the canonical interface',
  },
  {
    path: 'src/config.ts',
    template: 'config',
    description: 'Fail-closed configuration loader',
  },
  {
    path: 'src/client.ts',
    template: 'client',
    description: 'Typed provider client over direct HTTPS',
  },
  {
    path: 'src/routes.ts',
    template: 'routes',
    description: 'Framework-agnostic route handlers',
  },
  {
    path: 'README.md',
    template: 'readme',
    description: 'Integration guide, capability matrix, reconciliation notes',
  },
];

function planOperation(
  manifest: Manifest,
  operation: CanonicalOperation,
): OperationPlan {
  const op = manifest.operations[operation];

  if (!op) {
    return {
      operation,
      capability: null,
      status: 'absent',
      disposition: 'stub',
      reason: `No "${operation}" endpoint is modelled in the manifest.`,
    };
  }

  const capability = manifest.capabilities[op.capability];
  const status: CapabilityStatus | 'absent' = capability?.status ?? 'absent';

  if (status === 'verified') {
    return {
      operation,
      capability: op.capability,
      status,
      disposition: 'emit',
      reason: `Documented and mapped to ${op.method} ${op.path}.`,
      ...(capability?.source ? { source: capability.source } : {}),
    };
  }

  if (status === 'partial') {
    return {
      operation,
      capability: op.capability,
      status,
      disposition: 'emit_with_limitation',
      reason: capability?.notes ?? 'Partially documented; limitations are emitted inline.',
      ...(capability?.source ? { source: capability.source } : {}),
    };
  }

  return {
    operation,
    capability: op.capability,
    status,
    disposition: 'stub',
    reason:
      capability?.notes ??
      (status === 'absent'
        ? `Capability "${op.capability}" is not declared in the manifest.`
        : `Capability is ${status}; the generator will not claim it works.`),
    ...(capability?.source ? { source: capability.source } : {}),
  };
}

function collectWarnings(manifest: Manifest, operations: OperationPlan[]): string[] {
  const warnings: string[] = [];

  const { verification, notification_url_binding: urlBound } = manifest.webhooks;
  if (verification === 'unsigned_allowlist') {
    warnings.push(
      'Webhooks are UNSIGNED. Generated handlers cannot verify authenticity and must rely on an IP allowlist plus a server-side status confirmation before fulfilment.',
    );
  }
  if (verification === 'static_secret_header') {
    warnings.push(
      'Webhooks use a static shared secret, not an HMAC. This is weaker than a signed payload and is flagged in the generated code.',
    );
  }
  if (verification === 'remote_verify') {
    warnings.push(
      'Webhook verification requires a network call back to the provider and is not a local HMAC check.',
    );
  }
  if (urlBound) {
    warnings.push(
      'The webhook signature covers the notification URL. The callback URL must be registered exactly and must not change.',
    );
  }

  if (manifest.auth.oauth_required_for_seller_context) {
    warnings.push(
      'Acting on behalf of a seller requires OAuth. The token lifecycle is stubbed and documented, not implemented, in this skeleton.',
    );
  }

  if (manifest.distribution.vendor_sdk !== 'prohibited') {
    warnings.push(
      `distribution.vendor_sdk is "${manifest.distribution.vendor_sdk}". Vault-Payments never copies provider SDKs into output; review this manifest.`,
    );
  }

  if (manifest.attribution.required_fields.length > 0) {
    warnings.push(
      `Provider requires attribution fields on every request: ${manifest.attribution.required_fields.join(', ')}. These are injected by the generated client, not left to the caller.`,
    );
  }

  for (const planned of operations) {
    if (planned.disposition === 'stub' && planned.status !== 'absent') {
      warnings.push(
        `${planned.operation} is marked "${planned.status}" and is emitted as a throwing stub, not an implementation.`,
      );
    }
  }

  if (manifest.sandbox.access === 'partner_gated') {
    warnings.push(
      'Sandbox access is partner-gated. Contract tests cannot run until access is granted.',
    );
  }

  const terminals = manifest.terminals;
  if (
    terminals.physical_terminal !== 'unsupported' ||
    terminals.tap_to_pay_mobile !== 'unsupported'
  ) {
    warnings.push(
      'Terminals and Tap to Pay are a separate approval track and are not generated by this skeleton. Terminal support does not follow processor support.',
    );
  }

  return warnings;
}

/**
 * Build the complete file plan for a provider.
 *
 * The plan is the contract between the dry-run output and the emitter: both
 * read the same list, so what is shown is exactly what is written.
 */
export function buildPlan(manifest: Manifest, outDir: string): Plan {
  const operations = CANONICAL_OPERATIONS.map((operation) =>
    planOperation(manifest, operation),
  );

  const envVars: EnvVar[] = [
    ...manifest.auth.credential_fields.map((field) => ({
      env: field.env,
      name: field.name,
      required: field.required,
      secret: field.secret,
      origin: 'provider' as const,
      ...(field.description ? { description: field.description } : {}),
    })),
    ...GENERATOR_ENV_VARS.map((envVar) => ({ ...envVar })),
  ];

  return {
    provider: {
      id: manifest.id,
      display_name: manifest.display_name,
      strategy: manifest.strategy,
      surface: manifest.surface,
      ...(manifest.oracle_connector
        ? { oracle_connector: manifest.oracle_connector }
        : {}),
    },
    outDir,
    files: FILE_PLAN.map((file) => ({ ...file })),
    envVars,
    operations,
    gaps: operations.filter((planned) => planned.disposition === 'stub'),
    warnings: collectWarnings(manifest, operations),
  };
}

const DISPOSITION_LABEL: Record<OperationDisposition, string> = {
  emit: 'emit',
  emit_with_limitation: 'emit (limited)',
  stub: 'stub (gap)',
};

/** Render a plan as human-readable text for `--dry-run`. */
export function formatPlan(plan: Plan): string {
  const lines: string[] = [];
  const { provider } = plan;

  lines.push(`Provider   ${provider.display_name} (${provider.id})`);
  lines.push(`Strategy   ${provider.strategy}`);
  lines.push(`Surface    ${provider.surface}`);
  if (provider.oracle_connector) {
    lines.push(
      `Oracle     Prism connector "${provider.oracle_connector}" (build-time only, never emitted)`,
    );
  }
  lines.push(`Output     ${plan.outDir}`);
  lines.push('');

  lines.push(`Files (${plan.files.length})`);
  const width = Math.max(...plan.files.map((file) => file.path.length));
  for (const file of plan.files) {
    lines.push(`  ${file.path.padEnd(width)}  ${file.description}`);
  }
  lines.push('');

  lines.push(`Operations (${plan.operations.length})`);
  for (const planned of plan.operations) {
    lines.push(
      `  ${planned.operation.padEnd(10)} ${DISPOSITION_LABEL[planned.disposition].padEnd(
        15,
      )} ${planned.status}`,
    );
    lines.push(`  ${' '.repeat(10)} ${planned.reason}`);
    if (planned.source) lines.push(`  ${' '.repeat(10)} source: ${planned.source}`);
  }
  lines.push('');

  lines.push(`Required environment (${plan.envVars.length})`);
  for (const envVar of plan.envVars) {
    const flags = [
      envVar.required ? 'required' : 'optional',
      envVar.secret ? 'secret' : 'not-secret',
    ].join(', ');
    lines.push(`  ${envVar.env.padEnd(24)} ${flags}`);
  }
  lines.push('');

  if (plan.gaps.length > 0) {
    lines.push(`Gaps (${plan.gaps.length}) — emitted as throwing stubs, never as working code`);
    for (const gap of plan.gaps) {
      lines.push(`  ${gap.operation}: ${gap.reason}`);
    }
    lines.push('');
  }

  if (plan.warnings.length > 0) {
    lines.push(`Warnings (${plan.warnings.length})`);
    for (const warning of plan.warnings) {
      lines.push(`  ! ${warning}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

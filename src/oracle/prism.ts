/**
 * Optional build-time conformance oracle.
 *
 * Prism is never a dependency of the generator or of generated code. When it
 * happens to be installed on a platform that has a native library, this module
 * can drive `callReq` to obtain the HTTP request the reference implementation
 * would send, so tests can diff it against what we emit.
 *
 * Prism has no Windows, no Intel-macOS, no musl build, and needs glibc ≥ 2.38,
 * so this is expected to be unavailable almost everywhere. Every failure mode
 * returns a *reason* and the caller skips — it never fails a build.
 */

const PRISM_PACKAGE = 'hyperswitch-prism';
const PRISM_FLOWS_MODULE =
  'hyperswitch-prism/dist/src/payments/_generated_flows.js';

/**
 * Platform targets Prism 0.6.0 actually ships, verified from its npm tarball.
 * Anything else fails at the loader, so probing is skipped before the
 * multi-hundred-megabyte library is ever loaded.
 */
const SUPPORTED_TARGETS = new Set(['darwin-arm64', 'linux-arm64', 'linux-x64']);

export interface PrismProbe {
  available: boolean;
  /** Why the oracle is unavailable, when it is. */
  reason?: string;
}

interface ProtoMessageClass {
  create(message: unknown): unknown;
  encode(message: unknown): { finish(): Uint8Array };
  decode(
    bytes: Uint8Array,
  ): { url?: string | null; method?: string | null; headers?: Record<string, string> | null; body?: Uint8Array | null };
}

/** The subset of Prism's generated protobuf namespace the oracle touches. */
interface ProtoNamespace {
  types: Record<string, ProtoMessageClass>;
  FfiConnectorHttpRequest: ProtoMessageClass;
  FfiOptions: ProtoMessageClass;
  Environment: Record<string, unknown>;
}

interface PrismFlowsModule {
  FLOWS: Record<string, { request: string; response: string }>;
}

interface PrismClient {
  callReq(flow: string, requestBytes: Uint8Array, optionsBytes: Uint8Array): Uint8Array;
}

export interface ReferenceRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Cheap platform check, so an unsupported host never loads the library. */
export function prismPlatformSupported(): boolean {
  return SUPPORTED_TARGETS.has(`${process.platform}-${process.arch}`);
}

/**
 * Probe for Prism without committing to a full load.
 *
 * Returns a reason whenever the oracle cannot run. The reason is information,
 * not an error: the generator must build, run and emit with or without Prism.
 */
export async function probePrism(): Promise<PrismProbe> {
  if (!prismPlatformSupported()) {
    return {
      available: false,
      reason: `No Prism native library for ${process.platform}-${process.arch}. The oracle runs in the pinned Ubuntu 24.04 CI job.`,
    };
  }

  try {
    await import(/* @vite-ignore */ PRISM_PACKAGE);
  } catch (error) {
    return {
      available: false,
      reason: `${PRISM_PACKAGE} could not be loaded: ${(error as Error).message}`,
    };
  }

  return { available: true };
}

/** Drives Prism's `callReq` to build reference HTTP requests. */
export class PrismOracle {
  readonly #client: PrismClient;
  readonly #proto: ProtoNamespace;
  readonly #flows: PrismFlowsModule;

  private constructor(client: PrismClient, proto: ProtoNamespace, flows: PrismFlowsModule) {
    this.#client = client;
    this.#proto = proto;
    this.#flows = flows;
  }

  /**
   * Load Prism and construct an oracle.
   *
   * Returns `oracle: undefined` plus a reason when Prism is unavailable, so
   * callers can skip rather than fail.
   */
  static async load(): Promise<{ probe: PrismProbe; oracle?: PrismOracle }> {
    const probe = await probePrism();
    if (!probe.available) {
      return { probe };
    }

    try {
      const [prismModule, flowsModule] = await Promise.all([
        import(/* @vite-ignore */ PRISM_PACKAGE),
        import(/* @vite-ignore */ PRISM_FLOWS_MODULE),
      ]);

      const proto = (prismModule as unknown as { types?: ProtoNamespace }).types;
      if (!proto) {
        return {
          probe: { available: false, reason: `${PRISM_PACKAGE} did not expose its protobuf namespace.` },
        };
      }

      // CJS module: exports may arrive under `default`.
      const flows = ((flowsModule as Record<string, unknown>)['default'] ??
        flowsModule) as PrismFlowsModule;

      const clientModule = await import(/* @vite-ignore */ PRISM_PACKAGE);
      const ClientClass = (clientModule as unknown as { UniffiClient?: new () => PrismClient })
        .UniffiClient;
      if (!ClientClass) {
        return {
          probe: { available: false, reason: `${PRISM_PACKAGE} did not export UniffiClient.` },
        };
      }

      return {
        probe,
        oracle: new PrismOracle(new ClientClass(), proto, flows),
      };
    } catch (error) {
      return {
        probe: {
          available: false,
          reason: `Prism loaded its metadata but failed to initialise: ${(error as Error).message}`,
        },
      };
    }
  }

  /** Flow names Prism knows, so a manifest can be checked against reality. */
  hasFlow(flow: string): boolean {
    return flow in this.#flows.FLOWS;
  }

  /**
   * Build the HTTP request Prism would send for `flow` with `message`.
   *
   * Construction mirrors Prism's own `ConnectorClient._executeFlow`: encode the
   * domain request, encode sandbox FfiOptions, call `callReq`, decode
   * `FfiConnectorHttpRequest`.
   */
  buildRequest(flow: string, message: unknown): ReferenceRequest {
    const descriptor = this.#flows.FLOWS[flow];
    if (!descriptor) {
      throw new Error(
        `Unknown Prism flow "${flow}". Known flows: ${Object.keys(this.#flows.FLOWS).slice(0, 20).join(', ')}…`,
      );
    }

    const requestType = this.#proto.types[descriptor.request];
    if (!requestType) {
      throw new Error(`Prism has no protobuf type "${descriptor.request}" for flow "${flow}".`);
    }

    const options = this.#proto.FfiOptions.create({
      environment: this.#proto.Environment.SANDBOX,
    });
    const optionsBytes = Buffer.from(this.#proto.FfiOptions.encode(options).finish());
    const requestBytes = Buffer.from(requestType.encode(message).finish());

    const result = this.#client.callReq(flow, requestBytes, optionsBytes);
    const decoded = this.#proto.FfiConnectorHttpRequest.decode(result);

    const body =
      decoded.body && decoded.body.byteLength > 0
        ? Buffer.from(decoded.body).toString('utf8')
        : null;

    return {
      method: decoded.method ?? 'GET',
      url: decoded.url ?? '',
      headers: decoded.headers ?? {},
      body,
    };
  }
}

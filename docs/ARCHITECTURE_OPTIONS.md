# Architecture Options — Vault-Payments

**Status:** Phase 0 decision record, revised by the Phase 0.5 feasibility gate
**Date:** 2026-10-21
**Scope:** Choose the foundation and generator architecture. No implementation.
**Revision:** Phase 0.5 disproved the Prism-as-connector-backend assumption. The foundation decision (independent, manifest-driven generator) stands; the Prism role does not. Corrections C1–C8 are applied throughout — see [`PHASE_0.5_FEASIBILITY.md`](PHASE_0.5_FEASIBILITY.md).

---

## 1. Problem framing

The product is a **generator**, not a payment switch.

That distinction drives everything below. A payment orchestrator (Hyperswitch, Kill Bill, Spreedly) sits **in the request path**: every authorization, capture and webhook flows through it, and the merchant inherits its uptime, upgrade cadence and PCI boundary. A generator sits **outside the request path**: it runs once, emits code into the user's repository, and then gets out of the way.

The requirements point unambiguously at the second model:

- "Generate an entire payment integration package"
- "Downloadable, locally runnable application"
- "Adding a 13th provider should not require modifying the universal engine"
- "Visually driven, checkbox-based provider selection"

A runtime switch can never satisfy "downloadable and locally runnable" without also asking the user to operate a payment platform. So the architecture question is not *"which payment platform do we fork?"* but *"which payment components can we reuse inside a generator we own?"*

---

## 2. Evaluation criteria

| # | Criterion | Weight | Why it matters |
|---|-----------|--------|----------------|
| C1 | License permits commercial reuse and redistribution | Critical | The project ships Apache-2.0. A GPL/AGPL dependency or an unlicensed plugin would poison the distribution. |
| C2 | Connector coverage of the 12 target providers | Critical | Determines custom-adapter workload. |
| C3 | Fits a generator (stateless, embeddable, codegen-friendly) | Critical | A service that must run continuously cannot be embedded in generated code. |
| C4 | Operational footprint for a local desktop tool | High | "Downloadable, locally runnable" rules out a 28-container stack. |
| C5 | Machine-readable capability metadata | High | The checkbox UI and capability matrix must be generated from data, not hand-maintained prose. |
| C6 | Webhook normalization and signature verification | High | Required by the security mandate. |
| C7 | Maintenance health | High | Payment APIs drift. A stale dependency is a liability. |
| C8 | Windows support (current dev environment) | Medium | Not a hard requirement, but a hard *cost* if absent. |
| C9 | Provider terms permit third-party tooling | Critical | Legal, not technical. See `SECURITY_AND_LICENSING.md`. |

---

## 3. Candidate foundations — measured evidence

All figures verified on 2026-10-21 from the public repositories and package registries.

| Project | Language | License | Stars | Last push | Role |
|---------|----------|---------|-------|-----------|------|
| `juspay/hyperswitch` | Rust | Apache-2.0 | 45,384 | 2026-10-21 | Payment switch / orchestrator |
| `juspay/hyperswitch-prism` | Rust + FFI SDKs | Apache-2.0 | 1,395 | 2026-10-21 | **Stateless connector library** |
| `killbill/killbill` | Java | Apache-2.0 | 5,808 | 2026-10-19 | Subscription billing + payments |
| `activemerchant/active_merchant` | Ruby | MIT | 4,603 | 2025-11-04 | Gateway abstraction library |
| `thephpleague/omnipay` | PHP | MIT | 6,064 | 2026-07-10 | Gateway abstraction library |
| `Payum/Payum` | PHP | MIT | 1,926 | 2026-10-19 | Gateway abstraction library |
| `OpenAPITools/openapi-generator` | Java | Apache-2.0 | 26,815 | 2026-10-21 | Code generation engine |
| `handlebars-lang/handlebars.js` | JavaScript | MIT | 18,688 | 2026-10-06 | Templating |

### 3.1 Hyperswitch — full platform

A production payment switch: routing, retries, vault, 120+ processors, control center, analytics.

Measured footprint from its own `docker-compose.yml` (545 lines) — the default local stack starts:

> Postgres, Redis (standalone **and** cluster), Kafka + Kafka UI, ClickHouse, OpenSearch + Dashboards, Grafana, Loki, Tempo, OpenTelemetry Collector, Prometheus, Vector, Superposition, `hyperswitch-server`, `hyperswitch-producer`, `hyperswitch-consumer`, `hyperswitch-drainer`, `hyperswitch-web`, `hyperswitch-control-center`, MailHog, RedisInsight.

That is **30 services** defined in its default compose file before a single payment is attempted.

**Assessment:** excellent engineering, wrong shape for this product. Adopting it as the backend would (a) require users to operate a payment platform, (b) pull the generator's users into the switch's PCI boundary, and (c) duplicate a Control Center that already exists.

### 3.2 Hyperswitch Prism — the connector reference

Prism is the part of Hyperswitch worth keeping — as a **specification and regression baseline**, not as a dependency. It is:

- **Stateless** — a unified connector library, no database, no queue, no scheduler.
- **Extracted from Hyperswitch** — carries years of hardened per-processor fixes.
- **Apache-2.0**.
- **Polyglot** — Node.js, Python, Java SDKs documented; architecture also lists .NET, Go, Haskell.
- **Actively released** — latest version 0.6.0, registry metadata updated 2026-10-15.
- **Self-describing** — ships `docs-generated/llms.txt` with, per connector: `connector_id`, `scenarios`, `flows`, and runnable example paths.

Measured coverage: **128 connectors**. Per-connector flow metadata is machine-readable, e.g.:

```
=== Stripe ===
connector_id: stripe
scenarios: checkout_autocapture, checkout_card, refund, void_payment, get_payment
flows: authorize, capture, create_client_authentication_token, customer_create, get,
       handle_event, incremental_authorization, parse_event, proxy_authorize,
       proxy_setup_recurring, recurring_charge, refund, refund_get, setup_recurring,
       token_authorize, token_setup_recurring, void
```

This is precisely the metadata a generator needs. It is also exactly what a hand-written capability matrix would otherwise have to invent.

**What Prism is not (Phase 0.5 correction):**

Prism has exactly two modes — embedded native library, or gRPC microservice. There is **no code-generation mode**. Connector logic is compiled into the shipped native binaries; the JavaScript and Python packages that Prism "generates" are client bindings *to those binaries*, not provider integration source. It therefore cannot act as a connector backend *for generated code*, which is what Phase 0 had assumed.

**Critical constraint (verified directly, not from docs):**

| Channel | Windows | Intel macOS | Linux | Evidence |
|---------|---------|-------------|-------|----------|
| PyPI wheels | **No** | **No** | glibc ≥ 2.39 | `hyperswitch_prism-0.6.0` ships `macosx_11_0_arm64`, `manylinux_2_39_x86_64`, `manylinux_2_39_aarch64`. No `win_amd64`, no sdist. |
| npm package | **No** | **No** | glibc ≥ 2.38 | Tarball contains `darwin-arm64/*.dylib`, `linux-arm64/*.so`, `linux-x64/*.so`. No `.dll`, no `darwin-x64`. |
| Docs — README | Claims yes | Claims yes | Yes | Claims "macOS (x64, arm64) … or Windows (x64)" |
| Docs — product page | **No** | No | Yes | Lists macOS Apple Silicon and Linux x86_64 |

The documentation contradicts itself; the **artifacts do not**.

Additional measured constraints:

- **glibc floor.** Scanning the x86-64 `libconnector_service_ffi.so` for symbol versions gives a maximum of `GLIBC_2.38`. That excludes Ubuntu 22.04 (2.35), Debian 12 (2.36), RHEL 9 (2.34) and Amazon Linux 2023 (2.34). Alpine is musl and unsupported entirely.
- **Footprint.** The npm tarball is 107.7 MB compressed; the three native libraries unpack to **489 MB**. All platforms ship in one package, so every install and every CI job pays the full cost.
- **Windows fails at the loader, not at packaging.** `uniffi_client.js` resolves `generated/${process.platform}-${process.arch}/` and selects `.dylib` only for darwin, `.so` otherwise. On Windows it looks for `generated/win32-x64/` and a `.so`; neither exists.

There is also **no confirmed published Docker image** for Prism's gRPC mode — the GitHub packages API requires authentication and `v0.6.0` publishes no release assets — so the docs describe building it from source with Rust and `protoc`.

**The one reusable seam.** The FFI exposes `callReq(flow, …)` ("Build the connector HTTP request for any flow"), `callRes(flow, …)` and `callDirect(flow, …)`, operating on protobuf-encoded HTTP request/response objects. Prism is therefore a pure request-builder and response-parser, and can be driven at build time to produce reference requests. That is the basis for using it as a conformance oracle — not as a dependency.

### 3.3 Kill Bill — subscription billing

Apache-2.0, production since 2010, genuinely mature — but aimed at a different problem: catalogs, plans, entitlements, invoices, dunning, usage metering. Deployment is Apache Tomcat + MySQL/MariaDB + Kaui.

Its payment surface is a **plugin API**, and the live plugin inventory for our 12 providers is thin:

| Plugin | Language | License | Last push |
|--------|----------|---------|-----------|
| `killbill-stripe-plugin` | Java | Apache-2.0 | 2026-10-05 |
| `killbill-adyen-plugin` | Java | Apache-2.0 | 2026-09-30 |
| `killbill-braintree` | Java | **none declared** | 2026-10-19 |
| `killbill-payeezy-plugin` | Java | — | 2016 (dead) |
| `killbill-paypal-demo` | Ruby | — | 2018 (dead) |
| `killbill-cybersource-plugin` | Ruby | — | 2018 (dead) |
| `killbill-firstdata-e4-plugin` | Ruby | — | 2016 (dead) |
| `killbill-payu-latam-plugin` | Ruby | — | 2016 (dead) |

**Assessment:** 3 of 12, one of which has no declared license — a redistribution blocker. Wrong domain, and its plugin API is Java-only, so nothing transfers to a Node/Python code generator.

### 3.4 Gateway abstraction libraries (ActiveMerchant / Omnipay / Payum)

| Library | Language | License | Our-12 coverage | Usable as runtime? |
|---------|----------|---------|-----------------|--------------------|
| ActiveMerchant | Ruby | MIT | ~8/12 (`adyen`, `authorize_net`, `braintree`, `paypal`, `shift4`, `stripe`, `worldpay`, `vantiv`) | No — Ruby only, last push ≈11 months stale |
| Omnipay | PHP | MIT | per-gateway packages | No — PHP only |
| Payum | PHP | MIT | gateway abstraction | No — PHP only |

None support Square, Clover, or GoDaddy. They remain valuable as **reference implementations of provider quirks** — that is how they should be used.

---

## 4. Options considered

> **Note on option numbering.** Phase 0.5 re-ran the comparison on a different axis — Prism's role (runtime library / generation-time dependency / no Prism / hybrid). Those are Options A–D in [`PHASE_0.5_FEASIBILITY.md`](PHASE_0.5_FEASIBILITY.md) §4, and should not be confused with the foundation Options A–D below. The foundation choice (C+D) stands. The Prism **role** was reversed.

### Option A — Build a UI on top of Hyperswitch

Run Hyperswitch; generate a merchant configuration and a thin client.

- ✅ 120+ connectors immediately; webhook normalization, vault, retries included.
- ❌ Not a generator; emits configuration + a client for *our* service.
- ❌ ~28-service local stack; violates "downloadable, locally runnable".
- ❌ Puts a payment switch in the merchant's request path and PCI boundary.
- ❌ Duplicates Hyperswitch Control Center.
- ❌ The 13th provider is "wait for Hyperswitch to add it".

**Rejected.**

### Option B — Build on Kill Bill

- ✅ Apache-2.0, mature, real payment plugin API.
- ❌ 3/12 providers, one unlicensed.
- ❌ Java/Tomcat/MySQL; subscription-billing semantics are incidental to our goal.
- ❌ No generator; no codegen metadata.
- ❌ Still a runtime service in the request path.

**Rejected.**

### Option C — Independent generator with a provider-manifest engine

The generator owns a canonical integration interface; each provider is a declarative manifest plus an adapter.

- ✅ No runtime dependency, no lock-in, no added PCI scope.
- ✅ Genuinely downloadable and offline.
- ✅ The 13th provider is a data + template addition, not an engine change.
- ✅ Capability matrix, checkboxes, routes, webhooks and tests all derive from one manifest.
- ❌ We own provider drift for 12 providers.

### Option D — Reuse existing codegen tooling rather than build an engine

Stand on `openapi-generator` (Apache-2.0, 26.8k★) plus a template layer (Handlebars, MIT) for the emission step.

- ✅ Mature, battle-tested emission machinery; no bespoke template engine.
- ✅ Apache-2.0 / MIT throughout.
- ❌ Templates alone don't model payment semantics.

---

## 5. Decision (revised by Phase 0.5)

**Adopt C+D: an independent, manifest-driven generator, built on reusable codegen tooling, which emits *native* provider integrations.**

There is exactly **one runtime strategy: `native`**. Generated code calls the provider's own HTTP API with the user's own credentials. It contains no Vault-Payments runtime, no Prism, no sidecar, and no vendored provider SDK.

| Strategy | Status | What generated code does |
|----------|--------|--------------------------|
| `native` | **Adopted — the only strategy** | Direct provider HTTP calls with the user's own credentials; provider SDKs declared as ordinary dependencies rather than vendored |
| `prism` | **Rejected for generated output** | Would require a 489 MB native library and glibc ≥ 2.38, and has no Windows or Intel-macOS build |

### Prism's actual role: build-time conformance oracle

Prism is retained as an **optional, pinned, offline development aid** for the generator's own test suite:

1. Drive `callReq(flow, …)` to obtain the provider HTTP request Prism would send for a given input.
2. Drive the emitted native adapter with the same input.
3. Assert the requests match; fail CI on divergence.

This preserves the value of nine hardened connector implementations — as a specification and regression baseline — without putting a payment library in anyone's dependency tree. The oracle is not required to build, run, or use the generator, and it never ships.

### Why a single strategy is correct

Measured facts, not preference:

1. **Prism cannot emit connector source.** No codegen mode exists; connectors are compiled into the binaries.
2. **Prism is not portable enough to ship.** Linux needs glibc ≥ 2.38; there is no Windows build and no Intel-macOS build.
3. **Prism's coverage is incomplete for the MVP.** Only 5 of 9 connectors expose all six required operations.
4. **Prism has no terminal flows** — all 30 flows are online — so terminals would be native regardless.

A native path was already mandatory for Square, Clover, Windows, Intel macOS and terminals. Once it exists for those, a second runtime strategy buys portability loss in exchange for very little.

---

## 6. Target architecture

### 6.1 Three layers

```
┌─────────────────────────────────────────────────────────────┐
│  1. CAPABILITY LAYER  (pure data, no code)                   │
│     providers/<id>/manifest.yaml  +  JSON Schema validation  │
│     — endpoints, auth, operations, webhook scheme,           │
│       terminal support, sandbox, approval gates, terms       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  2. UNIVERSAL ENGINE  (provider-agnostic, contains zero      │
│     provider names)                                          │
│     — selection resolver   — config/secret contract          │
│     — route generator      — webhook subsystem               │
│     — reconciliation       — test-harness generator          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  3. ADAPTER LAYER  (one per provider, declarative +          │
│     optional code template pack)                             │
│     strategy: native                                         │
│     — direct provider HTTP, user's own credentials           │
│     — no Vault runtime, no Prism, no vendored SDK            │
└─────────────────────────────────────────────────────────────┘
```

The engine must never branch on a provider name. If `if (provider === 'stripe')` appears anywhere in layer 2, the architecture has failed the 13th-provider requirement.

### 6.2 Provider manifest — the contract

The manifest is the single source of truth. Everything else — UI checkboxes, capability matrix, generated routes, webhook handlers, tests — is derived from it.

```yaml
# illustrative shape (not a final schema)
id: example_gateway
display_name: Example Gateway
strategy: native          # the only runtime strategy
surface: default          # default | hosted_checkout | platform (Clover-style)
oracle_connector: example_gateway   # optional: Prism connector used only in CI

regions: [US, EU]
auth:
  model: bearer | api_key | oauth2_client_credentials | signature
  oauth_required_for_seller_context: false   # true for seller-scoped access (e.g. Square)
  credential_fields:
    - name: api_key
      required: true
      secret: true
      env: EXAMPLE_API_KEY

capabilities:
  payment.create:      verified
  payment.authorize:   verified
  payment.capture:     verified
  payment.void:        verified
  payment.refund:      partial      # partial refunds only
  payment.status:      verified
  idempotency:         verified

terminals:
  physical_terminal:   unsupported
  tap_to_pay_mobile:   unknown
  notes: "Terminal API requires separate enablement."

webhooks:
  registration: api | dashboard | none
  verification: hmac_local | static_secret_header | remote_verify | unsigned_allowlist
  notification_url_binding: false   # true when the callback URL is part of the signed string
  signature:
    header: Example-Signature
    algorithm: hmac-sha256
    signed_payload: "timestamp.raw_body"
  retry_window: "72h"
  replay_protection: manual
  notes: ""

sandbox:
  base_url: https://sandbox.example.com
  access: self_serve | partner_gated

approval:
  partner_program: false
  app_review: false
  notes: ""

attribution:
  required_fields: []      # e.g. Adyen applicationInfo.externalPlatform.name
  notes: ""

distribution:
  vendor_sdk: prohibited   # provider SDKs are declared dependencies, never bundled

sources:
  - https://docs.example.com/api
  - https://docs.example.com/webhooks
verified_at: 2026-10-21
```

Design rules:

- **Every capability carries a status**: `verified` | `partial` | `unsupported` | `unknown`.
- **Every claim carries a source URL** and a `verified_at` date.
- **Absence is not support.** `unknown` is a first-class value and must render as such in the UI.
- The generator **refuses to emit** a capability marked `unknown` or `unsupported`; it emits a stub plus a documented gap instead.
- **Webhook verification mode is mandatory.** `unsigned_allowlist` must be recorded explicitly and forces the generator to emit an allowlist check plus a visible warning; it can never be the default.
- **Attribution is generated, not documented.** When `attribution.required_fields` is non-empty, the emitted client injects them on every request.
- **`distribution.vendor_sdk` is `prohibited` by default.** The generator declares provider SDKs as ordinary dependencies and refuses to copy them into the output tree.

### 6.3 Generator pipeline

```
select providers + capabilities   (checkbox UI)
        │
        ▼
resolve manifests → validate against JSON Schema
        │
        ▼
detect conflicts   (e.g. two providers claim the same webhook path)
        │
        ▼
plan             (exact file list, diffs, required env vars)
        │
        ▼
emit             (templates + openapi-generator where applicable)
        │
        ▼
static gates     (no secrets in code, no raw PAN handling, signature stub present)
        │
        ▼
oracle diff      (optional: emitted request vs Prism callReq, where a connector exists)
        │
        ▼
scaffold tests   (sandbox-mode contract tests, webhook replay fixtures)
```

The **plan** step matters: the tool shows what it will write before writing it. Re-running against a dirty tree must produce a diff, not an overwrite.

### 6.4 Webhook subsystem (universal)

Generated webhook handlers must, for **every** provider:

1. **Verify the signature** before parsing the payload — constant-time comparison.
2. **Reject stale timestamps** (replay window) where the provider supplies a timestamp.
3. **Deduplicate** on the provider event ID via a unique constraint, not an in-memory set.
4. **Persist before acknowledging** — the handler writes the event durably, then returns 2xx.
5. **Process asynchronously** — never perform business logic inside the webhook request.
6. **Emit reconciliation guidance** — how to detect a missed event and re-fetch authoritative state.

Provider differences are expressed *in the manifest* (header name, algorithm, signed-payload construction, retry window), never in engine branches. This is essential because the schemes genuinely differ:

| Provider | Signature mechanism |
|----------|--------------------|
| Stripe | `Stripe-Signature`, `t=…,v1=…`, HMAC-SHA256 over `timestamp.payload` |
| Square | `x-square-hmacsha256-signature`, HMAC-SHA256 over **signature key + notification URL + raw body** |
| Clover (Hosted Checkout) | `Clover-Signature`, `t=…,v1=…`, HMAC-SHA256 over `timestamp.body` |
| Clover (platform webhooks) | `X-Clover-Auth` static shared secret — **not** HMAC |
| Authorize.net | `X-ANET-Signature`, HMAC-SHA512 with the merchant Signature Key |
| Braintree | `bt_signature` + `bt_payload` form fields |
| PayPal | verification via the `verify-webhook-signature` API call |

A single hand-written handler cannot serve these. A manifest-driven one can.

### 6.5 The 13th-provider test

A new provider must be addable by:

1. Adding `providers/<id>/manifest.yaml`.
2. Adding adapter templates **only if** the provider's shape is not already covered by a strategy.
3. Running `generate --provider <id> --dry-run`.

No file under the universal engine may change. This is a **CI-enforced** architectural rule, not a convention: a test asserts that the engine package contains no provider identifiers.

---

## 7. Deployment shapes

| Shape | Description | Windows | Linux | macOS |
|-------|-------------|---------|-------|-------|
| Local CLI + local web UI | Node process, browser UI, files written to the user's project | ✅ | ✅ | ✅ |
| VS Code extension | Same engine, embedded UI | ✅ | ✅ | ✅ |
| Docker Desktop | Containerised generation | ✅ via WSL2 | ✅ | ✅ |
| CI / GitHub Action | Headless generation and drift checks | ✅ | ✅ | ✅ |

**Consequence:** the generator has no native platform dependency, so every deployment shape works everywhere. The only platform-constrained component is the optional oracle, which runs in a single pinned CI job on Ubuntu 24.04 (glibc ≥ 2.38) and never ships.

---

## 8. Risks introduced by this choice

| Risk | Severity | Mitigation |
|------|----------|------------|
| We own provider API drift for 11 providers | High | Manifest `verified_at` + scheduled sandbox contract tests; oracle diff catches behavioural drift |
| Oracle fidelity is partial (request construction only) | Medium | Treat the oracle as a regression baseline, not a source of truth; sandbox tests remain the gate |
| Oracle adds a build-time platform constraint | Low | Run it in one pinned Ubuntu 24.04 CI job; the generator itself has no platform constraint |
| Generated code quality becomes the product's reputation | High | Golden-file tests per provider; CI diff review |
| Provider terms may prohibit generated SDK distribution | Critical | Never vendor provider SDKs; emit declared dependencies; obtain written confirmation before commercial launch — see `SECURITY_AND_LICENSING.md` §2.3 |
| Four providers need native supplements despite having a connector | Medium | Record per-provider MVP-operation gaps in the matrix; do not schedule them as pure "reuse" work |

---

## 9. Open questions to close before build

1. ~~Does a Windows Prism artifact exist?~~ **Answered: no.** No `win32-x64` build ships in 0.6.0. Whether one is planned is still unknown, but it no longer affects the architecture.
2. Is there a supported Prism gRPC container image? (Would simplify oracle CI; no published image confirmed.)
3. Which Prism connectors have been exercised in sandbox recently — not just implemented? (Determines how much the oracle is worth.)
4. For each of the 12, do the developer/partner terms permit a third-party generator? **Partial:** 4 of 12 agreements reviewed; 8 remain unknown. See `PHASE_0.5_FEASIBILITY.md` §6.
5. Terminal and Tap to Pay support must be verified **per provider**, independently of processor support.
6. Does an open-source generator trigger Adyen's technology-partner registration requirement?

---

## 10. Summary

| Question | Answer |
|----------|--------|
| Best OSS foundation | An **independent, manifest-driven generator**; **OpenAPI Generator + Handlebars** as the emission engine |
| Prism's role | **Optional build-time conformance oracle.** Never a runtime dependency, never in generated code |
| What we must build ourselves | The manifest engine, the native adapter layer, the universal webhook/config/reconciliation layers, and the visual planner |
| What we must not build on | Hyperswitch-the-switch, Kill Bill-the-billing-system, and Prism-as-a-runtime-library |
| Why | Prism cannot emit connector source, ships 489 MB, and has no Windows or Intel-macOS build; a generated integration must be portable and developer-owned |
| Biggest architectural constraint | Owning provider drift for 11 providers — offset by the oracle as a regression baseline |

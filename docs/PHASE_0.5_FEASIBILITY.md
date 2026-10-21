# Phase 0.5 — Technical Feasibility Gate

**Status:** Decision required. Research and validation only.
**Date:** 2026-10-21
**Supersedes:** the Prism-dependent parts of `docs/ARCHITECTURE_OPTIONS.md` §Decision, pending approval.
**Nothing in this document was implemented, committed, pushed, or deployed.** No application code was modified. No provider account, dashboard, webhook, or credential was touched.

---

## 0. Verdict in one page

**Recommendation: CONDITIONAL GO — but not on the Phase 0 architecture.**

The Phase 0 plan assumed Hyperswitch Prism could act as a *connector backend for generated code*. That assumption is false, and it is the load-bearing assumption of the whole design.

Prism has exactly two modes: an embedded native library, or a gRPC microservice. It has **no code-generation mode**. Its connector logic is compiled into a ~489 MB native binary whose Linux build requires **glibc ≥ 2.38** and which has **no Windows build and no Intel-Mac build**. Any design that puts Prism in the generated output therefore fails the portability requirement outright.

The recommendation is to keep the product thesis and invert the architecture:

> **Generate native, developer-owned integration code. Use Prism at build time as a request-shape and conformance oracle. Never ship Prism.**

This is the only option reviewed that is simultaneously portable, secure, licence-clean, and honest about what "reuse" means. It is also the simplest architecture that meets the constraints, because there is only one runtime shape: ordinary HTTPS calls with the user's own credentials.

### Six findings that change the plan

| # | Finding | Effect |
|---|---|---|
| F1 | Prism has no code-generation mode; connectors live inside a native binary | "Prism as connector backend for generated code" is impossible as written |
| F2 | Linux binary requires glibc ≥ 2.38; no Windows; no Intel macOS; 489 MB | Any Prism-runtime option fails portability |
| F3 | 5 of 9 Prism providers cover the full MVP operation set; 4 need native supplement | "9 of 12 reuse" overstates the result |
| F4 | Adyen has no `get` flow in Prism | Payment-status lookup must be webhook-driven or native |
| F5 | Square's Developer Terms prohibit redistributing Square Developer Tools | Generated Square code must call REST directly, not vendor the SDK |
| F6 | Adyen requires `applicationInfo` attribution on every API request | Generated Adyen adapter must emit it; possible partner-registration gate |

### Decision recorded

**Option D approved on 2026-10-21** — native emission, with Prism retained only as an optional build-time conformance oracle. Option C (native only) remains the fallback; Option A (Prism runtime) was rejected. Corrections C1–C8 were then applied to the Phase 0 documents. See §7.

---

## 1. Scope, method, and limits

### What was investigated

The eight questions in the Phase 0.5 brief, against primary artifacts rather than documentation prose:

- Prism's own documentation (modes of usage, partner/attribution pages).
- The **shipped** npm artifact (`hyperswitch-prism@0.6.0`): file tree, `package.json`, loader source, TypeScript declarations, and the ELF binaries themselves.
- The PyPI artifact metadata for the same version.
- The GitHub repository (`LICENSE`, absence of `NOTICE`, release assets).
- Provider legal agreements and partner documentation, retrieved directly.

### Evidence standard

- **VERIFIED** — confirmed by a primary artifact or the provider's own published contract/documentation, with the source recorded.
- **PARTIALLY VERIFIED** — some primary evidence, but a material gap remains.
- **UNVERIFIED** — no primary evidence obtained. Treated as *unknown*, never as *permitted*, *supported*, or *safe*.

### What this gate did not do

- It did not run a sandbox transaction with any provider.
- It did not build Prism from source or run its gRPC mode.
- It did not obtain credentials for any provider.
- It did not review 8 of the 12 provider agreements (see §6, V10).
- It is not legal advice.

---

## 2. Findings

### Q1 — Can Prism generate standalone integration source, or does it require its native library at runtime?

**VERIFIED: Prism is a runtime library. It cannot emit standalone connector source.**

| Evidence | Result |
|---|---|
| Prism "Modes of Usage" documentation | Exactly two modes: **Library (SDK)** and **Microservice (gRPC)**. No third mode, no codegen path. |
| npm artifact contents | Three native libraries: `libconnector_service_ffi.dylib` (145.7 MB), `libconnector_service_ffi.so` (178.1 MB aarch64), `libconnector_service_ffi.so` (189.1 MB x86-64). Connector logic is inside these. |
| Loader source (`uniffi_client.js`) | Loads the binary through `koffi` FFI from `generated/<platform>-<arch>/`. |
| What Prism *does* generate | JS client bindings and protobuf types (`_generated_flows.js`, `_generated_grpc_client.js`, `proto.js`, `.d.ts`) from Jinja templates. This is the **client surface**, not connector implementations. |
| GitHub releases | `v0.6.0` has **no release assets**. No published gRPC container could be confirmed (GitHub packages API returned 401 unauthenticated). |

The distinction matters: Prism generates *bindings to its binary*, not *provider integrations*. The provider-specific request construction, authentication, error mapping, and webhook parsing are compiled Rust.

**Consequence:** Phase 0's phrasing — "Hyperswitch Prism as connector backend for generated code" — describes something Prism does not do. Prism-backed output is a *wrapper*, not a *generated integration*.

#### The one finding that makes reuse possible anyway

The FFI boundary is unusually clean, and it is the key enabling discovery of this gate.

```ts
// uniffi_client.d.ts — shipped in hyperswitch-prism@0.6.0
callReq(flow, requestBytes, optionsBytes): Buffer   // "Build the connector HTTP request for any flow."
callRes(flow, responseBytes, requestBytes, optionsBytes): Buffer
callDirect(flow, requestBytes, optionsBytes): Buffer // single-step transformer, inbound flows like webhooks
```

Prism is architecturally a **pure request-builder and response-parser**; the caller performs the HTTP transport (`http_client.js`, using `undici`). `callReq` returns a protobuf-encoded `FfiConnectorHttpRequest` — the exact method, URL, headers and body Prism would send.

That means Prism can be driven as a **build-time oracle**: feed it inputs, capture the provider HTTP request it produces, and use that as the specification and the conformance baseline for native emitted code. It cannot be driven that way for *everything* (see Q3 and §4), but for request construction it is a genuine accelerator that requires no runtime dependency.

---

### Q2 — Does Apache-2.0 permit the intended reuse and redistribution, including native artifacts?

**VERIFIED (permitted), with concrete obligations. One material gap remains UNVERIFIED.**

| Item | Finding |
|---|---|
| Repository `LICENSE` | Apache License 2.0 — confirmed by reading the file. |
| npm `package.json` `license` field | `"Apache-2.0"`. |
| `NOTICE` file in repository | **Absent.** |
| License text inside the npm tarball | **Absent.** The tarball contains only `package.json`, `README.md`, and build output. |
| Release assets / SBOM | None published. |

Apache-2.0 grants the rights the project needs: use, reproduction, modification, derivative works, and **redistribution in source or object form**, with a patent grant. The obligations for binary redistribution are:

1. Give recipients a copy of the License (§4(a)). **The shipped artifact does not include one — we would have to add it.**
2. Retain copyright, patent, trademark and attribution notices from the source form (§4(c)).
3. Include `NOTICE` contents **if one exists** (§4(d)). None exists, so none is owed.
4. State significant modifications (§4(b)).
5. **No trademark licence** (§6): "Hyperswitch" and "Juspay" marks may not be used to imply endorsement.

**What this means practically.** Apache-2.0 is *not* the blocker. Severability is good: we may reuse, fork, or derive without asking. The blockers are engineering ones — a 489 MB blob, a glibc floor, and missing platform builds.

**UNVERIFIED (V14):** whether the native binaries statically link third-party components under incompatible terms. No `NOTICE`, no SBOM, and no third-party licence inventory is published. This is a due-diligence gap, not a known problem.

---

### Q3 — Do the nine claimed providers expose the operations the MVP requires?

**PARTIALLY VERIFIED: 5 of 9 do. 4 require a native supplement.**

MVP operation set, taken from `docs/MVP_PLAN.md` (G3 and the generated-artifact list): **authorize, capture, void, refund, status lookup (`get`), webhook verification (`handle_event`)**. Refund-status lookup (`refund_get`) is treated as secondary.

| Provider | Prism connector | authorize | capture | void | refund | `get` | `handle_event` | MVP-complete |
|---|---|---|---|---|---|---|---|---|
| Stripe | `stripe` | yes | yes | yes | yes | yes | yes | **YES** |
| PayPal | `paypal` | yes | yes | yes | yes | yes | yes | **YES** |
| Braintree | `braintree` | yes | yes | yes | yes | yes | yes | **YES** ¹ |
| Authorize.net | `authorizedotnet` | yes | yes | yes | yes | yes | yes | **YES** |
| Global Payments | `globalpay` | yes | yes | yes | yes | yes | yes | **YES** |
| Adyen | `adyen` | yes | yes | yes | yes | **no** | yes | **NO** |
| Worldpay | `worldpay` | yes | yes | yes | yes | yes | **no** | **NO** |
| Fiserv | `fiserv` | yes | yes | yes | yes | yes | **no** | **NO** |
| Shift4 | `shift4` | yes | yes | yes | yes | yes | **no** | **NO** |

¹ Braintree has no `refund_get`, so refund-status lookup must be inferred from the webhook or a follow-up call.

**Source:** Prism connector index (`prism_generated_index.txt`, 128 connectors, version 0.6.0) cross-checked against the flow-coverage matrix (`prism_all_connector.md`).

#### Adyen's `get` gap is probably a provider shape, not a Prism omission

Adyen's Checkout API does not offer a general "retrieve payment by PSP reference" call; its model is webhook-driven, with `/payments/details` usable only in redirect flows. **UNVERIFIED (V3)** — this needs confirmation against Adyen's current API reference before it is asserted publicly. Either way the engineering consequence is the same: Adyen status is webhook-driven and needs a reconciliation path.

#### "Nine providers" is really "nine brands, seventeen-plus connectors"

Prism does not map one connector per brand. Observed in the index:

| Brand | Prism connectors | Flow coverage differs? |
|---|---|---|
| Worldpay | `worldpay`, `worldpayraft`, `worldpayvantiv`, `worldpayxml` | Yes |
| Fiserv | `fiserv`, `fiservcommercehub`, `fiservemea` | Yes |
| Global Payments | `globalpay`, `globalpayments_heartland`, `globalpayments_realex`, `globalpaymentsrealex` | Yes |

Choosing the connector is itself a research task, and the capability matrix changes depending on the choice. The Phase 0 matrix picked one per brand without recording why — that must be made explicit before any of it is generated.

---

### Q4 — Can generated code run on Windows, Linux and macOS without operating Hyperswitch infrastructure?

**VERIFIED: not for Prism-backed output. Yes for native output.**

Prism needs no Hyperswitch infrastructure — it is stateless and embedded. But it does need a matching native binary, and the shipped set is narrow.

| Platform | In npm tarball | Works? |
|---|---|---|
| Linux x86-64 | `linux-x64/libconnector_service_ffi.so` | Only with **glibc ≥ 2.38** |
| Linux aarch64 | `linux-arm64/libconnector_service_ffi.so` | Only with **glibc ≥ 2.38** |
| macOS Apple Silicon | `darwin-arm64/libconnector_service_ffi.dylib` | Yes |
| macOS Intel | **absent** | **No** |
| Windows x64 | **absent** | **No** |
| Alpine / musl | **absent** | **No** |

#### The glibc floor is measured, not inferred

I scanned the shipped ELF binary's version requirements directly. `libconnector_service_ffi.so` (x86-64) references symbol versions up to **`GLIBC_2.38`**.

That excludes the most common server and CI baselines:

| Distribution | glibc | Prism works? |
|---|---|---|
| Ubuntu 24.04 LTS | 2.39 | yes |
| Ubuntu 22.04 LTS | 2.35 | **no** |
| Debian 12 | 2.36 | **no** |
| Debian 13 | 2.41 | yes |
| RHEL 9 | 2.34 | **no** |
| Amazon Linux 2023 | 2.34 | **no** |
| Alpine | musl | **no** |

The Python wheels are stricter still: published as `manylinux_2_39_x86_64`, `manylinux_2_39_aarch64`, and `macosx_11_0_arm64` — **no Windows, no Intel macOS, no sdist** (so no source fallback via PyPI).

#### Windows fails at the loader, not just at packaging

```js
const ext   = process.platform === "darwin" ? "dylib" : "so";
const target = `${process.platform}-${process.arch}`;   // "win32-x64" on Windows
```

On Windows the loader resolves `generated/win32-x64/` and looks for a `.so`. That directory does not exist and the extension is wrong. This is a hard failure, not a degraded path.

**Note the documentation contradiction.** The package README states the requirement as *"macOS (x64, arm64), Linux (x64, arm64), or Windows (x64)"*. The artifact ships neither `darwin-x64` nor `win32-x64`. Prism's documentation is not a reliable source for Prism's platform support; the binaries are.

#### Footprint

| Measure | Value |
|---|---|
| npm tarball (compressed) | 107.7 MB |
| Native libraries (unpacked) | 489 MB |
| `proto.js` alone | 8.7 MB |
| Installed per platform | all three platforms ship in one package — no per-platform optional packages |

Every user of a Prism-backed integration downloads ~108 MB and unpacks ~489 MB, on every install and in every CI job, to make HTTPS calls.

**Consequence:** a portable product cannot ship Prism. Windows developers, Intel-Mac developers, Ubuntu 22.04 CI, Debian 12 images and Alpine containers are all excluded.

---

### Q5 — Can native Square and Clover adapters use the same manifest and generator contracts as Prism-backed providers?

**PARTIALLY VERIFIED: same contract shape, but the contract must gain five fields. Design analysis only — not proven by building.**

Under the recommended architecture this question simplifies, because *every* adapter is native. The contract still needs the dimensions below, which Prism-shaped adapters would have hidden.

| Requirement | Why | Contract addition |
|---|---|---|
| Runtime strategy | Prism vs native must be data, not code | `runtime.strategy: native` (single value under the recommendation) |
| API surface variant | Clover has Hosted Checkout **and** Platform REST with different auth, webhook schemes and capabilities | `surface: default \| hosted_checkout \| platform` |
| Webhook verification mode | Four structurally different schemes already identified | `webhook.verification: hmac_local \| static_secret_header \| remote_verify \| unsigned_allowlist` |
| URL-bound signatures | Square signs `notificationUrl + body`, so the URL must be stable and configured at subscription time | `webhook.notification_url_binding: true` |
| Delegated auth | Square requires OAuth when acting for a seller | `auth.oauth_required_for_seller_context: true` |
| Idempotency | Not universal; some providers unknown | `limits.idempotency: supported \| unsupported \| unknown` |
| SDK bundling | Square's terms forbid redistributing Developer Tools | `distribution.vendor_sdk: prohibited` |
| Attribution | Adyen requires `applicationInfo` on every request | `attribution.required_fields: [...]` |

**Square mapping** (REST, no SDK): CreatePayment with `autocomplete=false` = authorize; CompletePayment = capture; CancelPayment = void; RefundPayment = refund; GetPayment = status. Webhook: HMAC-SHA256 over `notificationUrl + rawBody`, header `x-square-hmacsha256-signature`, keyed by a per-subscription signature key.

**Clover mapping:** Hosted Checkout for the e-commerce surface (HMAC `Clover-Signature`); Platform REST for merchant-scoped payments (static `X-Clover-Auth` header — a materially weaker scheme that the generator must label, not quietly accept).

**Verdict:** the same manifest and generator contracts hold, **provided** surface, verification mode, URL binding, OAuth context, and attribution are first-class fields. Without them the "universal engine" would leak provider specifics into templates. This is a design conclusion and must be proven by the walking skeleton (Phase 1), not asserted as done.

---

### Q6 — Can the generator truthfully offer dependency-free output?

**VERIFIED: only if Prism is not in the output.**

| Strategy | Claim that would be true |
|---|---|
| Prism runtime | "No separate platform to operate" — true. "Dependency-free" — **false**: 489 MB native library, glibc ≥ 2.38, no Windows. |
| Native emission | "No separate platform to operate" — true. "Depends only on standard HTTP and crypto libraries" — **true**, provided provider SDKs are emitted as ordinary dependencies rather than vendored. |

The existing README is already careful — it says *"It will not require you to run a payment platform locally"*, not "dependency-free". That sentence survives. What does not survive is the `strategy: prism | native` row implying Prism is a source of code rather than a runtime dependency.

**Required product-description change:** state the runtime dependency explicitly wherever a Prism-backed adapter is offered. The honest formulation is:

> Generated integrations contain no Vault-Payments runtime and no payment platform. They depend only on the provider's public API and standard HTTP/crypto libraries. Provider SDKs, where used, are declared as normal package dependencies that you install under your own agreement with the provider.

That sentence is true for native emission and false for Prism-backed output. Since the product must make one claim, the architecture must make it true.

---

### Q7 — What do provider terms actually require?

**PARTIALLY VERIFIED: 4 of 12 agreements reviewed in detail. 8 remain UNVERIFIED and are launch risks, not build blockers.**

No reviewed agreement addresses third-party code generation explicitly. Silence is not permission — but the operative restrictions cluster into four areas that *can* be designed around.

#### Square — Developer Terms of Service (last updated 2026-09-10)

| Clause | Text (abridged) | Consequence |
|---|---|---|
| §2 | "You will not … **sell, rent, lease, sublicense, redistribute or syndicate access to the Developer Tools** or to Content other than your own" | **Do not vendor or bundle the Square SDK.** Generate direct REST calls. |
| §2 | "create a service that functions substantially the same as the Developer Tools or any Square service" | A generator is not a payment service; low risk, but do not build a Square-compatible API. |
| §1 | "Square Sellers must be presented with the ability to **log into Square via the OAuth protocol**" | Generated apps acting for sellers need an OAuth flow, not a pasted access token. |
| §1 | PCI DSS and "in no circumstances will you store, process or transmit any cardholder's account number, expiration date, or CVV2 except as described in that documentation" | Reinforces the no-raw-card-data rule. |
| §5 | Square Marks usable only under the *Built with Square* trademark terms; revocable | No implied endorsement; marks are opt-in and conditional. |
| §6 | Square owns Developer Tools; you retain rights to *Your Service* | Generated code belongs to the user — consistent with the product promise. |

#### Stripe — Services Agreement, Service Terms

- The **Terminal SDK is MIT-licensed**, but §2.2 restricts using it outside Stripe Terminal Products/Services and forbids subjecting it to copyleft terms.
- No code-generation prohibition and no server-SDK redistribution restriction found in the reviewed text.
- §2.2 matters only for the deferred terminal epic; it does not affect the MVP.

#### Adyen — Terms & Conditions + partner documentation

- Adyen's partner docs state: *"Technology partners working with Adyen are **required** to add application info fields to API requests."*
- Required fields include `applicationInfo.externalPlatform.name` and `merchantApplication.name` (or `externalPlatform.integrator` for a service partner/SI).
- **Consequence:** the generated Adyen adapter must emit `applicationInfo` on every request — this is a correctness requirement, not a nicety, and the generator must expose the values as configuration.
- **UNVERIFIED (V11):** whether an open-source generator itself must register as an Adyen technology partner. This is a legal/partner gate to resolve before Adyen ships.

#### PayPal — Developer Agreement

- §9.1.1: *"You may not rent, lease or otherwise transfer your rights in the software to a third party."*
- **Consequence:** do not vendor PayPal SDK code. Emit a package dependency; the end user accepts PayPal's terms directly.

#### Not reviewed (UNVERIFIED — see V10)

Clover (legal pages are JavaScript-only and returned no content), Authorize.net, Worldpay, Fiserv, Global Payments, Shift4, GoDaddy/Poynt.

#### The design rule that resolves most of this

> **Never vendor a provider SDK. Emit direct HTTPS calls plus ordinary package dependencies. Never use provider marks to imply endorsement. Expose every attribution field the provider requires as configuration.**

This single rule satisfies Square §2, PayPal §9.1.1, Adyen's `applicationInfo` requirement, and the trademark clauses — and it happens to be exactly what native emission produces.

#### Certification and partner gates (status)

| Provider | Gate | Status |
|---|---|---|
| Adyen | Technology-partner registration / `applicationInfo` | Requirement verified; applicability to an OSS generator **UNVERIFIED** |
| Clover | App approval / marketplace process | **UNVERIFIED** (legal pages unavailable) |
| GoDaddy Poynt | Developer registration + app approval + App Center listing | **VERIFIED** that the process exists (see Q8) |
| Stripe, PayPal, Braintree, Authorize.net, Square | Standard developer account; no certification for card-not-present | Verified by absence of any certification requirement in reviewed docs |
| Worldpay, Fiserv, Global Payments, Shift4 | Partner/ISO onboarding for production acquiring | **UNVERIFIED**; assumed gated |

---

### Q8 — Does GoDaddy/Poynt have a legitimate developer or partner route?

**VERIFIED: yes — an approval-gated developer platform exists. It is not the GoDaddy Payments Commerce API.**

`docs.poynt.com` documents a full application platform:

- Developer onboarding and an **App Development Lifecycle**.
- **Smart Terminal Apps** (on-device), **Cloud Apps**, **Semi-Integration**, and **Poynt Collect**.
- Distribution through the **App Center**, implying review/approval.
- Developer resources, guidelines, and a support/request channel.

So the earlier conclusion — "GoDaddy has no developer route to card acceptance" — was too strong. The accurate statement is:

> GoDaddy's public developer portal exposes Commerce/orders APIs but no card-authorization API. Card acceptance runs through **GoDaddy Poynt**, a separate, approval-gated platform. Reaching it requires developer registration, app creation, sandbox access, and app review.

**Remains UNVERIFIED (V12):** whether **Poynt Collect** exposes a server-side "create a charge" API suitable for framework-generated code, and whether approval would be granted to an open-source generator that emits integrations rather than a listed app.

**Recommendation:** keep GoDaddy in the roadmap as `blocked` with a **named path** (apply to the Poynt developer program; evaluate Poynt Collect and Cloud Apps), not as `unsupported`. It stays out of the MVP.

---

## 3. Corrections to Phase 0

These were proposed in the gate and **applied on 2026-10-21** following the §7 approval. Each target document carries a revision note identifying it as a Phase 0.5 correction.

| # | Phase 0 statement | Correction | Applied in |
|---|---|---|---|
| C1 | "Hyperswitch Prism as connector backend for generated code" | Prism has no codegen mode. It is a runtime library. Architecture changed to native emission. | `ARCHITECTURE_OPTIONS.md` §3.2/§5, `README.md`, `RESEARCH.md` §4.2 |
| C2 | "9 of 12 reuse via Prism" | 9 brands have a connector; **5 of 9 cover the full MVP operation set**; 4 need native supplements. | `README.md`, `PROVIDER_MATRIX.md` §3.1, `RESEARCH.md` §5.1 |
| C3 | "Two adapter strategies: `prism` \| `native`" | `prism` cannot ship in portable output. Single strategy: `native`. Prism becomes a build-time oracle. | `README.md`, `ARCHITECTURE_OPTIONS.md` §5–§7, `MVP_PLAN.md` §3 |
| C4 | Prism "runs on Linux and macOS" | Linux requires **glibc ≥ 2.38**; **no Windows**; **no Intel macOS**; **no musl**. 489 MB unpacked. | `RESEARCH.md` §6.3, `ARCHITECTURE_OPTIONS.md` §3.2 |
| C5 | Adyen listed as MVP-capable | No `get` flow. Status is webhook-driven; reconciliation required. Matrix row downgraded to `UNKNOWN`. | `PROVIDER_MATRIX.md` §1, `RESEARCH.md` §6.12 |
| C6 | One connector per brand implied | Worldpay 4, Fiserv 3, Global Payments 4 connectors with differing flow coverage. Each manifest pins an exact variant. | `PROVIDER_MATRIX.md` §3.3, `RESEARCH.md` §6.13 |
| C7 | GoDaddy `UNSUPPORTED` / dead end | `blocked` with a named path (Poynt developer program). | `PROVIDER_MATRIX.md` §4.4, `MVP_PLAN.md` §7 |
| C8 | MVP pairs "Stripe (`prism`) with Square (`native`)" | Both native. Pair re-justified on *structural difference*: Stripe = header auth + HMAC over timestamp payload + idempotency key; Square = OAuth + URL-bound HMAC + no-SDK-vendoring. | `MVP_PLAN.md` §3, `README.md` roadmap |

---

## 4. Option comparison

Four options, scored on the six dimensions the brief requires.

### 4.1 Option A — Prism as a runtime library

Generated code imports `hyperswitch-prism` and calls it at runtime.

| Dimension | Rating | Assessment |
|---|---|---|
| **Portability** | **Fails** | Linux glibc ≥ 2.38, Apple Silicon only, no Windows, no Intel Mac, no musl. The product cannot claim cross-platform support. |
| **Licensing** | Acceptable | Apache-2.0 permits it. But the artifact ships no LICENSE or NOTICE, so redistribution obligations become ours. Trademark grant excluded. |
| **Maintenance** | Mixed | 128 connectors maintained upstream — genuinely valuable. But no LTS, a 0.x version, and a binary glibc floor that drifts with each release. You cannot fix a connector without forking Rust. |
| **Security** | Acceptable | No card data by default. But every user runs a 489 MB opaque native blob through FFI, and cannot independently patch it. Supply chain is one vendor deep. |
| **Developer experience** | **Poor** | 108 MB download / 489 MB unpack per install and per CI job. Windows developers blocked entirely. CI pinned to Ubuntu 24.04+. Debugging crosses an FFI boundary into Rust. |
| **Effort** | Lowest | ~1–2 weeks to a working demo. But it delivers a *wrapper*, not the product. |
| **Verdict** | **Rejected** | Fails the portability requirement outright. Cannot be offered as the product. |

### 4.2 Option B — Prism as a generation-time dependency

Drive Prism at build time to learn each connector's behaviour, then emit standalone native code.

| Dimension | Rating | Assessment |
|---|---|---|
| **Portability** | Excellent | Output is plain HTTPS. Prism's glibc floor constrains only the build machine — and only for the maintainers, not users. |
| **Licensing** | Good | Apache-2.0 permits derivative works and redistribution; emitted code is ours. Attribution is courteous and cheap; trademark clause still applies. |
| **Maintenance** | High cost | You own every emitted adapter forever. Upstream connector fixes do **not** flow into your output; each provider API change is yours to absorb. |
| **Security** | Good | No native blob at runtime. Emitted code is auditable and patchable by the user. |
| **Developer experience** | Excellent | Ordinary package installs; Windows works; no FFI. |
| **Effort** | High | The oracle covers **request construction only** — `callReq`. It does not give you response parsing, error mapping, auth/token refresh, multi-step flows, or webhook verification semantics. You build a capture harness, a protobuf decoder, golden tests, and then still hand-write the rest. |
| **Verdict** | **Viable, but the full version is over-engineered** | The seam is real (see Q1), but treating Prism as a *load-bearing code generator* imports build-time platform constraints and a fragile extraction step in exchange for roughly a third of the work. |

### 4.3 Option C — Native generated integrations, no Prism

Manifest-driven emission of direct provider API calls. Prism not used at all.

| Dimension | Rating | Assessment |
|---|---|---|
| **Portability** | Excellent | No native dependency of any kind. Windows, Linux, macOS, Alpine, all supported. |
| **Licensing** | Best | Entirely our code; no third-party binary; no redistribution question. Provider SDKs are declared dependencies, never vendored. |
| **Maintenance** | Highest cost | 11 adapters, owned end to end, with no upstream safety net. This is the honest cost of the model. |
| **Security** | Best | Smallest possible surface: HTTPS + signature verification + idempotency. Everything is auditable. |
| **Developer experience** | Best | Nothing to install beyond normal packages. |
| **Effort** | Highest | ~10–12 weeks for the vertical slice; ~3.5–4.5 months for 11 providers in one language, per the revised Phase 0.5 estimates. |
| **Verdict** | **Meets every constraint; slowest to correctness** | Simple, honest, portable. The cost is that every adapter starts from a blank page. |

### 4.4 Option D — Hybrid: native emission with a build-time oracle

One runtime architecture — native emission, identical to C. Prism is used **only** in the generator's own test and verification pipeline: pinned, offline, never shipped, never in the user's dependency tree.

| Dimension | Rating | Assessment |
|---|---|---|
| **Portability** | Excellent | Identical to C. Prism constrains only the maintainer's CI, and only for oracle jobs (which can be pinned to one Ubuntu 24.04 runner). |
| **Licensing** | Good | Same as C for output. The oracle is a dev tool; Apache-2.0 covers it; no redistribution occurs. |
| **Maintenance** | Moderate | You own the emitted adapters, but the oracle acts as a **conformance baseline**: when a provider changes an API, diff your request against Prism's and see exactly what moved. Upstream also serves as an early-warning system. |
| **Security** | Good | No runtime blob. The oracle never executes in a user environment. Pinned by version and hash. |
| **Developer experience** | Excellent | Users see exactly Option C. |
| **Effort** | Moderate | +1–2 weeks over C for the oracle harness (protobuf decode, golden fixtures, diff runner). Recouped by faster per-provider verification: ~3–5 days per additional provider instead of ~1 week. |
| **Verdict** | **Recommended** | Keeps the reuse thesis, ships portable code, and turns Prism from a liability into a test fixture. |

### 4.5 Scorecard

| | A — Prism runtime | B — Prism codegen | C — Native only | **D — Native + oracle** |
|---|---|---|---|---|
| Portability | **Fails** | Excellent | Excellent | **Excellent** |
| Licensing | Acceptable | Good | Best | **Good** |
| Maintenance | Mixed | High cost | Highest cost | **Moderate** |
| Security | Acceptable | Good | Best | **Good** |
| Developer experience | Poor | Excellent | Best | **Excellent** |
| Engineering effort | Lowest | High | Highest | **Moderate** |
| Ships a 489 MB binary | **Yes** | No | No | **No** |
| Works on Windows | **No** | Yes | Yes | **Yes** |
| Reuses Prism knowledge | Yes | Yes | No | **Yes** |
| Meets the brief | **No** | Partly | Yes | **Yes** |

### 4.6 Why the hybrid is not "two architectures"

The generator has one shape in both C and D:

```
manifest (data) → capability resolution → templates → emitted native code
```

Prism does not appear in that pipeline. It appears in a separate, maintainer-only verification job:

```
manifest + fixture → [Prism callReq] → expected HTTP request
                    → [emitted adapter] → actual HTTP request
                    → diff (must be empty)
```

That is a **test**, not a runtime, not a build dependency of the product, and not something users install. This is what makes D simpler than it first appears: the product has one architecture, and the oracle is an internal quality gate.

---

## 5. Recommendation

**Adopt Option D, described precisely as: native emission with an optional, pinned, build-time conformance oracle.**

### The architecture

1. **One runtime strategy: `native`.** Every adapter emits direct provider API calls with the user's own credentials. No Prism, no Hyperswitch, no sidecar, no native blob in any generated project.
2. **Prism is a maintainer tool, never a dependency.** Pinned to `0.6.0`, invoked only in a CI job on a pinned Ubuntu 24.04 runner (its glibc floor), used to (a) capture expected request shapes and (b) diff emitted requests against a reference implementation.
3. **Never vendor provider SDKs.** Emit direct HTTPS plus ordinary declared dependencies. This simultaneously satisfies Square §2, PayPal §9.1.1, and keeps the output auditably small.
4. **Attribution is generated, not documented.** Adyen's `applicationInfo`, and any equivalent required field, becomes a manifest field that the template emits on every request.
5. **Capability states are earned.** `verified` requires a passing contract test against a provider sandbox. `unknown` is a first-class, user-visible state — never silently upgraded.
6. **Webhooks are classified by scheme, not assumed uniform.** `hmac_local`, `static_secret_header`, `remote_verify`, `unsigned_allowlist` — with the weaker modes labelled in generated code and in the README the generator writes.

### What this costs

| Milestone | Estimate | Confidence |
|---|---|---|
| Walking skeleton (manifest → one emitted request, golden test) | ~2 weeks | Moderate |
| Vertical slice: Stripe + Square, end to end incl. webhooks + tests | ~10–12 weeks | Moderate |
| Oracle harness | +1–2 weeks, overlapping the slice | Moderate |
| Each additional provider after the slice | ~3–5 days | Low — depends on sandbox friction |
| 11 providers, one language, no terminals | ~3.5–4.5 months | Low |

These are estimates, not measurements, and the per-provider figure carries the most uncertainty: sandbox onboarding, not code, is consistently the long pole.

### Why not the alternatives

- **A (Prism runtime)** fails portability on the three platforms the product promises, and ships 489 MB to do it.
- **B (Prism as codegen)** works at the seam but makes a Rust binary with a glibc floor a load-bearing part of the build, to obtain roughly the request-construction third of the work.
- **C (native only)** is genuinely defensible and simpler still. It is the fallback if the oracle proves low-fidelity in the walking skeleton. It costs accuracy leverage, not correctness.

### What would change this recommendation

- If the product were Linux-server-only, Option A becomes viable and cheapest.
- If Prism published Windows and Intel-macOS builds and a per-platform split package, Option A's portability objection weakens substantially — though the "developer-owned code" promise would still be unmet.
- If Oracle fidelity proves poor for GraphQL (Braintree) and multi-step flows (Adyen redirect, PayPal orders), Option D degrades to Option C for those providers. That is acceptable and already accounted for.

---

## 6. Unverified claims register

Every item below is **not** established and must not appear as fact in README, marketing, or code comments.

| ID | Claim needing verification | Blocks | How to close it |
|---|---|---|---|
| V1 | Prism gRPC-mode platform support and whether a published container exists | Only Option B's CI | Publish/confirm a container; inspect its tags |
| V2 | macOS Intel support (no `darwin-x64` binary shipped; wheel says arm64 only) | Accurate portability statement | Confirm with upstream or test |
| V3 | Whether Adyen truly offers no payment-status lookup | Adyen capability row | Adyen API reference + sandbox |
| V4 | Fiserv webhook contract | Fiserv adapter | Partner docs / account manager |
| V5 | Shift4 void and partial-refund semantics | Shift4 adapter | Sandbox |
| V6 | Clover production SCL host | Clover adapter | Clover docs / partner support |
| V7 | Clover idempotency support | Clover adapter | Sandbox |
| V8 | Global Payments idempotency support | GP adapter | Sandbox |
| V9 | Braintree idempotency support | Braintree adapter | Sandbox |
| V10 | Terms for Clover, Authorize.net, Worldpay, Fiserv, Global Payments, Shift4, GoDaddy, Braintree — **8 of 12 unreviewed** | Commercial launch | Legal review |
| V11 | Whether an OSS generator must register as an Adyen technology partner | Adyen launch | Ask Adyen |
| V12 | Whether Poynt Collect exposes a server-side charge API usable by generated code | GoDaddy roadmap | Poynt developer program |
| V13 | Prism connector sandbox maturity (a connector can exist and be broken) | Any oracle-based confidence | Per-connector sandbox runs |
| V14 | Licence composition of Prism's native binaries (no NOTICE, no SBOM) | Redistribution, if ever bundled | Ask upstream / SBOM |
| V15 | Whether any provider prohibits third-party code generation | Whole product | Legal review; none of the 4 reviewed agreements address it |

---

## 7. Decision

**Recorded 2026-10-21.** The Product Owner approved **Option 1 (Option D)**.

> **Decision:** native emission is the architecture. Prism may be used as an optional build-time conformance oracle, never a generated runtime dependency. Corrections C1–C8 are authorised and applied to the Phase 0 documents.

### What that authorises

- A single runtime strategy: `native`. No Prism, sidecar, connector binary or vendored provider SDK in generated output.
- Prism pinned as an **optional** CI oracle, running in one Ubuntu 24.04 job (glibc ≥ 2.38). The generator must build, run and emit without it.
- Attribution (`applicationInfo`) generated, not documented.
- Corrections C1–C8 applied, each marked as a Phase 0.5 correction.
- Phase 1 walking skeleton.

### What it does not authorise

- No adapter is marked `verified` — or advertised as supported — before G1–G7 pass, including a real sandbox transaction.
- No vendor SDK is bundled into generated output.
- No commercial launch until V10 / V11 / V15 close.

### Alternatives retained for the record

**Option 2 — native-only (Option C).** Same product, no Prism involvement at all. Simple, portable, licence-clean; slower to per-provider correctness and without an upstream diff baseline. This remains the fallback if oracle fidelity disappoints on GraphQL (Braintree) and multi-step flows (Adyen redirect, PayPal orders).

**Option 3 — further research.** Highest-value open questions are V10 (terms for 8 providers) and V11 (Adyen partner status), both commercial rather than technical.

**Option A — Prism runtime: rejected.** Fails the portability requirement on Windows, Intel macOS, Ubuntu 22.04, Debian 12 and Alpine, and ships 489 MB to every user.

### First actions (in order)

1. ~~Apply C1–C8~~ — **done**; see the revision notes in `README.md`, `ARCHITECTURE_OPTIONS.md`, `PROVIDER_MATRIX.md`, `RESEARCH.md`, `MVP_PLAN.md`, `SECURITY_AND_LICENSING.md`.
2. Build the walking skeleton: one manifest, one emitted request, one golden test, `--dry-run` file plan, and one oracle diff.
3. Open V3, V4, V7, V8, V9 as sandbox-verification tasks before any adapter is marked `verified`.

---

## 8. Sources

### Prism / Hyperswitch

- Modes of Usage — https://docs.hyperswitch.io/integrations/prism/architecture/modes-of-usage
- Repository, `LICENSE` (Apache-2.0), no `NOTICE` — https://github.com/juspay/hyperswitch-prism
- npm artifact `hyperswitch-prism@0.6.0` — file tree, `package.json`, `dist/src/payments/uniffi_client.d.ts`, `dist/src/payments/uniffi_client.js`
- PyPI artifact metadata — https://pypi.org/pypi/hyperswitch-prism/json
- Release `v0.6.0`, no assets — https://api.github.com/repos/juspay/hyperswitch-prism/releases/latest
- Connector index and flow matrix (128 connectors, 30+ flows) — captured locally at `C:\Temp\opencode\vaultpay-research\prism_generated_index.txt` and `prism_all_connector.md`

### Provider terms and documentation

- Square Developer Terms of Service, updated 2026-09-10 — https://squareup.com/us/en/legal/general/developers
- Stripe Services Agreement, Service Terms — https://stripe.com/legal/ssa-service-terms
- Adyen Terms & Conditions — https://www.adyen.com/legal/terms-and-conditions
- Adyen application information (technology-partner requirement) — https://docs.adyen.com/partners/application-information
- PayPal Developer Agreement §9.1.1 — https://www.paypal.com/us/legalhub/paypal/xdeveloper-full
- GoDaddy Poynt app integration and developer onboarding — https://docs.poynt.com/app-integration/ , https://docs.poynt.com/app-integration/developer-onboarding/

### Platform baseline data

- glibc measured directly from `libconnector_service_ffi.so` symbol-version strings (`GLIBC_2.38` maximum).
- Distribution glibc versions are public release facts for Ubuntu 22.04/24.04, Debian 12/13, RHEL 9, Amazon Linux 2023.

---

*Prepared as a Phase 0.5 gate. Nothing here is a claim of working functionality. Every capability marked `verified` in any future matrix requires a passing sandbox contract test.*

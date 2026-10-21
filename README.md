# Vault-Payments

**One integration. Every payment provider.**

A visual, checkbox-driven generator that produces complete, secure payment integrations for major processors — API clients, routes, webhook verification, tokenized frontend components, configuration, and sandbox tests — directly into your own repository.

---

> ## ⚠️ Project status: Phase 0.5 — Architecture decided, nothing built
>
> **No integration is implemented. Nothing here is usable yet.**
>
> This repository currently contains research, planning, and a completed feasibility gate. There is no generator, no adapter, and no supported provider. Every claim about provider behaviour in these documents is a **research finding with a source link**, not a working feature.
>
> The architecture is decided: **native emission**. Generated integrations call the provider's own API directly with the user's own credentials and contain no Vault-Payments runtime. Hyperswitch Prism is not a dependency of generated code; at most it is an optional **build-time conformance oracle** for the generator's own tests. See [`docs/PHASE_0.5_FEASIBILITY.md`](docs/PHASE_0.5_FEASIBILITY.md).
>
> A provider will only be described as *supported* after its contract is documented **and** its sandbox tests pass. Until then the README lists it as `planned`, and the capability matrix records each individual capability as `VERIFIED`, `PARTIAL`, `UNSUPPORTED` or `UNKNOWN`.

---

## The problem

Every payment processor invents its own universe.

Stripe signs webhooks with `Stripe-Signature` over `timestamp.body`. Square signs `signature_key + notification_url + body`. Clover uses HMAC on one product surface and a static shared secret on another. Authorize.net uses HMAC-SHA512 and deactivates your webhook endpoint after ten failed deliveries. Braintree puts the signature in form fields. PayPal asks you to call an API to verify.

Each one has different idempotency semantics, different retry windows, different error shapes, different sandbox hosts, and different approval gates. Getting one integration right takes days. Getting twelve right — with correct signature verification, replay protection, durable idempotent processing, and reconciliation — takes months, and most of that work is duplicated by every team that does it.

Payment orchestration platforms solve this by sitting in your request path. That works, but it makes you dependent on their uptime, their upgrade cadence, their pricing, and it expands your PCI boundary.

Vault-Payments takes the other path: **generate the integration into your codebase, then get out of the way.**

## What it will do

Select the providers you need, choose your capabilities, pick your language and framework, and generate:

- **A typed API client** per provider, with auth and error mapping
- **Route handlers** for create / authorize / capture / void / refund / status
- **Webhook endpoints** with signature verification, timestamp replay windows, durable event storage, and deduplication
- **A tokenized frontend component** — card data goes to the provider, never to your server
- **A configuration contract** with fail-closed secret loading and a `.env.example`
- **Sandbox contract tests** that actually exercise the provider's test environment
- **A reconciliation guide** explaining how to detect and repair missed events

And a **capability matrix** that tells the truth: `verified`, `partial`, `unsupported`, or `unknown`, each with a source link and a verification date.

## What it will *not* do

- It will **not** process, proxy, or route your payments.
- It will **not** store card data or act as a vault.
- It will **not** sit in your request path.
- It will **not** claim a capability it has not tested.
- It will **not** generate code that handles raw card numbers.
- It will **not** require you to run a payment platform locally.
- It will **not** ship a payment-platform runtime, a connector binary, or a vendored provider SDK into your project.

## Provider coverage

The honest position after Phase 0 research and the Phase 0.5 feasibility gate. Details and sources in [`docs/PROVIDER_MATRIX.md`](docs/PROVIDER_MATRIX.md).

The "Prism connector" column records whether a hardened Apache-2.0 connector exists to use as a **request-shape reference and conformance oracle**. It does **not** mean the connector is reused at runtime — no provider ships Prism in generated code.

"MVP operations" means the six operations the MVP requires: authorize, capture, void, refund, status lookup, and webhook handling.

| Provider | Prism connector (reference only) | MVP operations via Prism | Product status | Notes |
|----------|----------------------------------|--------------------------|----------------|-------|
| Stripe | `stripe` | Full | `planned` | Public MIT OpenAPI spec; clean auth/capture/void/refund |
| PayPal | `paypal` | Full | `planned` | Orders + Payments v2 |
| Adyen | `adyen` | **No status lookup** — `get` flow absent | `planned` | Status is webhook-driven; mandatory `applicationInfo` attribution |
| Braintree | `braintree` | Full, but no refund-status lookup | `planned` | GraphQL only; no public OpenAPI |
| Authorize.net | `authorizedotnet` | Full | `planned` | XML + JSON surfaces; no card-present story |
| Worldpay | `worldpay` (one of 4 variants) | **No webhook handling** | `planned` | Webhook secret is partner-provisioned |
| Fiserv | `fiserv` (one of 3 variants) | **No webhook handling** | `planned` | **Webhook contract unknown** |
| Global Payments | `globalpay` (one of 4 variants) | Full | `planned` | Heartland / Realex variants differ |
| Shift4 | `shift4` | **No webhook handling** | `planned` | **Webhooks unsigned** — allowlist only |
| Square | none | — | `planned` | Native adapter; OAuth + URL-bound webhook signature; SDK must not be vendored |
| Clover | none | — | `planned` | Native adapter; two surfaces, two webhook schemes |
| GoDaddy Payments | none | — | `blocked` | **No public charge-creation API**; the GoDaddy-owned Poynt platform is a separate, approval-gated route |

**Summary: 9 of 12 have a Prism connector. 5 of those 9 cover the full MVP operation set through Prism; 4 need native work for status or webhooks. 2 have no connector. 1 is `blocked` — the Payments Commerce API has no public charge-creation endpoint, and Poynt is a separate, approval-gated product.**

No connector is reused at runtime. Under the decided architecture every provider is emitted as native code; Prism's role is limited to an optional build-time reference and conformance check — see [`docs/PHASE_0.5_FEASIBILITY.md`](docs/PHASE_0.5_FEASIBILITY.md) §5.

`planned` means the provider's documented contract has been researched, but **no code exists and no sandbox test has run.** Documentation-level detail — including which capabilities are `VERIFIED`, `PARTIAL`, `UNSUPPORTED` or `UNKNOWN` — lives in [`docs/PROVIDER_MATRIX.md`](docs/PROVIDER_MATRIX.md).

## How it works

Three layers, and only one of them knows anything about payments.

```
Capability layer      providers/<id>/manifest.yaml
(pure data)           endpoints · auth · operations · webhook scheme ·
                      terminals · sandbox · approval gates · sources
                                │
Universal engine      selection resolver · config contract · route generation ·
(no provider names)   webhook subsystem · reconciliation · test harness
                                │
Adapter layer         strategy: native
(one per provider)    direct provider HTTP calls, user's own credentials
```

Provider differences live in **data**, not in engine code. That is what makes the 13th provider a manifest addition rather than an engine change — and it is enforced by a CI test that fails if the engine contains a provider name.

### Why Prism is a reference, not a dependency

Phase 0 assumed Prism could act as a connector backend for generated code. The feasibility gate disproved that, and the correction is the most important decision in the project.

- **Prism cannot emit connector source.** It has exactly two modes — an embedded native library, or a gRPC microservice — and no code-generation mode. Its connector logic is compiled into native binaries totalling ~489 MB unpacked. What it "generates" is client bindings *to those binaries*.
- **Prism is not portable enough to ship.** The Linux build requires **glibc ≥ 2.38**, which excludes Ubuntu 22.04 LTS, Debian 12, RHEL 9 and Amazon Linux 2023. There is **no Windows build**, **no Intel-macOS build**, and no musl build. Prism's own README claims Windows and macOS x64 support that its artifacts do not contain.
- **Only 5 of the 9 connectors cover the full MVP operation set.** Adyen has no status-lookup flow; Worldpay, Fiserv and Shift4 have no webhook handling.

So generated code cannot contain Prism without failing the cross-platform promise. But Prism's FFI does expose `callReq` / `callRes` / `callDirect`, which build provider HTTP requests and parse responses. That makes it useful in exactly one place: as a **pinned, offline, build-time oracle** that the generator's test suite can diff emitted requests against. It never enters a user's dependency tree, and the generator remains fully functional without it.

See [`docs/PHASE_0.5_FEASIBILITY.md`](docs/PHASE_0.5_FEASIBILITY.md) §4–5 for the option comparison and the measured evidence.

## Documentation

| Document | What it covers |
|----------|----------------|
| [`docs/PHASE_0.5_FEASIBILITY.md`](docs/PHASE_0.5_FEASIBILITY.md) | Feasibility gate: Prism's real capabilities, four-option comparison, architecture decision, unverified-claims register |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | Phase 0 research method, findings, and evidence |
| [`docs/PROVIDER_MATRIX.md`](docs/PROVIDER_MATRIX.md) | Per-provider capability matrix with source links |
| [`docs/ARCHITECTURE_OPTIONS.md`](docs/ARCHITECTURE_OPTIONS.md) | Hyperswitch / Kill Bill / alternatives audit and the architecture decision |
| [`docs/SECURITY_AND_LICENSING.md`](docs/SECURITY_AND_LICENSING.md) | Security mandate, webhook schemes, PCI posture, license and terms audit |
| [`docs/MVP_PLAN.md`](docs/MVP_PLAN.md) | Phased plan, definitions of done, effort and risks |

## Security posture

The tool's failure mode is not "our server was breached" — it is "we shipped an insecure integration to thousands of repositories". The generated-code defaults are the product's primary security asset.

Hard rules, enforced by generation-time gates:

- No secrets in generated source; **fail closed** on missing configuration.
- No raw card data; tokenization happens in provider-hosted fields or SDKs.
- No payment success derived from a browser redirect — server-side status or verified webhook only.
- Signature verification **before** payload parsing, with constant-time comparison.
- Idempotency on every money-moving call; durable, deduplicated webhook processing.
- Replay windows enforced where the provider supplies a timestamp.

Details in [`docs/SECURITY_AND_LICENSING.md`](docs/SECURITY_AND_LICENSING.md).

## Roadmap

| Milestone | Scope |
|-----------|-------|
| Phase 0 | Research and architecture |
| Phase 0.5 | Feasibility gate; architecture decided — native emission — **complete** |
| Phase 1 | Walking skeleton: manifest schema, Stripe client generation, oracle harness (~2–3 weeks) — **next** |
| Phase 2 | Stripe vertical slice with webhooks and sandbox tests |
| Phase 3 | Minimal visual builder |
| Phase 4 | Square native adapter — second structurally different provider |
| Phase 5 | Remaining eight providers |
| Phase 6 | Clover native adapter — two surfaces, two webhook schemes |
| Phase 7 | Hardening, second language, launch |

Terminals and Tap to Pay are a **separate epic**: terminal support does not follow processor support and requires hardware, certification, and in some cases partner approval. They are not part of the initial milestone.

## Contributing

Not open for code contributions yet — the architecture gate has closed but implementation has not started. Research corrections are welcome and especially valuable: if a capability in the matrix is wrong or out of date, open an issue with the official documentation link.

Every provider claim must carry a source URL and a verification date. "It works" is not evidence; a passing sandbox test is.

## License

[Apache-2.0](LICENSE).

Hyperswitch Prism, where used as an optional build-time development aid, is © Juspay and licensed under Apache-2.0. It is not distributed with generated code. Vault-Payments is not affiliated with, endorsed by, or certified by Juspay.

Provider names and logos are trademarks of their respective owners. Vault-Payments is not affiliated with, endorsed by, or certified by any payment provider. You are responsible for complying with your own provider agreements — see [`docs/SECURITY_AND_LICENSING.md`](docs/SECURITY_AND_LICENSING.md) §2.3.

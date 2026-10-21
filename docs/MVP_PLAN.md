# MVP Plan — Vault-Payments

**Status:** Phase 0 planning, revised by the Phase 0.5 feasibility gate
**Date:** 2026-10-21
**Revision:** native emission is the only adapter strategy; Prism is an optional build-time oracle. Corrections C1–C8 applied — see [`PHASE_0.5_FEASIBILITY.md`](PHASE_0.5_FEASIBILITY.md).

---

## 1. Definition of done

A provider is **supported** only when all of the following are true. Until then it is displayed as `partial` or `unknown`, never as supported.

| Gate | Evidence required |
|------|-------------------|
| G1 — Official contract documented | Source URL per capability, recorded in the manifest with `verified_at` |
| G2 — Adapter implemented | Generated code compiles and passes static gates |
| G3 — Sandbox payment succeeds | A real authorize/capture or create/complete against the provider's **sandbox** |
| G4 — Webhook verified | A correctly signed sandbox event is accepted; a tampered one is rejected |
| G5 — Idempotency proven | Duplicate request does not double-charge; duplicate event does not double-process |
| G6 — Reconciliation documented | `RECONCILIATION.md` generated and accurate |
| G7 — License/terms clear | No undeclared-license dependency; terms status recorded |

**No provider may be advertised as supported on the basis of documentation alone.**

---

## 2. Scope boundaries

### In scope for the MVP

- A locally runnable generator (CLI + browser UI).
- Two providers, end to end, in **one** target language.
- Generated: typed client, route handlers, config/secret contract, webhook verification + idempotency, frontend tokenization component, sandbox tests, README + reconciliation guide.
- Capability matrix driven by manifests.
- A visible, honest `unknown` state for everything unverified.
- An **optional** build-time conformance oracle (Prism `callReq` diffed against emitted requests) wired into CI. The generator must build, run and emit without it.

### Explicitly out of scope for the MVP

- Terminals and Tap to Pay (separate approval track — see §6).
- Merchant onboarding / OAuth platform flows.
- Multi-language output beyond the first target.
- Any hosted service, telemetry, or account system.
- Payments in production. Sandbox only.
- GoDaddy Payments (no public charge API — see §7).
- Any Prism runtime, native connector binary, or vendored provider SDK inside generated output.

---

## 3. The vertical slice: Stripe + Square

Two providers are chosen specifically because they **stress different parts of the architecture**.

| | Stripe | Square |
|---|--------|--------|
| Adapter strategy | `native` | `native` |
| Why this one | Header auth, signed timestamp payload, idempotency key — the simplest correct baseline | Seller-scoped OAuth, **URL-bound** signature, and a contractual ban on SDK redistribution |
| Structural difference | Stateless per-request auth; signature covers payload only | Token lifecycle; signature covers **key + notification URL + body**; `Square-Version` pinning |
| Notable difficulty | None major — the happy path | The registered URL is part of the signed string; OAuth token lifecycle; SDK must not be vendored |
| Sandbox access | Instant, self-serve | Instant, self-serve |
| OpenAPI availability | Public, MIT (`stripe/openapi`) | Public, Apache-2.0 (`square/connect-api-specification`) |

Phase 0 justified this pair as "one `prism`, one `native`". **That justification is void** — Phase 0.5 established that both are native. The pair is still correct, for a stronger reason: the two providers differ *structurally*, not cosmetically. Stripe's signature is a pure function of the payload; Square's is a function of the **configuration** as well, which is where generic webhook handlers break. If the manifest schema can express both, it can express the rest.

If only Stripe works, the project has a generalised one-provider template. If both work, the schema has survived two genuinely different auth and signature models.

**Language for the slice:** TypeScript/Node. Rationale: the generator itself is a Node tool, both providers ship first-party Node SDKs (declared as dependencies, never vendored), and the oracle seam is a Node module — so the slice needs no cross-language bridge.

---

## 4. Phases

Estimates assume one experienced full-stack engineer, and are deliberately conservative.

### Phase 1 — Walking skeleton (~2–3 weeks)

Goal: prove the pipeline end to end with the *thinnest* possible output.

- Manifest JSON Schema + loader + validator.
- `generate --provider stripe --dry-run` prints a file plan.
- `generate --provider stripe` emits: typed client, one route, config loader with fail-closed secrets, `.env.example`.
- Golden-file test harness.
- Optional oracle harness: pin `hyperswitch-prism@0.6.0` in a **dev-only** CI job and diff one emitted Stripe request against `callReq`. The job is skippable; the generator must not depend on it.
- No webhooks, no UI yet.

**Exit:** a developer can generate a Stripe client that compiles and fails closed without secrets.

### Phase 2 — Stripe vertical slice, complete (~3 weeks)

- Webhook verification (signature, timestamp window, constant-time compare).
- Durable event table + dedupe constraint + persist-then-ack.
- Idempotency key propagation.
- Tokenized frontend component (hosted fields — no PAN touches the server).
- Sandbox contract tests (authorize, capture, refund, void).
- `RECONCILIATION.md` generation.

**Exit:** G1–G7 satisfied for Stripe.

### Phase 3 — Visual builder, minimal (~2 weeks)

- Local web UI: provider checkboxes, capability table read from manifests, live plan preview.
- `unknown` / `partial` badges rendered distinctly; unsupported capabilities are non-selectable.
- No design polish; the goal is the data flow from manifest → UI → plan → emit.

**Exit:** a non-author can generate the Stripe integration without touching a config file.

### Phase 4 — Square native adapter (~3 weeks)

- Native Square client over direct HTTPS; the official SDK may be declared as a dependency but is **never vendored**.
- `Square-Version` pinning.
- `idempotency_key` on create/complete/cancel.
- Webhook verification including the **notification URL** in the signed string.
- OAuth token lifecycle **stubbed and documented**, not implemented.
- Sandbox contract tests.

**Exit:** G1–G7 satisfied for Square; the manifest schema has survived a second, structurally different provider.

**Milestone A — vertical slice complete.** Two providers, two structurally different security models, one language, all gates green.

### Phase 5 — Remaining eight providers (~6–8 weeks)

Add the eight remaining online providers: PayPal, Adyen, Braintree, Authorize.net, Worldpay, Fiserv, Global Payments, Shift4.

*(Phase 0 listed seven and omitted Shift4 while still counting eight rows of work. The corrected list is eight.)*

Per provider: manifest + flow audit + webhook scheme + sandbox tests. Estimated 3–5 days each, with Adyen and Authorize.net faster (public OpenAPI / best-specified webhooks), Braintree slower (GraphQL, no OpenAPI), and Worldpay slower still (no self-serve sandbox).

**Watch items, all carried from Phase 0.5:**

- Adyen has **no status flow** in Prism, and a direct lookup is unverified (V3). Plan for webhook-driven status.
- Worldpay, Fiserv and Shift4 have **no `handle_event`**, so their webhook handlers get no oracle coverage — sandbox fixtures are the only validation.
- Fiserv's webhook contract is **`UNKNOWN`** (V4). Emit polling-based reconciliation and mark webhooks `unknown` rather than guessing.
- The oracle is a regression baseline, not proof. **G3 (sandbox payment) remains the gate.**

### Phase 6 — Clover native adapter (~3 weeks)

- Model the two surfaces separately: Platform/POS REST and Ecommerce/Hosted Checkout.
- Hosted Checkout webhooks use HMAC (`Clover-Signature`); platform webhooks use a static header — the generator must emit the correct one and **warn** on the weaker scheme.
- Document the undocumented idempotency as `unknown` and emit a local dedupe table.

**Milestone B — 11 of 12 providers.**

### Phase 7 — Hardening and launch (~4 weeks)

- Multi-language emission (second target).
- Architecture test: engine contains zero provider identifiers; add a 13th test provider using only a manifest.
- Security gate regression suite (all ten criteria in `SECURITY_AND_LICENSING.md` §3).
- License scan in CI.
- Documentation, examples, contribution guide for adding a provider.

---

## 5. Effort summary

| Milestone | Elapsed (1 engineer) |
|-----------|----------------------|
| Fastest demonstrable prototype (Phase 1) | ~2–3 weeks |
| Vertical slice, user-visible (Phases 1–4) | ~10–12 weeks |
| 11 of 12 providers, one language (Phases 1–6) | ~3.5–4.5 months |
| Add second language | +6–8 weeks per language |

These estimates carry **low confidence**, and the reason is not code volume. The single largest cost is the **verification** layer: sandbox credentials, webhook fixtures, and the discipline of refusing to mark anything supported until it is proven. For four of the twelve, sandbox access is partner-gated, which makes the schedule depend on vendors rather than engineering.

The oracle reduces the cost of *being wrong* about request shape. It does not reduce the cost of onboarding.

---

## 6. Terminals and Tap to Pay — separate track

Terminal support does **not** follow processor support. Every provider must be verified individually, and the MVP deliberately excludes it.

| Provider | Physical terminal API | Tap to Pay on mobile |
|----------|----------------------|----------------------|
| Stripe | ✅ Terminal SDK family (separate from Payments) | ✅ via Terminal SDK on supported devices |
| Square | ✅ Terminal API (hardware unusable in sandbox) | ✅ Mobile Payments SDK |
| Adyen | ✅ Terminal API (nexo), local or cloud | ✅ Mobile SDK, must be Terminal-API integrated, enabled by Support |
| Braintree | ✅ Verifone terminals, P2PE | Not documented |
| Clover | ✅ Remote Pay / POS SDKs | ✅ Clover Go / Mobile SDK |
| PayPal | ⚠️ Separate Zettle platform; **not supported in the US** | ⚠️ Zettle |
| Authorize.net | ❌ None found | ❌ None found |
| Worldpay / Fiserv / Global Payments / Shift4 | ⚠️ Varies; reseller-gated | ⚠️ Varies |
| GoDaddy | ⚠️ Only via the GoDaddy-owned Poynt API | ⚠️ Poynt |

**Decision:** ship online payments first. Terminals become a separate epic with their own approval work, because each terminal integration requires hardware, certification, and often a partner agreement.

---

## 7. Scope correction: GoDaddy Payments

The brief lists GoDaddy among the 12. Research does not support a direct online integration:

- GoDaddy's public developer platform exposes **Auctions, Commerce, Domains, Email, Hosting, Shopping** — no card-acceptance API.
- There is **no API to create a GoDaddy Payments account or a store**; onboarding is UI-only.
- The Commerce API supports working with orders and transactions, but not creating an authorization or capture.
- The only surface with a full transaction matrix is the **Poynt API**, which GoDaddy owns but which is a separate, partner-gated product.

**Therefore:** GoDaddy is recorded as **`blocked`**, not `unsupported`, for online payments. A named path exists — **GoDaddy Poynt**, an approval-gated developer platform with documented onboarding, an app-development lifecycle, Smart Terminal apps, Cloud apps, semi-integration, Poynt Collect and an App Center. It is a **different product** from the GoDaddy Payments Commerce API, it requires a partner agreement and app review, and it is **not scheduled**.

The milestone becomes **11 adapters + 1 blocked provider** — not 12 claimed integrations. Claiming otherwise would violate the project's own rule against implying unimplemented support.

*(If a GoDaddy merchant relationship or partner agreement already exists, this should be re-verified — a partner may have access to APIs that are not publicly documented.)*

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Oracle diverges from provider reality | Medium | Medium | Treat as a regression baseline; G3 sandbox tests remain the gate |
| Oracle fidelity is partial — no webhook parsing for 3 providers | High | Medium | Sandbox fixtures for Worldpay / Fiserv / Shift4 webhook handlers |
| Oracle adds a build-time platform constraint | Low | Low | One pinned Ubuntu 24.04 CI job; the generator works without it |
| Provider terms prohibit generators | Unknown | Critical | Never vendor provider SDKs; written confirmation before commercial launch |
| Sandbox credentials unavailable (enterprise providers) | High for Worldpay/Fiserv/Global/Shift4 | High | Start partner conversations in Phase 1, not Phase 5 |
| Webhook schemes change | Medium | Medium | Manifest `verified_at` + scheduled contract tests |
| Scope creep toward a runtime service | High | High | Hard rule: the generator never sits in the request path |
| Generated code drifts from provider APIs | Certain over time | High | Versioned manifests, CI drift detection, dated verification |

---

## 9. Non-goals (restated for clarity)

Vault-Payments will **not**:

- Process or proxy payments.
- Store card data or act as a vault.
- Provide merchant onboarding or underwriting.
- Guarantee PCI compliance.
- Claim support without sandbox evidence.
- Require a paid provider partnership to be useful.

---

## 10. Fastest path to a credible prototype

1. **Week 1:** manifest schema + Stripe manifest + emitter producing a typed client and a fail-closed config loader.
2. **Week 2:** Stripe webhook verification with a tampered-payload test; `generate --dry-run` showing a file plan.
3. **Week 3:** minimal checkbox UI reading the manifest, with `unknown` badges rendered honestly.
4. **Week 4:** Square manifest — a second, structurally different provider, proving the schema generalises rather than fitting one vendor.

At the end of week 4 there is a demo that shows the **core claim** — two structurally different providers generated from data, with secure webhooks — without having built 12 adapters. That is the cheapest possible test of the whole thesis.

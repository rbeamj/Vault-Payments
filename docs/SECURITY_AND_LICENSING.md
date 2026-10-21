# Security & Licensing — Vault-Payments

**Status:** Phase 0 mandate, revised by the Phase 0.5 feasibility gate
**Date:** 2026-10-21
**Revision:** the supply-chain posture changed from "Prism as a connector backend" to "Prism as an optional build-time oracle; no runtime dependency". Provider terms findings from Phase 0.5 are incorporated in §2.3 and §2.7.

This document defines the non-negotiable rules the generator must enforce, the PCI boundary we must never cross, and the licensing/terms position for every component we intend to reuse.

---

## Part 1 — Security

### 1.1 Threat model

The generator is a **code factory**. Its failure modes are not "the server was hacked"; they are "the tool shipped an insecure integration to thousands of repositories". That makes generated-code defaults the primary asset to protect.

| Asset | Threat | Consequence |
|-------|--------|-------------|
| Merchant secret keys | Generated code hardcodes keys, or logs them | Full account compromise |
| Cardholder data | Generated code accepts a raw PAN and posts it to a server | PCI scope explosion, breach liability |
| Payment outcome | Generated code trusts a browser redirect to mark an order paid | Free goods, fraud |
| Webhook endpoint | Generated handler accepts unsigned POSTs | Forged payment confirmations |
| Webhook replay | Same event processed repeatedly | Double fulfilment, double refunds |
| Dependencies | Prism/SDK version pinned to a compromised release | Supply-chain compromise |

### 1.2 Non-negotiable generation rules

These are **hard gates**. The generator must refuse to emit output that violates them, and CI must regression-test each one.

| # | Rule | Enforcement |
|---|------|-------------|
| S1 | **No secrets in generated source.** Keys come from environment variables or a secret manager reference. | Static scan of every emitted file; fail on high-entropy literals and known key prefixes (`sk_live_`, `sk_test_`, …). |
| S2 | **No raw card data by default.** Card entry happens in provider-hosted fields, an iframe, or the provider's mobile SDK. | The canonical payment request type accepts a *token*, never a PAN. Emitting a `card_number` field fails the build. |
| S3 | **No client-side success authority.** A redirect or `onSuccess` callback may update UI only. Order state changes require a server-side status fetch or a verified webhook. | Generated frontend contains no state transition on callback; a comment states the rule explicitly. |
| S4 | **Signature verification precedes parsing.** | Emitted handler calls `verify()` before `JSON.parse`; verified by fixture test. |
| S5 | **Idempotency is mandatory on money-moving calls.** | Every emit includes the provider's idempotency mechanism (header, body field, or documented absence). |
| S6 | **Webhook handlers are idempotent and durable.** Unique constraint on `(provider, event_id)`; persist-then-ack. | Schema migration emitted alongside handler. |
| S7 | **Replay window enforced where the provider supplies a timestamp.** | Timestamp check emitted with a configurable tolerance (default 5 minutes). |
| S8 | **Constant-time signature comparison.** | Template uses the platform's constant-time primitive; never `==`. |
| S9 | **No payment success derived from an unverified field.** | Status enums come from provider responses, not from request parameters. |
| S10 | **Logs redact secret and card fields.** | Structured logger emitted with a redaction allowlist. |

### 1.3 Secret handling contract

Generated projects receive a `.env.example` containing **names and descriptions only** — never values:

```dotenv
# Provider: Example Gateway — server API key (secret)
EXAMPLE_API_KEY=
# Provider: Example Gateway — webhook signing secret (secret)
EXAMPLE_WEBHOOK_SECRET=
```

Additional requirements:

- `.env` is added to `.gitignore` by the generator if absent.
- Startup **fails closed** if a required secret is missing — no silent fallback to a test key.
- The generator never asks the user to paste a live key into the UI. If a future version offers sandbox verification, keys must stay in memory, be used only for the documented sandbox host, and never be written to disk or logs.

### 1.4 PCI DSS scope

The generator's design goal is to keep generated integrations at **SAQ A** wherever the provider supports hosted fields.

| Integration style | Typical SAQ | Generator stance |
|-------------------|-------------|------------------|
| Provider-hosted fields / iframe / redirect | A | **Default** |
| Direct post from the merchant's page to the provider | A-EP | Allowed with a warning |
| Card data touches the merchant server | D | **Never generated** |

The generator must state, in the emitted README, which SAQ posture the chosen integration implies, and must not imply that using the tool confers PCI compliance.

### 1.5 Webhook verification is provider-specific

A single generic handler is unsafe because the schemes genuinely differ — including **within one provider**. Clover is the clearest example: its Hosted Checkout webhooks use HMAC in `Clover-Signature`, while its older platform webhooks use a static `X-Clover-Auth` shared secret. A generator that models "Clover webhooks" as one scheme would produce a weak handler.

| Provider | Header / mechanism | Signed content | Notes |
|----------|--------------------|----------------|-------|
| Stripe | `Stripe-Signature` (`t=`, `v1=`) | `timestamp + "." + rawBody`, HMAC-SHA256 | Retries up to 3 days; dedupe on event `id` |
| Square | `x-square-hmacsha256-signature` | **signature key + notification URL + rawBody**, HMAC-SHA256 | The URL is part of the signed string — must be captured exactly |
| Clover — Hosted Checkout | `Clover-Signature` (`t=`, `v1=`) | `timestamp + "." + rawBody`, HMAC-SHA256 | Documented example is ambiguous about separator; verify in sandbox |
| Clover — platform | `X-Clover-Auth` | Static shared secret | **Not HMAC**; treat as weak, flag in output |
| Authorize.net | `X-ANET-Signature` | HMAC-SHA512 with merchant Signature Key | 10 retries then endpoint auto-deactivates |
| Braintree | `bt_signature` + `bt_payload` form fields | Validated by SDK parse helper | 30s response budget |
| PayPal | `verify-webhook-signature` API call | Server-side API verification | Not a local HMAC |
| Adyen | HMAC signature header | Configured in Customer Area | Requires HMAC key setup |
| Worldpay | `Event-Signature: {keyId}/{hashFunction}/{signature}` | Raw body, HMAC-SHA256 | Multi-key with `keyId` selection; secret provisioned by an **Implementation Manager**, not self-service |
| Shift4 | **None** | — | **Unsigned webhooks.** The handler cannot verify authenticity; must depend on allowlisting plus a server-side status confirmation before fulfilment |
| Fiserv | **UNKNOWN** | Unknown | No documented notification contract found. Generation must emit polling-based reconciliation and mark webhooks `unknown` (V4) |

**Rule:** every generated handler ships with a fixture-based test that proves a tampered payload is rejected — **except** `unsigned_allowlist` providers, where the test proves the allowlist rejects an unlisted source and that the reconciliation path exists. Those handlers must carry a visible generated warning; the generator may never silently emit an unauthenticated endpoint.

### 1.6 Idempotency and replay

Three distinct concepts must not be conflated:

1. **Request idempotency** — retrying a create/capture/refund must not double-charge. Uses the provider's own mechanism:
   - Stripe: `Idempotency-Key` header (24h retention on v1).
   - Square: `idempotency_key` body field, scoped per seller/location.
   - Shift4: `Idempotency-Key` header, 24-hour validity, `Idempotent-Replayed: true` on duplicates.
   - Fiserv: `Client-Request-Id` doubles as the idempotency key.
   - Adyen: documented idempotency.
   - PayPal: documented idempotency.
   - Worldpay: documented, but only **partial** coverage across the operation set.
   - Authorize.net: duplicate-window setting — **partial**, not a true idempotency key.
   - Clover: **no documented idempotency key** (V7) — must be treated as `unknown`, and the generated code must not pretend otherwise.
   - Global Payments: **unknown** (V8).
   - Braintree: **unknown** (V9).
2. **Webhook deduplication** — the same event delivered twice is processed once.
3. **Replay defence** — an old, validly signed event is rejected.

Where a provider offers no idempotency primitive, the generator must emit a local idempotency table and document the residual risk. Silently omitting it is prohibited.

### 1.7 Reconciliation guidance

Every generated integration includes a `RECONCILIATION.md` explaining:

- How to list authoritative transactions from the provider (`payment.status` / `get`). **If the provider has no lookup** — Adyen is the open question (V3) — the guide must say so and describe webhook-plus-local-ledger reconciliation instead of inventing an endpoint.
- Which webhook events are terminal vs intermediate.
- How to detect a **missed** webhook (compare provider list against local records over a window).
- How to safely re-apply a missed event (idempotent handler makes this safe).
- That provider retry windows are finite (Stripe 3 days, Authorize.net 10 attempts, Braintree 3h sandbox / 24h production) — so absence of a webhook is evidence, not proof.

### 1.8 Supply chain

- Pin every dependency to an exact version; commit lockfiles in generated output.
- Prism, when used as the oracle: pin `hyperswitch-prism` exactly, run it in **one** pinned CI job (Ubuntu 24.04, glibc ≥ 2.38), and never redistribute it. It is **not** a dependency of the generator or of generated code, and the generator must build and emit without it.
- **Provider SDKs are declared, never vendored.** Generated output must contain no copied SDK source and no bundled connector binary.
- Generated Dockerfiles use digest-pinned base images.
- CI runs dependency scanning and fails on known-critical advisories.
- Generated code must **not** auto-update payment SDKs; upgrades are explicit, reviewed changes.

---

## Part 2 — Licensing

### 2.1 Project license

**Apache-2.0**, consistent with the repository's existing `LICENSE`.

Apache-2.0 is the right choice here: it matches the strongest reusable components, includes an explicit patent grant, and imposes no copyleft on generated output or on merchants' proprietary applications.

### 2.2 Component audit

| Component | License | Reuse | Obligations / notes |
|-----------|---------|-------|---------------------|
| `juspay/hyperswitch-prism` | Apache-2.0 | ⚙️ Optional build-time oracle | **Not redistributed, not linked into output.** If ever bundled, obligations would be: ship the Apache-2.0 text (§4(a)), retain notices (§4(c)), state modifications (§4(b)); there is **no `NOTICE` file** in the repo, and no trademark grant (§6). The npm tarball contains **no LICENSE file**. |
| `juspay/hyperswitch` | Apache-2.0 | ⚠️ Reference only | Not a runtime dependency under the chosen architecture. |
| `killbill/killbill` | Apache-2.0 | ❌ Not adopted | Domain mismatch. |
| `killbill-stripe-plugin` | Apache-2.0 | ⚠️ Reference | Could inform Stripe adapter edge cases. |
| `killbill-adyen-plugin` | Apache-2.0 | ⚠️ Reference | Same. |
| `killbill-braintree` | **No license declared** | ❌ **Do not copy** | Absent a license, default copyright applies. Reference behaviour only; never copy code. |
| `activemerchant/active_merchant` | MIT | ⚠️ Reference | Ruby; useful for provider quirks. Preserve copyright notice if any code is adapted. |
| `thephpleague/omnipay` | MIT | ⚠️ Reference | PHP; per-gateway packages may carry separate licenses — check each. |
| `Payum/Payum` | MIT | ⚠️ Reference | Same caution. |
| `OpenAPITools/openapi-generator` | Apache-2.0 | ✅ Emission engine | Retain notices; generated files carry the project's own header. |
| `handlebars-lang/handlebars.js` | MIT | ✅ Templating | Preserve notice. |
| Provider SDKs | Varies | ⚠️ Declared dependency only | Many are MIT/Apache-2.0; some are proprietary. Generated code may **depend** on them but must never **vendor** them. Square's Developer Terms §2 makes this a contractual requirement, not just hygiene. |

**Rule:** the project must never vendor a dependency whose license is undeclared or incompatible. A CI license-scan gate blocks merges that introduce one.

### 2.3 Provider Terms — the unresolved legal question

This is the single largest non-technical risk, and it is **not** a licensing question in the OSS sense. It is a contracts question: *may a third-party tool generate code that calls a provider's API, and may that code be distributed?*

Findings so far:

| Provider | Agreement reviewed | Explicit generator permission |
|----------|--------------------|-------------------------------|
| Stripe | ✅ | **UNKNOWN** — no generator clause found either way; §2.2 restricts Terminal SDK use outside Stripe Terminal Products and Services |
| Square | ✅ 2026-09-10 | **NO** — §2 bars redistributing Developer Tools and offering a substantially similar service; §1 requires OAuth for seller content |
| PayPal | ✅ | **NO** — §9.1.1 bars renting, leasing, or otherwise transferring rights in the software to a third party |
| Adyen | ✅ | **PARTIAL** — silent on codegen; mandatory `applicationInfo` effectively requires the tool to identify itself |
| Braintree | ❌ | UNKNOWN |
| Authorize.net | ❌ | UNKNOWN |
| Worldpay | ❌ | UNKNOWN |
| Fiserv | ❌ | UNKNOWN |
| Global Payments | ❌ | UNKNOWN |
| Shift4 | ❌ | UNKNOWN |
| Clover | ❌ — legal pages are JavaScript-only | UNKNOWN |
| GoDaddy | ❌ | UNKNOWN — and there is no public charge API anyway |

**4 of 12 reviewed. Zero grant permission. Two contain affirmative restrictions.** Absence of a prohibition is not permission.

Consequences for the plan:

1. The tool must be usable **without any provider partnership** — it emits code into the user's own repo, under the user's own credentials. This is materially different from reselling access.
2. **Never vendor a provider SDK.** This is the architectural mitigation for Square §2 and PayPal §9.1.1: emit direct HTTPS calls, and where an SDK is genuinely needed, declare it as an ordinary dependency the user installs.
3. Adyen's mandatory `applicationInfo` fields must be **generated**, not merely documented — generated Adyen code identifies the generator on every request.
4. Before any commercial launch, obtain written confirmation from each provider's partner/legal contact. This is a **launch gate**, not a Phase 0 blocker.
5. The README must state plainly that the user is responsible for complying with their provider agreement.

### 2.4 Trademarks

Provider names and logos are trademarks. The project may use names **nominatively** ("supports Stripe") but must not:

- Imply endorsement, partnership, or certification.
- Use provider logos in a way that suggests affiliation.
- Name the product in a way that trades on a provider's mark.

A trademark notice belongs in the README, and the capability matrix must avoid language like "official" or "certified" unless a certification actually exists.

### 2.5 Generated output licensing

- Generated code is owned by the user.
- No license header is imposed on the user's application; an optional SPDX header may be offered.
- Reference templates remain Apache-2.0.
- The generator must not emit code copied from an incompatibly licensed source (e.g. the unlicensed Braintree plugin).
- Generated output **never bundles a provider SDK or connector binary**; SDKs appear only as declared dependency entries.
- Generated output contains **no Vault-Payments runtime**, so no licence obligation flows from this project into the user's application.

### 2.6 Data protection

- The generator performs no telemetry by default.
- If telemetry is ever added, it must be opt-in, documented, and must never include keys, payloads, or cardholder data.
- The tool runs offline; no payment data leaves the user's machine.
- Sandbox verification, if implemented, must target only documented sandbox hosts and must warn before any network call carrying credentials.

### 2.7 Unresolved legal questions

Carried forward deliberately. None is closed by the architecture decision.

| ID | Question | Affects |
|----|----------|---------|
| **V10** | Do the 8 unreviewed agreements permit a third-party generator? | Launch legality |
| **V11** | Does an open-source generator trigger Adyen technology-partner registration? | Adyen distribution and attribution |
| **V12** | Does Poynt Collect expose a server-side charge API usable by generated GoDaddy code? | GoDaddy roadmap only |
| **V14** | What third-party licences are compiled into Prism's native binaries? (no `NOTICE`, no SBOM) | Only matters if Prism is ever redistributed — the decision is not to |
| **V15** | Does any provider prohibit third-party code generation, and do Square §2 / Stripe §2.2 reach a generator that ships no provider code? | The whole product; the Square adapter specifically |

**Rule:** these close only on a primary source — the agreement text, a written partner response, or legal review. They do not close on inference, and the generator must not describe itself as "approved", "certified" or "supported by" any provider while they are open.

---

## 3. Security acceptance criteria for the MVP

The vertical slice is not complete until all of the following are demonstrated:

1. A generated project starts and **fails closed** with missing secrets.
2. A tampered webhook payload is rejected, with a test proving it.
3. A duplicate webhook event is processed once, proven by test.
4. A stale-but-validly-signed event is rejected where a timestamp exists.
5. No emitted file contains a secret-shaped literal (scanner passes).
6. No emitted file accepts a raw PAN (type-level and scanner check).
7. A client-side success callback cannot change order state (integration test).
8. Every money-moving call carries the provider's idempotency mechanism or a documented gap.
9. `RECONCILIATION.md` is generated and accurate for the selected provider.
10. License scan passes with zero undeclared-license dependencies.

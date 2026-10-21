# Provider Capability Matrix — Vault-Payments

**Research date:** 2026-10-21
**Method:** Official developer documentation only. Every material claim carries a source URL.
**Phase 0.5 corrections applied:** Phase 0.5 re-verified Prism's shape directly from its shipped artifacts. Corrections C1–C8 are reflected below — most importantly, "reuse" now means **reference and oracle**, never runtime reuse. See [`PHASE_0.5_FEASIBILITY.md`](PHASE_0.5_FEASIBILITY.md).

---

## How to read this document

### Two different meanings of "verified"

This document uses **VERIFIED / PARTIAL / UNSUPPORTED / UNKNOWN** to describe what the *documentation* says:

| Status | Means |
|--------|-------|
| **VERIFIED** | Official documentation explicitly confirms the capability |
| **PARTIAL** | Exists, but limited, approval-gated, product-variant-specific, or documented with material gaps |
| **UNSUPPORTED** | Official documentation shows the capability is not offered |
| **UNKNOWN** | Not found in official documentation, or documentation contradicts itself |

> ### ⚠️ Documentation verification is not product support
>
> **No provider in this matrix has passed a sandbox test.** Zero adapters exist.
>
> The project's rule is stricter than this matrix: a provider becomes *supported* only when G1–G7 in [`MVP_PLAN.md`](MVP_PLAN.md) §1 pass, including a real sandbox transaction and a webhook rejection test. Everything below is a **research input**, not a support claim. The README lists every provider as `planned` for exactly this reason.

### Reuse strategy

| Symbol | Meaning |
|--------|---------|
| ♻️ Prism reference | A hardened Apache-2.0 connector exists in `hyperswitch-prism` and can be used as a **request-shape reference and build-time oracle**. It is **not** a runtime dependency of generated code. |
| 🔧 Custom | No existing OSS connector found; Vault-Payments writes the native adapter from provider docs |
| ⛔ Blocked | No public API exists to generate against |

---

## 1. Master matrix — online payment operations

| Provider | API style | Create / charge | Auth-only | Capture | Void | Refund (partial) | Status | Idempotency |
|----------|-----------|-----------------|-----------|---------|------|------------------|--------|-------------|
| **Stripe** | REST, form-encoded | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED |
| **Square** | REST, JSON | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED |
| **Clover** | REST (2 surfaces) | VERIFIED | VERIFIED | VERIFIED | PARTIAL | VERIFIED | PARTIAL | UNKNOWN |
| **GoDaddy** | Commerce / Poynt | **UNSUPPORTED** | **UNSUPPORTED** | **UNSUPPORTED** | **UNSUPPORTED** | PARTIAL | PARTIAL | PARTIAL |
| **PayPal** | REST, JSON | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED |
| **Adyen** | REST, JSON | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | **UNKNOWN** [V3] | VERIFIED |
| **Braintree** | GraphQL | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | UNKNOWN |
| **Authorize.net** | REST, XML + JSON | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | PARTIAL |
| **Worldpay** | REST, HATEOAS | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | PARTIAL |
| **Fiserv** | REST (2 stacks) | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | PARTIAL | VERIFIED |
| **Global Payments** | REST, JSON | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | UNKNOWN |
| **Shift4** | REST, form-encoded | VERIFIED | VERIFIED | VERIFIED | UNKNOWN | PARTIAL | VERIFIED | VERIFIED |

**Reading this table:** 11 of 12 support the core authorization lifecycle; GoDaddy does not. Adyen's **status** lookup is a separate open question and is the only `UNKNOWN` in a lifecycle-adjacent column. The `PARTIAL` and `UNKNOWN` cells are where integration risk concentrates — particularly Clover's undocumented idempotency, Global Payments' absent idempotency documentation, and Adyen's status model.

**[V3]** Adyen: Prism ships no `get` flow for the `adyen` connector. Adyen's Checkout integration is webhook-driven for outcome, so a direct status lookup may not exist in the form the other providers offer. This is **unverified** — it must be confirmed against Adyen's API reference before the adapter is scheduled. Phase 0.5 corrected an earlier `VERIFIED` on the strength of the connector gap, not on provider documentation.

---

## 2. Master matrix — webhooks, terminals, sandbox

| Provider | Webhook registration | Signature mechanism | Physical terminal | Tap to Pay | Sandbox access | Prism reference |
|----------|---------------------|--------------------|-------------------|------------|----------------|-------|
| **Stripe** | VERIFIED (dashboard + API) | VERIFIED — HMAC-SHA256 | VERIFIED | VERIFIED | VERIFIED (self-serve) | ♻️ Reference |
| **Square** | VERIFIED (dashboard + API) | VERIFIED — HMAC-SHA256, **URL-bound** | VERIFIED | VERIFIED | VERIFIED (self-serve) | 🔧 Custom |
| **Clover** | PARTIAL (dashboard only) | PARTIAL — HMAC on one surface, static header on another | VERIFIED | VERIFIED | VERIFIED | 🔧 Custom |
| **GoDaddy** | PARTIAL (Poynt only) | UNKNOWN | PARTIAL (Poynt only) | PARTIAL (Poynt only) | PARTIAL (Poynt only) | ⛔ Blocked |
| **PayPal** | VERIFIED (API) | VERIFIED — `verify-webhook-signature` API | PARTIAL (Zettle, separate) | PARTIAL (Zettle, not US) | VERIFIED | ♻️ Reference |
| **Adyen** | VERIFIED (Customer Area) | VERIFIED — HMAC | VERIFIED (Terminal API / nexo) | VERIFIED (Mobile SDK, enablement) | VERIFIED | ♻️ Reference |
| **Braintree** | VERIFIED (Control Panel) | VERIFIED — `bt_signature` + SDK parse | VERIFIED (Verifone, P2PE) | UNKNOWN | VERIFIED | ♻️ Reference |
| **Authorize.net** | VERIFIED (API) | VERIFIED — HMAC-SHA512 | **UNSUPPORTED** | **UNSUPPORTED** | VERIFIED | ♻️ Reference |
| **Worldpay** | PARTIAL (via Implementation Manager) | VERIFIED — HMAC-SHA256 | VERIFIED (separate APIs) | UNKNOWN | PARTIAL (partner onboarding) | ♻️ Reference |
| **Fiserv** | **UNKNOWN** | **UNKNOWN** | VERIFIED | UNKNOWN | VERIFIED (best-in-class) | ♻️ Reference |
| **Global Payments** | VERIFIED (app config) | VERIFIED — **SHA-512 salted, not HMAC** | VERIFIED (Cloud/Semi/Full) | UNKNOWN | VERIFIED | ♻️ Reference |
| **Shift4** | VERIFIED (per-object URL) | **UNSUPPORTED — no auth header** | VERIFIED (Commerce Engine) | UNKNOWN | VERIFIED (self-serve) | ♻️ Reference |

### The terminal finding

The requirement warned: *do not assume terminal support follows processor support*. The data confirms the warning.

- **9 of 12** have some documented physical-terminal API.
- Only **4** have documented **Tap to Pay on mobile**: Stripe, Square, Adyen, Clover.
- **5** are `UNKNOWN` for Tap to Pay: Braintree, Worldpay, Fiserv, Global Payments, Shift4.
- **Authorize.net has neither**, despite being a major online gateway.
- **0** terminal flows exist in Prism — its 30 flows are all online.

Terminal support must be treated as a **separate integration per provider**, not a flag on the processor.

---

## 3. Reuse analysis

### 3.1 Coverage of the 12 targets in open source

| Project | Stripe | Square | Clover | GoDaddy | PayPal | Adyen | Braintree | Authorize.net | Worldpay | Fiserv | Global Pay | Shift4 |
|---------|:------:|:------:|:------:|:-------:|:------:|:-----:|:---------:|:-------------:|:--------:|:------:|:----------:|:------:|
| **hyperswitch-prism** (128 connectors) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **hyperswitch** (full) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Kill Bill** (live plugins) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ActiveMerchant** (Ruby) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

\* `killbill-braintree` declares **no license** — reference only, never copy.

**Result: 9 of 12 have a Prism connector, 2 have none, and 1 has no public online payment API.**

But "a connector exists" is not "a connector covers what we need". The MVP requires six operations: authorize, capture, void, refund, status lookup, and webhook handling. Measured against those:

| Provider | Prism connector | authorize | capture | void | refund | status (`get`) | webhook (`handle_event`) | MVP complete? |
|----------|-----------------|:---------:|:-------:|:----:|:------:|:--------------:|:------------------------:|:-------------:|
| Stripe | `stripe` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Yes** |
| PayPal | `paypal` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Yes** |
| Braintree | `braintree` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Yes** — no `refund_get` |
| Authorize.net | `authorizedotnet` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Yes** |
| Global Payments | `globalpay` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Yes** |
| Adyen | `adyen` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | **No** — status (V3) |
| Worldpay | `worldpay` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **No** — webhooks (V4) |
| Fiserv | `fiserv` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **No** — webhooks, contract unknown (V4) |
| Shift4 | `shift4` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **No** — webhooks (V4) |
| Square | — | — | — | — | — | — | — | **Native** |
| Clover | — | — | — | — | — | — | — | **Native** |
| GoDaddy | — | — | — | — | — | — | — | **Blocked** |

**5 of 9 connectors are complete for the MVP operation set; 4 need native supplements.** That number drives scheduling: Worldpay, Fiserv and Shift4 are *not* "reuse" work, and Adyen's status model is an open question.

None of this is runtime reuse. Under the decided architecture every adapter is native; the connectors are a specification and a CI oracle.

### 3.2 The webhook gap — why the engine owns webhooks

Generated integrations are native, so every webhook handler is emitted by Vault-Payments. The gap below still matters, because it determines where the Prism oracle can check anything. Prism exposes `handle_event` on only **39 of its 128 connectors** (30%). Among the nine with a connector:

| Provider | Prism payment flows | Prism webhook handling |
|----------|--------------------|------------------------|
| Stripe | 17 flows | ✅ |
| PayPal | 14 flows | ✅ |
| Adyen | 17 flows | ✅ |
| Braintree | 11 flows | ✅ |
| Authorize.net | 16 flows | ✅ |
| Global Payments | 16 flows | ✅ |
| Worldpay | 10 flows | ❌ |
| Fiserv | 7 flows | ❌ |
| Shift4 | 15 flows | ❌ |

**Consequence:** for Worldpay, Fiserv and Shift4 the oracle can check request construction but **cannot** check event parsing. Their webhook handlers get no oracle coverage and must be validated by sandbox fixtures alone. For Fiserv the webhook contract itself is `UNKNOWN`, which blocks webhook generation entirely until resolved (V4).

This reinforces the decision to keep webhook verification in the universal engine, driven by manifest data — never delegated to a connector library.

### 3.3 Connector maturity varies within Prism

Not all connectors are equal. Observable signals:

- **Stripe, Adyen, Authorize.net, PayPal, Shift4, Global Payments** ship `scenarios` and runnable examples.
- **Braintree** has `scenarios: none` and `examples_python: none` — implemented, but not exercised end-to-end in the repository.
- **Fiserv, Worldpay** have several near-duplicate connector variants (`worldpay`, `worldpayraft`, `worldpayvantiv`, `worldpayxml`; `fiserv`, `fiservcommercehub`, `fiservemea`), and the repository also contains obvious duplicates elsewhere (`Elavon`/`Elavon Pg`/`Elavonpg`, `Absa Sanlam`/`Absasanlam`).

**Brand is not connector (C6).** Four brands map to multiple Prism connectors, so "9 providers" is really **17 connectors**:

| Brand | Prism connectors | Consequence |
|-------|------------------|-------------|
| Worldpay | `worldpay`, `worldpayraft`, `worldpayvantiv`, `worldpayxml` | Four different products; the reference must name which one |
| Fiserv | `fiserv`, `fiservcommercehub`, `fiservemea` | Commerce Hub vs CardPointe vs EMEA are not interchangeable |
| Global Payments | `globalpay`, `globalpayments_heartland`, `globalpayments_realex`, `globalpaymentsrealex` | Heartland and Realex differ from GP-API |
| All others | one each | — |

Each manifest must therefore pin an **exact connector variant**, not a brand name. Where variants disagree, the manifest records which product the adapter targets and the others are out of scope until separately verified.

**Implication:** connector presence in a list is not evidence of correctness. Each of the nine needs a sandbox audit before it is marked supported — which is precisely the project's G3 gate.

---

## 4. Per-provider findings

### 4.1 Stripe — ♻️ Prism reference · easiest overall

- Single host `https://api.stripe.com`; dated API versions; v1 and v2 coexist.
- Official server SDKs for Ruby, Python, Go, Java, Node, PHP, .NET. Public **MIT** OpenAPI spec (`stripe/openapi`).
- Auth-then-capture via `capture_method=manual`, partial capture via `amount_to_capture`; cancel PaymentIntent = void.
- `Idempotency-Key` on all POSTs, 24-hour retention on v1; same key with different params errors.
- Webhooks: `Stripe-Signature` (`t=…,v1=…`), HMAC-SHA256 over `timestamp.payload`; auto-retry up to 3 days; **no automatic replay** — use List Events or dashboard resend; dedupe on event `id`.
- Terminals are a separate SDK family; Tap to Pay requires the Terminal SDK on compatible hardware.
- Sandbox: same hosts, key prefix distinguishes test/live.

**Generator relevance:** fully declarative from the spec. The reference implementation for native emission, and the oracle's highest-fidelity target.

**Sources:** https://docs.stripe.com/sdks · https://github.com/stripe/openapi · https://docs.stripe.com/api/idempotent_requests · https://docs.stripe.com/webhooks · https://docs.stripe.com/testing · https://docs.stripe.com/terminal

---

### 4.2 Square — 🔧 Custom · best-documented custom provider

- `https://connect.squareup.com` / `https://connect.squareupsandbox.com`; `Square-Version` header pins behaviour.
- Server SDKs: Java, .NET, Node, PHP, Python, Ruby, Go. Public **Apache-2.0** OpenAPI (`square/connect-api-specification`); SDKs MIT.
- Auth-only via `autocomplete:false`; capture via `/complete`; void via `/cancel`; `idempotency_key` required on create, scoped per seller/location.
- **Webhook signature binds the notification URL**: `x-square-hmacsha256-signature` = HMAC-SHA256 over `signature_key + notification_url + rawBody`. The generator must capture the exact registered URL at verification time — a subtle failure mode that generic handlers get wrong.
- OAuth: code flow + PKCE; access tokens 30 days; PKCE refresh tokens single-use/90 days; `oauth.authorization.revoked` event.
- Terminal API exists, but **sandbox cannot use terminal hardware**.
- Tap to Pay via the Mobile Payments SDK.

**Generator relevance:** the reference **native** adapter, and the best test of the manifest schema because its signature scheme is structurally unlike Stripe's.

**Terms constraint (Phase 0.5):** Square's Developer Terms §2 prohibit redistributing Developer Tools and prohibit offering a service substantially similar to Square's. That is a direct reason the generator must **never vendor the Square SDK**: it emits direct HTTPS calls and, if the SDK is used at all, declares it as an ordinary dependency. §1 also requires OAuth for seller-scoped content and PCI DSS compliance. Whether the terms reach a generator that ships no Square code is unresolved — see V15.

**Sources:** https://developer.squareup.com/docs/devtools/sandbox/overview · https://developer.squareup.com/docs/sdks · https://github.com/square/connect-api-specification · https://developer.squareup.com/docs/oauth-api/movetoprod · https://developer.squareup.com/docs/terminal-api/overview

---

### 4.3 Clover — 🔧 Custom · two surfaces, two security models

Clover is not one API. It is at least two:

1. **Platform / POS REST** — `merchants/{mId}`, in-person oriented.
2. **Ecommerce API** — `/v1/charges`, online oriented.

| Aspect | Finding |
|--------|---------|
| Hosts | NA `api.clover.com`, EU `api.eu.clover.com`, LATAM `api.la.clover.com`; sandbox `apisandbox.dev.clover.com`. Ecommerce service hosts: `scl-sandbox.dev.clover.com` + `apisandbox.dev.clover.com`; **production SCL host not published in the spec** |
| Server SDKs | None first-party; REST + per-endpoint OpenAPI 3.0 blocks |
| Auth-only | `POST /v1/charges` with `capture:false`; `x-forwarded-for` required |
| Idempotency | **UNKNOWN** — no `Idempotency-Key` parameter; only an `idempotency_error` error type |
| Webhooks | Dashboard-only configuration with a verification-code handshake |
| Webhook signature | **Two schemes.** Hosted Checkout: `Clover-Signature` `t=…,v1=…`, HMAC-SHA256 over `timestamp.body`. Platform: `X-Clover-Auth`, a **static shared secret, not HMAC** |
| Terminals | Remote Pay (Windows/Cloud/Android/iOS), Clover Go, POS SDKs |
| Tap to Pay | Clover Go / Mobile SDK |

**Generator relevance:** the hardest modelling problem. A manifest that treats "Clover webhooks" as one scheme will emit a weak handler. The generator must emit the correct scheme per surface and **warn** when only the static-header scheme is available.

**Sources:** https://docs.clover.com/dev/reference/createcharge · https://docs.clover.com/dev/docs/ecommerce-api-overview · https://docs.clover.com/dev/docs/ecomm-hosted-checkout-webhook · https://docs.clover.com/dev/docs/webhooks · https://docs.clover.com/dev/docs/sdks-doc-resources

---

### 4.4 GoDaddy Payments — ⛔ Blocked

This is the most consequential correction to the original 12-provider assumption.

| Question | Finding |
|----------|---------|
| Is there a public card-acceptance API? | **No.** The developer platform exposes Auctions, Commerce, Domains, Email, Hosting, Shopping |
| Can an app create a charge / authorization? | **No documented endpoint** |
| Can an app create a merchant account or store? | **No** — docs state there is no API for this; onboarding is UI-only |
| What does Commerce API offer? | Stores, catalog, customers, orders, tax, and reading payment transactions; not charge creation |
| Is there any full transaction API? | Only the GoDaddy-owned **Poynt API** (`services.poynt.net`, `Api-Version: 1.2`) — a separate, partner-gated product with its own OAuth2 and app approval |

**Therefore:** a generated GoDaddy integration cannot be end-to-end against the GoDaddy Payments Commerce API. Recording it as supported would violate the project's own honesty rule. The provider status is **`blocked`, not `unsupported`**, because a named path exists:

> **The path: GoDaddy Poynt.** Poynt is a real, approval-gated developer platform with documented onboarding, an app-development lifecycle, Smart Terminal apps, Cloud apps, semi-integration, Poynt Collect, and an App Center. It is a **different product** from the GoDaddy Payments Commerce API and requires a partner agreement and app review. It is not a drop-in substitute, and it is not scheduled.

> **Caveat:** if a merchant or partner relationship already exists, a partner may have access to APIs that are not publicly documented. This finding should be re-tested in that context before being treated as permanent.

**Sources:** https://developer.godaddy.com/en/docs/api-users · https://developer.godaddy.com/ · https://docs.poynt.com/app-integration/ · https://docs.poynt.com/api-reference/

---

### 4.5 PayPal — ♻️ Prism reference

- Orders v2 with `intent: "AUTHORIZE"` → Payments v2 capture; holds ~29 days with a 3-day honor period; reauthorization supported.
- Sandbox `https://api-m.sandbox.paypal.com`; OAuth 2.0 `client_credentials`.
- Webhooks: Webhooks Management API or dashboard; **25 retries over 3 days**; simulator provided; verification via the `verify-webhook-signature` API call rather than a local HMAC.
- Partner Referrals API for seller onboarding; `features` must match app settings or onboarding errors.
- **POS is a different product**: Zettle / PayPal Point of Sale, separate portal, and **not supported in the US**.

**Generator relevance:** the `verify-webhook-signature` call means webhook verification is a **network operation**, not a pure function. The universal webhook interface must therefore allow an async verification strategy, not just a synchronous HMAC comparison.

**Sources:** https://developer.paypal.com/api/rest/ · https://developer.paypal.com/checkout/delay-capture · https://developer.paypal.com/api/rest/webhooks/rest/ · https://developer.zettle.com/docs/payment-integrations/overview · https://developer.paypal.com/platforms/seller-onboarding/onboarding-checklist

---

### 4.6 Adyen — ♻️ Prism reference · most spec-friendly

- Only provider publishing machine-readable **OpenAPI specs** in a public repo (`Adyen/adyen-openapi`); Checkout API v72.
- Test `https://checkout-test.adyen.com/v72/{method}`; live `https://{prefix}-checkout-live.adyenpayments.com/checkout/v72/{method}` with a per-company hex prefix.
- Idempotency documented. Server libraries for Composer, Gradle/Maven, npm, NuGet, PyPI, RubyGems.
- Terminal API implements **nexo Retailer Protocol 3.0** — a completely different protocol from Checkout, local or cloud.
- Tap to Pay via Mobile SDK; must be Terminal-API-integrated and **enabled by Adyen Support**.
- **`applicationInfo` is mandatory**, including `externalPlatform.integrator` for system integrators. A generator is effectively required to identify itself.

**Generator relevance:** best candidate for a fully spec-driven adapter. The `applicationInfo` obligation is a product requirement, not an afterthought — generated Adyen code must populate it.

**Sources:** https://docs.adyen.com/api-explorer/ · https://docs.adyen.com/development-resources/live-endpoints · https://docs.adyen.com/development-resources/libraries · https://docs.adyen.com/development-resources/webhooks · https://docs.adyen.com/development-resources/api-idempotency · https://docs.adyen.com/point-of-sale/design-your-integration/terminal-api · https://docs.adyen.com/point-of-sale/mobile-android/build/tap-to-pay · https://docs.adyen.com/partners/application-information

---

### 4.7 Braintree — ♻️ Prism reference (partial)

- **GraphQL only** for new integrations: `https://payments.braintree-api.com/graphql`; Basic auth with public:private key; mandatory `Braintree-Version` header.
- Server SDKs: Java, .NET, Node, PHP, Python, Ruby. **No public OpenAPI** — generation must rely on schema introspection.
- 60-second recommended timeout; client timeouts can orphan a successful charge, requiring a search to confirm.
- Webhooks: `bt_signature` + `bt_payload` form fields, validated by an SDK parse helper; retries hourly for 3h sandbox / 24h production; 30s response budget.
- In-Person Payments uses **Verifone** terminals with P2PE. Tap to Pay is not documented.
- Marketplace is US-only, requires special approval, and is incompatible with PayPal or recurring billing.
- Prism's Braintree connector has `scenarios: none` and no example — weaker evidence of maturity than its peers.

**Generator relevance:** the only GraphQL provider in the set, so the adapter interface must not assume REST.

**Sources:** https://developer.paypal.com/braintree/graphql/guides/making_api_calls/ · https://developer.paypal.com/braintree/docs/guides/webhooks/parse/ · https://developer.paypal.com/braintree/graphql/guides/transactions/ · https://developer.paypal.com/braintree/in-person/about/overview/ · https://developer.paypal.com/braintree/docs/guides/braintree-marketplace/overview/

---

### 4.8 Authorize.net — ♻️ Prism reference

- One API, **two payload formats** (XML and JSON); `apitest.authorize.net` / `api.authorize.net`; auth = API Login ID + Transaction Key.
- `createTransactionRequest` with `transactionType`: `authCaptureTransaction`, `authOnlyTransaction`, `priorAuthCaptureTransaction`, plus refund and void.
- Idempotency via a duplicate-window setting — **PARTIAL**, not a true idempotency key.
- Webhooks are the best-specified of the set: `X-ANET-Signature`, **HMAC-SHA512**, 10 retries (3×3min, 3×8h, 4×48h), HTTP 200 required, **endpoint auto-deactivates** after failures, `pings` endpoint to reactivate.
- SDK matrix lists Java, C#, Python, Ruby, PHP — the "Node.js" tab actually points to CyberSource, so Node support is **PARTIAL**.
- **No card-present API and no Tap to Pay.**

**Generator relevance:** the auto-deactivating endpoint is a real operational hazard the generated reconciliation guide must call out. The retry ladder must be encoded in the manifest so the UI can warn users.

**Sources:** https://developer.authorize.net/api/reference/features/webhooks.html · https://developer.authorize.net/hello_world.html · https://developer.authorize.net/api/reference/features/payment_transactions.html

---

### 4.9 Worldpay — ♻️ Prism reference · most partner-gated

- Access APIs are HATEOAS-driven with action links (`cardPayments:settle`, `:cancel`, `:refund`); Basic auth per request. Try host `https://try.access.worldpay.com`.
- **No server SDKs** — only client-side SDKs (Web JS, iOS, Android, React Native, Flutter).
- Full lifecycle verified: authorization, settle (full/partial capture), cancel (full/partial void), reversal, refunds incl. partial.
- **Webhooks are not self-service**: registration and the signature secret are provisioned by an **Implementation Manager**. Header `Event-Signature: {keyId}/{hashFunction}/{signature}`, HMAC-SHA256 over the raw body, multi-key with `keyId` selection.
- Terminals are entirely separate APIs (`tripos`, `worldpay-total-242`, `worldpay-total-hospitality`, `usecomm`, `a2t`).
- OAuth and merchant onboarding exist only in **Worldpay for Platforms**, explicitly partner-gated.
- Sandbox access is via Worldpay onboarding, not self-signup.

**Generator relevance:** effectively **not testable** without an Implementation Manager relationship. This is a scheduling blocker for G3, not just a commercial nuance.

**Sources:** https://docs.worldpay.com/apis · https://docs.worldpay.com/apis/wpg/idempotency · https://docs.rest.paymentsapi.io/ · https://docs.signup.paymentsapi.io/

---

### 4.10 Fiserv — ♻️ Prism reference (payments only)

Two distinct stacks: **Commerce Hub** and **CardPointe**.

- Commerce Hub cert host `https://connect-cert.fiservapis.com/ch/...`; per-merchant CardPointe host `<site>.cardconnect.com/cardconnect/rest/...`.
- Auth is unusual: **HMAC-SHA256 over `apiKey + clientRequestId + timestamp + rawBody`**, Base64-encoded, with a 5-minute window.
- `Client-Request-Id` doubles as the idempotency key — verified.
- Refunds cover tagged, online, open, unmatched and batch variants — the richest refund model in the set.
- Terminal APIs exist (Commerce Hub Terminal API, CardPointe Integrated Terminal API).
- **Webhooks: UNKNOWN.** No public Commerce Hub webhook/notification reference was found; notification paths 404'd. Polling/inquiry is documented.
- Sandbox is the best of the four enterprise processors: free Developer Studio account, sandbox Merchant ID, then Sandbox → End-to-end certification → Production tiers.

**Generator relevance:** **do not generate Fiserv webhook handlers yet.** The generator should emit polling-based reconciliation for Fiserv and mark webhooks `unknown` in the UI. This is a concrete case where the manifest's `unknown` state prevents shipping a guess.

**Sources:** https://developer.fiserv.com/product/CommerceHub · https://developer.fiserv.com/docs/Developer-Resources/Authentication/Authentication.mdx · https://developer.fiserv.com/docs/Payment-Operations/Manage-Payments/Refund.mdx · https://developer.fiserv.com/product/CardPointe/apis · https://developer.fiserv.com/product/CardPointe/docs/APIs/CardPointeIntegratedTerminalAPI.md

---

### 4.11 Global Payments — ♻️ Prism reference

- Sandbox `https://apis.sandbox.globalpay.com/ucp`; production `https://apis.globalpay.com/ucp`.
- Auth: `POST /ucp/accesstoken` with `app_id`, `secret`, `nonce`, `grant_type=client_credentials`; single-use bearer token; `X-GP-Version: 2021-03-22`.
- Server SDKs: Java, PHP, .NET. Client SDKs: JavaScript, Android, iOS.
- Rich operation set: sale, capture, refund, reverse (void), increment, adjust, reauth, confirm, hold/release, split.
- **Webhook signature is not HMAC**: `X-GP-Signature = SHA512(rawBody + app_key)` — a salted hash with the key appended. Functionally a keyed digest, but it must not be described as HMAC, and the verification function differs. GET webhooks hash the remaining query string + key.
- **Idempotency: UNKNOWN** — not documented.
- In-Store has Cloud / Semi-Integrated / Full-Integrated / Standalone terminal options, all separate from GP-API.
- Sandbox is self-serve via app registration; going live is separately gated.

**Generator relevance:** the non-HMAC signature scheme is exactly why the manifest cannot use a single `hmac-sha256` enum. The schema needs a `signature.scheme` discriminated union.

**Sources:** https://developer.globalpayments.com/api/access-token · https://developer.globalpayments.com/api/definitions/webhooks · https://developer.globalpayments.com/api/transactions · https://developer.globalpayments.com/docs/getting-started/register

---

### 4.12 Shift4 — ♻️ Prism reference (payments only) · lowest friction

- Gateway `https://api.shift4.com`; form-encoded bodies, JSON responses; HTTP Basic with the secret key as username and an empty password; `sk_test_` / `sk_live_` prefixes.
- `Idempotency-Key` header, 24-hour validity, `Idempotent-Replayed: true` on duplicates, POST only.
- Charges, refunds, customers, payment methods, subscriptions, events, tokens, disputes, payouts, checkout sessions and payment links are all documented.
- **Webhooks have no authentication header.** Shift4 states requests carry no auth header, so origin must be enforced by **allowlisting**. At-least-once delivery, **no idempotency key** — dedupe on session id + event type. Ack within 90s; retries at 1/2/3/8/15/30/60 min then hourly, **indefinitely**. Strictly ordered queue: one failed webhook blocks later ones.
- Partial refunds and void semantics are PARTIAL/UNKNOWN in the pages reviewed.
- Card-present is a separate Commerce Engine / UTG device integration.

**Generator relevance:** two hard security facts. First, **unsigned webhooks** — the generated handler cannot verify authenticity and must instead depend on allowlisting plus server-side status confirmation before fulfilment. Second, **head-of-line blocking** means a slow handler silently stalls all later events. Both belong in the emitted warnings and reconciliation guide.

**Sources:** https://dev.shift4.com/docs/api · https://docs.shift4.com/guides/core-concepts/checkout/confirm-payment · https://docs.shift4.com/guides/core-concepts/payment-links/get-started/api

---

## 5. Webhook scheme taxonomy

This table is the direct input to the manifest's `webhooks.signature` schema. It shows why a single generic verifier is unsafe.

| Scheme | Providers | Verification is |
|--------|-----------|-----------------|
| HMAC-SHA256 over `timestamp.body` | Stripe, Clover (Hosted Checkout) | Local, synchronous |
| HMAC-SHA256 over `key + url + body` | Square | Local, synchronous, **URL-dependent** |
| HMAC-SHA256 over raw body | Worldpay | Local, synchronous, multi-key by `keyId` |
| HMAC over a canonicalized field list | Adyen | Local, synchronous, **custom canonicalization** |
| HMAC-SHA512 | Authorize.net | Local, synchronous |
| Salted SHA-512 (`body + key`) | Global Payments | Local, synchronous, **not HMAC** |
| SDK-parsed form fields | Braintree | SDK helper |
| Remote API verification | PayPal | **Network call**, asynchronous |
| Static shared secret header | Clover (platform, legacy) | Local, **weak** |
| **No signature at all** | Shift4 | Impossible — allowlist + status re-fetch |
| Unknown | Fiserv | Cannot generate |

**Design consequence:** the manifest needs an explicit `verification` enum — `hmac_local` (with `algorithm` + a `signed_payload` template covering timestamp + body, key + URL + body, raw body, and custom canonicalization), `static_secret_header`, `remote_verify`, and `unsigned_allowlist`. A boolean `has_signature` flag cannot express this domain, and `unsigned_allowlist` must force an allowlist check plus a visible warning rather than silently passing.

---

## 6. Access friction ranking

Ordered from easiest to hardest to actually test in sandbox — which determines how fast each provider can reach G3.

| Rank | Provider | Sandbox access | Blocker to reaching G3 |
|:----:|----------|----------------|------------------------|
| 1 | Stripe | Self-serve, instant | None |
| 2 | Square | Self-serve, instant | None |
| 3 | Shift4 | Self-serve dashboard keys | None |
| 4 | Clover | Self-serve app credentials | Multiple merchant/regional hosts |
| 5 | Adyen | Test Customer Area | Terminal API needs separate enablement |
| 6 | PayPal | Auto-provisioned sandbox accounts | Business account for non-US card testing |
| 7 | Braintree | Instant sandbox | None for payments; Marketplace is gated |
| 8 | Authorize.net | Separate sandbox portal | Live needs a merchant account |
| 9 | Global Payments | Self-serve app registration | Live and terminal work need a merchant/partner |
| 10 | Fiserv | **Best-in-class** Developer Studio | Production needs certification + acquirer |
| 11 | Worldpay | **No self-signup** | Implementation Manager required even for webhook secrets |
| 12 | GoDaddy | Poynt only | No public charge API at all |

**Scheduling implication:** the MVP deliberately starts with ranks 1 and 2. Worldpay, Fiserv, Global Payments and Shift4 partner conversations should begin in Phase 1, not Phase 5 — otherwise the later phases stall on access rather than engineering.

---

## 7. Summary

| Metric | Count |
|--------|-------|
| Providers researched | 12 |
| Prism connector available as reference / oracle | **9** |
| Connectors covering the full MVP operation set | **5 of 9** |
| Connectors needing native supplements | **4** (Adyen status; Worldpay, Fiserv, Shift4 webhooks) |
| No Prism connector — native from provider docs | **2** (Square, Clover) |
| Blocked, with a named path | **1** (GoDaddy — Poynt developer program) |
| Core auth lifecycle verified | **11**; Adyen status lookup unresolved (V3) |
| Webhook signature verifiable locally | 8 |
| Webhook verification requires a network call | 1 (PayPal) |
| No webhook signature at all | 1 (Shift4) |
| Webhook contract unknown | 1 (Fiserv) |
| Webhook contract exists only via a legacy partner product | 1 (GoDaddy — Poynt) |
| Terminal API documented | 9 |
| Tap to Pay documented | 4 |
| Prism connectors that also handle webhooks | 6 of 9 |
| Providers with explicit generator permission | **0** |
| Provider agreements reviewed | **4 of 12** |
| Provider agreements still unreviewed | **8** |

---

## 8. Unresolved provider questions

These are carried forward deliberately. None is resolved by the architecture decision, and each one can invalidate a scheduling assumption.

| ID | Provider | Question | Why it matters |
|----|----------|----------|----------------|
| **V3** | Adyen | Is there a payment-status lookup, or is status webhook-only? | Determines whether `payment.status` is emittable, or must be a documented gap |
| **V4** | Fiserv | Is there a webhook/notification contract at all? | Blocks webhook generation; polling fallback only |
| **V7** | Clover | Is there a true idempotency key on any surface? | Blocks G5 (idempotency proven) |
| **V8** | Global Payments | Is there an idempotency mechanism? | Blocks G5 |
| **V9** | Braintree | Is there an idempotency mechanism, and a refund-status lookup? | Blocks G5 and refund reconciliation |
| **V10** | 8 providers | Do the unreviewed agreements permit a third-party generator? | Launch legality — 8 of 12 not yet reviewed |
| **V11** | Adyen | Does an open-source generator trigger technology-partner registration? | Affects attribution fields and possibly distribution |
| **V15** | Square, Stripe | Does a generator that ships no provider code fall inside the redistribution and "substantially similar service" clauses? | Could restrict the Square adapter and the MVP's first provider |

**Rule:** none of these may be closed by inference. They close only on a primary source — provider documentation, a written partner response, or a passing sandbox test.

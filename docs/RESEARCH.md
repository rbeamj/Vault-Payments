# Phase 0 Research — Vault-Payments

**Date:** 2026-10-21
**Status:** Complete for the questions that gate a build decision. Open items are listed explicitly in §7.
**Revision:** Phase 0.5 corrected findings 4.2, 5.1, 6.1, 6.3, 6.6 and 6.11 from primary artifacts, and added 6.12–6.13. Corrections are marked inline. See [`PHASE_0.5_FEASIBILITY.md`](PHASE_0.5_FEASIBILITY.md).

---

## 1. What this phase had to answer

1. What is the best properly licensed open-source foundation?
2. How many of the 12 target providers can reuse existing connectors?
3. Which providers require custom adapters?
4. Is a visual generator practical, or is it a wrapper around an existing platform?
5. What is the fastest path to a working prototype?
6. What licensing, security, and provider-approval obstacles stand in the way?

---

## 2. Evidence standard

The project's credibility depends on not inventing provider capabilities, so the research used a strict standard:

| Rule | Application |
|------|-------------|
| Official documentation only | Provider developer portals, not blog posts or Stack Overflow |
| Every claim gets a URL | Recorded in [`PROVIDER_MATRIX.md`](PROVIDER_MATRIX.md) |
| Absence is not support | Missing documentation → `UNKNOWN`, never inferred |
| Artifacts beat prose | Package contents were inspected where docs contradicted themselves |
| No capability is "supported" from docs | Product support requires a passing sandbox test (`MVP_PLAN.md` §1) |

The most important instance of "artifacts beat prose" is documented in §6.3: Hyperswitch Prism's own documentation claims Windows support, but its published binaries do not.

---

## 3. Method

1. **Foundation survey** — measured licenses, languages, activity, and deployment footprint directly from repositories and package registries.
2. **Connector coverage extraction** — parsed Prism's generated connector index (128 connectors, machine-readable flow lists) rather than reading marketing pages.
3. **Platform contradiction testing** — downloaded the actual npm tarball and PyPI release metadata to determine real platform support.
4. **Provider research** — official docs for each of the 12, covering API surface, operations, webhooks, terminals, sandbox access, and approval gates.
5. **Cross-verification** — pivotal claims (GoDaddy's missing API, Clover's dual webhook schemes, Shift4's authentication model, Prism's platform support) were independently re-fetched.
6. **Synthesis** — findings that changed the plan were promoted into `ARCHITECTURE_OPTIONS.md`, `SECURITY_AND_LICENSING.md`, and `MVP_PLAN.md`.

---

## 4. Foundation findings

Full analysis and scoring in [`ARCHITECTURE_OPTIONS.md`](ARCHITECTURE_OPTIONS.md). Summary of what matters:

### 4.1 Hyperswitch (full platform) is the wrong shape

Rust, Apache-2.0, 45.4k stars, 120+ processors — genuinely excellent. But its own `docker-compose.yml` defines **30 services** (Postgres, Redis standalone + cluster, Kafka, ClickHouse, OpenSearch, Grafana, Loki, Tempo, OTel, Prometheus, Vector, Superposition, four server roles, web, control center). It is a payment switch that must run in the request path, and it already ships a control center. Adopting it would make the product a UI over someone else's platform — not a generator — and would fail the "downloadable, locally runnable" requirement.

### 4.2 Prism is the connector reference — not a backend

`hyperswitch-prism` is the part worth keeping: a **stateless** unified connector library, Apache-2.0, extracted from Hyperswitch's hardened integrations, published as Node/Python/Java SDKs at version **0.6.0** (registry metadata updated 2026-10-15). It covers **128 connectors** and ships machine-readable per-connector `flows` — precisely the metadata a generator needs.

**Phase 0.5 correction.** Prism has **no code-generation mode**. Its two modes are an embedded native library and a gRPC microservice, and connector logic is compiled into roughly 489 MB of native binaries. It therefore cannot be a connector backend *for generated code*. It is retained as a **build-time specification and conformance oracle**: `callReq` / `callRes` build and parse provider HTTP messages, which lets CI diff emitted requests against Prism's. It is never a dependency of generated code, and never a runtime dependency of the generator.

### 4.3 Kill Bill is the wrong domain and the wrong coverage

Mature (production since 2010), Apache-2.0, but it is subscription billing — catalogs, plans, entitlements, invoices, dunning. Deployment is Tomcat + MySQL + Kaui. Its payment surface is Java-only plugins, and only **3 of our 12** have live plugins (Stripe, Adyen, Braintree). Worse, **`killbill-braintree` declares no license**, making it a redistribution hazard. Not adopted.

### 4.4 Gateway abstraction libraries are references, not runtimes

ActiveMerchant (Ruby, MIT) covers ~8 of 12; Omnipay and Payum (PHP, MIT) similar. All are the wrong language for the target generator, none cover Square, Clover or GoDaddy, and ActiveMerchant's last push was ~11 months before this research. Their real value is as **catalogues of provider quirks**.

### 4.5 Conclusion

No existing project is a payment-integration *generator*. The closest reusable assets are Prism (connector specifications plus an oracle seam) and OpenAPI Generator + Handlebars (emission). The generator itself must be built, and — per Phase 0.5 — it must emit native provider code rather than delegate to Prism.

---

## 5. Connector reuse findings

### 5.1 Nine of twelve have a connector; five of nine cover the MVP

Verified by parsing Prism's connector index, then confirming against full Hyperswitch, Kill Bill and ActiveMerchant:

| Outcome | Providers |
|---------|-----------|
| **Prism connector available as reference** (9) | Stripe, PayPal, Adyen, Braintree, Authorize.net, Worldpay, Fiserv, Global Payments, Shift4 |
| **No connector — native from provider docs** (2) | Square, Clover |
| **Blocked** (1) | GoDaddy Payments |

The Phase 0 phrasing "nine of twelve reuse" overstated this. Measured against the six MVP operations — authorize, capture, void, refund, status lookup, webhook handling — only **5 of 9** connectors are complete:

| Complete | Incomplete |
|----------|------------|
| Stripe, PayPal, Braintree, Authorize.net, Global Payments | Adyen (no status), Worldpay (no webhooks), Fiserv (no webhooks, contract unknown), Shift4 (no webhooks) |

Square, Clover and GoDaddy are absent from **all four** projects surveyed — including full Hyperswitch. This is the finding that rules out "build a UI over Hyperswitch": the three missing providers would require custom work regardless.

### 5.2 A connector's payment flows do not imply webhook handling

Prism exposes `handle_event` on only **39 of 128** connectors (30%). Among the nine with a connector, only six have it:

- ✅ Stripe, PayPal, Adyen, Braintree, Authorize.net, Global Payments
- ❌ Worldpay, Fiserv, Shift4

**Consequence:** Worldpay, Fiserv and Shift4 get no oracle coverage for event parsing, so their webhook handlers must be validated by sandbox fixtures alone. A generator that assumed otherwise would ship broken webhook endpoints for three providers. This directly shaped the architecture: webhook verification lives in the universal engine, driven by manifest data.

### 5.3 Connector presence ≠ connector maturity

Signals of uneven maturity: Braintree has `scenarios: none` and no example; Fiserv and Worldpay have multiple near-duplicate variants; the index contains obvious duplicate entries (`Elavon` / `Elavon Pg` / `Elavonpg`, `Absa Sanlam` / `Absasanlam`). Presence in a list is not evidence a connector has been exercised recently — hence the per-provider sandbox audit gate.

---

## 6. Findings that changed the plan

These are the discoveries that altered the design, not merely populated it.

### 6.1 Square, Clover and GoDaddy are absent everywhere

**Changed:** the product cannot be a wrapper, and native emission is mandatory for these three. Phase 0.5 later extended native emission to all twelve. → `ARCHITECTURE_OPTIONS.md` §5.

### 6.2 GoDaddy Payments has no public charge API

The developer platform exposes Auctions, Commerce, Domains, Email, Hosting, Shopping. There is no endpoint to create an authorization or capture, and no API to create a merchant account or store. Only the GoDaddy-owned **Poynt** API offers a full transaction matrix, and it is partner-gated.

**Changed:** the milestone is **11 adapters + 1 blocked provider**, not 12 claimed integrations. The status is `blocked`, not `unsupported`, because a named path exists: the **Poynt developer program** — an approval-gated platform requiring a partner agreement and app review, and a different product from the GoDaddy Payments Commerce API. It is not scheduled. → `MVP_PLAN.md` §7.

### 6.3 Prism cannot emit source, and cannot ship portably

Two separate discoveries, both from artifacts rather than documentation.

**No codegen mode.** Prism ships an embedded native library and a gRPC service. There is no mode that writes provider integration source. "Prism SDK generation" produces client bindings *to its own binaries*.

**No portable artifact.**

| Source | Claim |
|--------|-------|
| Product docs | macOS arm64 + Linux x86_64 |
| Prism README | Also macOS x64 and Windows x64 |
| **PyPI wheels** | `macosx_11_0_arm64`, `manylinux_2_39_x86_64`, `manylinux_2_39_aarch64` — no `win_amd64`, no Intel-macOS, no sdist |
| **npm tarball** | `darwin-arm64/*.dylib`, `linux-arm64/*.so`, `linux-x64/*.so` — no `.dll`, no `darwin-x64` |
| **ELF symbol versions** | maximum `GLIBC_2.38` — excludes Ubuntu 22.04, Debian 12, RHEL 9, Amazon Linux 2023, and musl entirely |
| **Footprint** | 107.7 MB tarball; **489 MB** unpacked native libraries |

**Changed:** the architecture moved from "Prism as one of two adapter strategies" to **native emission only**, with Prism as an optional build-time oracle. → `ARCHITECTURE_OPTIONS.md` §5, `PHASE_0.5_FEASIBILITY.md` §4–5.

### 6.4 Prism has zero terminal flows

All **30** distinct flows are online (authorize, capture, refund, void, recurring, disputes, events…). None are terminal, POS, reader or card-present.

**Changed:** terminals are a separate epic, not a capability flag. → `MVP_PLAN.md` §6.

### 6.5 Terminal support genuinely does not follow processor support

- 9 of 12 have some physical-terminal API.
- Only **4** document Tap to Pay (Stripe, Square, Adyen, Clover).
- **5** are `UNKNOWN`; **Authorize.net has neither**.

**Changed:** the capability matrix models terminal and Tap to Pay as independent per-provider fields, and the UI never derives one from the other.

### 6.6 Webhook verification is at least ten different mechanisms

Verified schemes include HMAC-SHA256 over `timestamp.body`, HMAC over `key + URL + body`, HMAC over raw body with multi-key `keyId`, HMAC over a canonicalized field list (Adyen), HMAC-SHA512, salted SHA-512 (not HMAC), SDK-parsed form fields, a remote verification API, a static shared secret, and **no signature at all**.

**Changed:** `webhooks.signature` is a discriminated union, and the manifest carries an explicit `verification` enum — `hmac_local` (parameterised by algorithm and signed-payload template), `static_secret_header`, `remote_verify`, `unsigned_allowlist`. A boolean `has_signature` cannot express this. → `PROVIDER_MATRIX.md` §5.

### 6.7 Shift4 webhooks are unsigned

Shift4 explicitly states requests carry no authentication header. Delivery is at-least-once with no idempotency key, and the queue is strictly ordered — one failed webhook blocks all later ones.

**Changed:** the "verify or reject" rule needs a documented exception path. For Shift4 the generator must emit allowlisting **plus** a server-side status confirmation before fulfilment, and warn about head-of-line blocking. → `SECURITY_AND_LICENSING.md` §1.5.

### 6.8 Clover is two products with two security models

Clover's Hosted Checkout webhooks use `Clover-Signature` HMAC-SHA256. Its older platform webhooks use a static `X-Clover-Auth` shared secret that is **not** HMAC. Its Ecommerce production host is not published in the spec, and idempotency is undocumented.

**Changed:** "one provider = one manifest" is false. The schema must allow per-surface webhook schemes and per-surface warnings. → `PROVIDER_MATRIX.md` §4.3.

### 6.9 Fiserv's webhook contract could not be found

No public Commerce Hub webhook/notification reference was located; notification paths 404'd. Polling is documented.

**Changed:** the generator must be able to emit **polling-based reconciliation** and mark webhooks `unknown` for a provider. This is the first concrete proof that the `unknown` state is load-bearing, not decorative.

### 6.10 Kill Bill cannot be the foundation

3 of 12 providers, Java-only plugins, subscription-billing semantics, and one plugin with no license.

**Changed:** the foundation decision shifted entirely to Prism as a component rather than any platform as a base.

### 6.11 No provider explicitly permits third-party generators

Phase 0.5 reviewed **4 of the 12** agreements in detail; the other 8 remain unread (several Clover legal pages are JavaScript-only and return no text). **None grants permission**, and four contain clauses that matter:

- **Square Developer Terms §2** prohibits redistributing Developer Tools and prohibits a service substantially the same as Square's. §1 requires OAuth for seller-scoped content and PCI DSS compliance.
- **Stripe**'s Terminal SDK is MIT, but §2.2 restricts its use outside Stripe Terminal Products and Services and forbids copyleft.
- **PayPal Developer Agreement §9.1.1** forbids renting, leasing, or otherwise transferring rights in the software to a third party.
- **Adyen**'s mandatory `applicationInfo` (`externalPlatform.name` / `merchantApplication.name`, or `externalPlatform.integrator`) effectively requires the generator to identify itself.

**Changed:** the mitigation is architectural, not legal — the generator **never vendors a provider SDK**, emits direct HTTPS calls, and declares any SDK as an ordinary dependency. This remains a **launch gate**, not a Phase 0 blocker. Written confirmation is still required before commercial launch. → `SECURITY_AND_LICENSING.md` §2.3, V10 / V11 / V15.

### 6.12 Adyen's status model is not a lookup

Prism's `adyen` connector exposes 17 flows but **no `get`**. Adyen's Checkout integration reports outcomes through webhooks, so `payment.status` may not exist as a direct lookup. The matrix's earlier `VERIFIED` was not supported by provider documentation and has been corrected to `UNKNOWN` (V3).

**Changed:** "status lookup" is not assumed to be available for every provider. `payment.status` may be `unknown` in a manifest, and the generator must be able to emit webhook-driven status instead.

### 6.13 A brand is not a connector

Worldpay maps to 4 Prism connectors, Fiserv to 3, and Global Payments to 4 — 17 connectors for 9 brands. The variants are different products (Commerce Hub vs CardPointe; GP-API vs Heartland vs Realex) and are not interchangeable.

**Changed:** each manifest pins an **exact connector variant** and records which product the adapter targets. "Worldpay support" is not a meaningful claim until the variant is named.

---

## 7. Unknowns register

Known gaps, with how each gets closed. Nothing in this list may be silently assumed.

| ID | Unknown | Impact | How to close |
|----|---------|--------|--------------|
| U1 | ~~Does a Windows Prism artifact exist?~~ **Resolved: no.** Whether one is planned remains open, but no longer matters | Not architectural — Prism is not shipped | Watch npm/PyPI releases |
| U2 | Is there a supported Prism gRPC container image? | Oracle CI setup burden | Check Prism repo/releases |
| U3 | Do provider terms permit third-party generators? (all 12) | Launch legality | Written confirmation; **4 reviewed, 8 open** → V10 / V15 |
| U4 | Fiserv webhook contract | Blocks webhook generation | Fiserv developer support → V4 |
| U5 | Shift4 void semantics and partial-refund support | Incomplete adapter | Sandbox test |
| U6 | Tap to Pay for Braintree, Worldpay, Fiserv, Global Payments, Shift4 | Terminal roadmap | Vendor confirmation |
| U7 | Clover Ecommerce production host | Blocks production config | Clover developer support |
| U8 | Clover idempotency | Duplicate-charge risk | Sandbox experiment; assume absent → V7 |
| U9 | Global Payments idempotency | Duplicate-charge risk | Sandbox experiment → V8 |
| U10 | Braintree idempotency | Duplicate-charge risk | Sandbox experiment → V9 |
| U11 | Does GoDaddy expose payment APIs to partners? | Reachability of the 12th provider | Partner enquiry; **Poynt is the named route** |
| U12 | Which Prism connectors have been recently sandbox-tested? | Oracle confidence | Per-provider probe + sandbox run |
| U13 | Adyen `applicationInfo` exact requirements for a generator | Generated Adyen code may be rejected | Adyen partner docs → V11 |
| U14 | Adyen payment-status lookup | `payment.status` may be unemittable | Adyen API reference → V3 |
| U15 | Does Square Developer Terms §2 reach a generator that ships no Square code? | Could restrict the whole Square adapter | Legal review → V15 |

---

## 8. What this research deliberately did not do

- **No production credentials were used.** No live merchant accounts were touched.
- **No payment transactions were created**, in sandbox or otherwise.
- **No provider dashboards, webhooks, or settings were modified.**
- **No Beams Vault changes** were made.
- **Nothing was pushed, merged, or deployed.**

---

## 9. Source index

Foundation and tooling:

- https://github.com/juspay/hyperswitch
- https://github.com/juspay/hyperswitch-prism
- https://docs.hyperswitch.io/integrations/prism/prism.md
- https://docs.hyperswitch.io/integrations/prism/architecture/specs-and-dsl.md
- https://registry.npmjs.org/hyperswitch-prism
- https://pypi.org/pypi/hyperswitch-prism/json
- https://github.com/killbill/killbill
- https://github.com/activemerchant/active_merchant
- https://github.com/thephpleague/omnipay
- https://github.com/Payum/Payum
- https://github.com/OpenAPITools/openapi-generator
- https://github.com/handlebars-lang/handlebars.js

Phase 0.5 artifact evidence (measurements and method in [`PHASE_0.5_FEASIBILITY.md`](PHASE_0.5_FEASIBILITY.md) §2):

- https://registry.npmjs.org/hyperswitch-prism — tarball file tree, `package.json`, FFI loader
- https://pypi.org/pypi/hyperswitch-prism/json — wheel platform tags
- https://github.com/juspay/hyperswitch-prism — `LICENSE`, README platform claims
- https://github.com/juspay/hyperswitch-prism/releases — release assets
- `libconnector_service_ffi.so` symbol-version scan — glibc floor
- Provider agreement captures reviewed during Phase 0.5: Square Developer Terms, Stripe Services Agreement, PayPal Developer Agreement, Adyen Terms & Conditions

Provider documentation sources are listed per provider in [`PROVIDER_MATRIX.md`](PROVIDER_MATRIX.md) §4.

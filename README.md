# `cloud-itonami/business-edge`

**No code in this repository runs anything at the edge.** There is no WASM
runtime, no HTTP server, no KV store, no CDN upload, no metering collector and no
billing. What is here is the *record layer* for an edge platform: eleven
functions that write and read four AT Protocol collections describing components,
custom domains, API-key metadata and daily usage totals.

The name reads like a product. The product is not in this repo — and, as far as
the west manifest knows, not anywhere yet (§*The gap* below). If you arrived here
expecting a deployable control plane, that expectation is the first thing to
correct.

| you want to… | go to |
|---|---|
| record that component `c1` v3 exists, is `active`, and lives at `bafy…` | **here** |
| seal per-tenant metering so the substrate cannot read it | **here** (E2E path) |
| actually execute a WASM component on request | not in this repo, and no `edge-runtime` repo exists in `manifest/west.yml` (4,167 projects, checked 2026-08-12) |
| run a functional-organism runtime on the kotoba stack | `kotoba-lang/kotodama`, `kotoba-lang/kotodama-host` |
| upload the `.wasm` to B2 / serve it from a CDN | stays etzhayyim, by design — see the split below |
| charge a tenant money | stays etzhayyim (merchant-of-record). No plan, tier or quota code exists here; the words appear only in comments |

---

## The one design decision worth knowing

Records are split across **two planes with different confidentiality**, and this
split is the reason the repo exists (ADR-2605181100, ADR-2606011400):

| plane | collections | written via | who can read |
|---|---|---|---|
| **plaintext** | `…businessEdge.component`, `…businessEdge.customDomain` | `sdk.write` / `sdk.read` | anyone with the PDS — this is a *public* catalogue |
| **E2E-sealed** | `…businessEdge.apiKey`, `…businessEdge.usageDaily` (as `innerType` inside `com.etzhayyim.encrypted.record`) | `sdk.encryptedWrite` / `encryptedRead` | only DIDs holding a read-cap (owner + explicit `recipients`) |

Two fields are **deliberately absent** from the plaintext records, and their
absence is load-bearing rather than an oversight. Both exist in
`proto/v1/business_edge.proto` and neither is carried here:

- `Component.env` (`map<string, string>`, proto field 7) — config/secret injection
  stays etzhayyim.
- `CustomDomain.verification_token` (proto field 4) — domain-ownership secret
  stays etzhayyim.

Conversely `ApiKeyBody.keyHash` is **added** by this layer: the proto's `ApiKey`
message has no hash field at all (it exposes only `key_prefix` to clients), so
the salted hash exists solely inside the encrypted envelope. The raw key is never
here in any form.

The read-cap is real and you can watch it work — §5 of the quickstart flips the
caller DID over one store and shows the same call returning two keys, then zero,
then one.

## The gap between `AGENTS.md` and this code

`AGENTS.md` describes a deployed system: four XRPC services, a `blkchn`-style
Worker, an appview, plan tiers with prices, a seven-step deploy flow ending in
`edge-runtime` lazy-loading the component. **Almost none of that is in this
repository**, and the parts that are use different names. Measured, not guessed:

| `AGENTS.md` says | in this repo |
|---|---|
| 4 XRPC services / 27 RPCs (`proto/v1/business_edge.proto`) | 11 exported functions. They cover the *record* side of component deploy/get/list, custom-domain add/list, API-key create/list/get and usage reporting — and nothing else. No RPC is served; nothing generates from the proto |
| 7 W-Protocol tables | 4 collections (`edge_tenants`, `edge_component_versions`, `edge_usage_events` have no representation) |
| 5 lexicons, e.g. `com.etzhayyim.edge.component.deploy` | **0 of the 5 appear anywhere in the code.** The NSIDs actually used are `com.etzhayyim.apps.businessEdge.{component,customDomain,apiKey,usageDaily}` |
| KV namespace/key ops, deployments, request logs, metrics, quota | no code, no records |
| Plan tiers Free / Pro (¥2000) / Enterprise | no plan, tier or quota code |
| `did:web:business-edge.etzhayyim.com` | **NXDOMAIN** (checked against 1.1.1.1, 2026-08-12). Every DID this code mints is well-formed and unresolvable |

Two consequences follow directly from row 2, and they are behaviours rather than
missing features:

1. **A component's version cannot advance.** `registerComponent` returns
   `alreadyExists` for a `componentId` that is already present, and there is no
   version collection, so recording v2 of `c1` is impossible. The rollback RPC in
   the proto has nothing to roll back to.
2. **`tenantId` is free text with no referent.** There is no tenant collection,
   so `tenantId: "never-registered"` writes successfully. The only foreign key in
   the repo is customDomain → component, enforced by an `exists()` read.

`MIGRATION-TODO.md` is the other half of this picture: the repo was copied out of
`etzhayyim/root` on 2026-05-21 as a `TRANSFORM` seed and the codemod is still
listed as pending. Its own scan found none of the violations it was filed for.

## What is actually in here

Sixteen tracked files, 75,562 bytes — of which **13 files / 47,957 bytes are the
repository proper** and the other three are this README, the quickstart, and a
one-line `.gitignore`.

```
AGENTS.md                            the system the project intends (see the gap above)
MIGRATION-TODO.md                    extraction status: TRANSFORM, codemod pending
NOTICE                               Apache-2.0 + etzhayyim Charter Rider v3.1
README.edn / migration.edn           extraction provenance from etzhayyim/root
proto/v1/business_edge.proto         27 RPCs across 4 services — the intended wire surface
kotoba/src/types.ts                  record shapes, NSIDs, validators, rkey/DID derivation
kotoba/src/registry.ts               all the behaviour — 11 functions
kotoba/src/index.ts                  barrel
kotoba/test/business-edge.test.ts    7 tests
kotoba/package.json  tsconfig.json  vitest.config.ts
docs/operator-quickstart.md          this repository, walked end to end
```

Read `types.ts` first; once the four record shapes are in your head, `registry.ts`
reads itself.

## Running it

[`docs/operator-quickstart.md`](docs/operator-quickstart.md) walks the whole
repository end to end. Every command in it was executed on 2026-08-12 and the
output shown is the output that came back. It also records four behaviours that
will mislead you if nobody says them out loud:

- distinct `componentId`s **silently collide** — `c_1`, `c/1` and `C-1` all write
  to rkey `comp-c-1`, and every non-ASCII id collapses to `comp-`;
- re-recording an existing `keyId` or `(componentId, date)` **overwrites with no
  warning** and returns `"recorded"` — unlike the plaintext writers, the two E2E
  writers have no `alreadyExists` guard;
- `total` means two different things in the same file: the plaintext `list*`
  functions filter one page (so `listComponents({tenantId})` can return **0 while
  three match**), while the E2E `list*` functions scan the whole collection;
- `coverage` — the function you would reach for to get a true count — **loses one
  row per 100-row page boundary and reports `truncated: false`** on the mock every
  test in this repo runs against. 101 rows count as 100.

The last one is a cursor-contract bug in `@etzhayyim/sdk-mock`, not in this repo's
code, but it means no count above 100 from the test suite can be trusted.

Nothing here has ever been pointed at a live Personal Data Server.

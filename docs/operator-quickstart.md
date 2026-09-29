# Operator quickstart — `cloud-itonami/business-edge`

Every command below was run end to end on **2026-08-11 (UTC; 2026-08-12 JST)**
against commit `6b160b7` on `main`, on macOS 26.3.1 / arm64 with Node v26.3.0 and
npm 11.16.0. The output shown is the output that came back. Where something
surprised me it is written down rather than smoothed over — §6, §7 and §8 are
three behaviours you will hit in production if nobody tells you about them, and
§9 lists what this document does **not** claim to have done.

Read [`../README.md`](../README.md) first. The short version: this repo is the
record layer for an edge platform, it executes nothing, and the deployed system
its `AGENTS.md` describes does not exist.

- §1–§2 need **nothing installed** — not even Node.
- §3–§8 need **Node ≥ 20 and npm**, ~311 MB of disk, and network access to
  github.com.

Timings are from an M-series Mac. Treat them as an order of magnitude.

---

## §1 Read the whole repository without installing anything

At `6b160b7` there were thirteen tracked files. That is not a subset — it was
everything.

```bash
git ls-files -z | xargs -0 wc -c
```

```
    3573 AGENTS.md
    2114 MIGRATION-TODO.md
     534 NOTICE
     208 README.edn
    1142 kotoba/package.json
     622 kotoba/src/index.ts
   13300 kotoba/src/registry.ts
    9293 kotoba/src/types.ts
    6834 kotoba/test/business-edge.test.ts
     290 kotoba/tsconfig.json
     142 kotoba/vitest.config.ts
     421 migration.edn
    9484 proto/v1/business_edge.proto
   47957 total
```

**Your run will show sixteen files and 75,562 bytes**, because the commit that
added this document also added `README.md`, `docs/operator-quickstart.md` and
`.gitignore` — 27,605 bytes of prose and one line of ignore rule. No code changed;
the thirteen above are still the whole of the repository's behaviour.

Three files carry all the meaning:

| file | what it decides |
|---|---|
| `kotoba/src/types.ts` | the four record shapes, the NSIDs, the validators, and how rkeys and DIDs are derived |
| `kotoba/src/registry.ts` | the only behaviour in the repo — eleven functions |
| `proto/v1/business_edge.proto` | the *intended* wire surface: 27 RPCs across 4 services, most with no implementation here |

The proto is worth ten minutes even though nothing consumes it, because it is the
only place the full intended product is written down:

```bash
awk '/^service /{svc=$2} /rpc /{print svc" :: "$0}' proto/v1/business_edge.proto | wc -l
```

```
      27
```

## §2 Check the extraction record — still no dependencies

This repository was cut out of `etzhayyim/root`. The record of that cut is
`migration.edn`, a single 421-byte line (line-wrapped here for reading; the file
has no newlines inside it):

```clojure
{:schema "etzhayyim.migration/extracted-v1"
 :source {:repo "etzhayyim/root"
          :path "60-apps/etzhayyim-project-business-edge"
          :revision "1fb8430a66cbb4680f053fa5185a08a2904cae0d"
          :git-tree "25ad6186b661bde43ed38ed35d7a0578ad63696b"
          :tracked-files 11 :bytes 47328}
 :destination {:repo "etzhayyim/com-etzhayyim-app-business-edge"}
 :status :extracted :canonical-record-format :edn
 :go-files-created 0 :tinygo-files-created 0}
```

Two things look wrong here and neither is:

- **11 files / 47,328 bytes vs today's 13 / 47,957.** The difference is exactly
  `README.edn` (208) + `migration.edn` (421) = 629 bytes. The record counts what
  it moved, before adding itself to the destination.
- **`:destination` names `etzhayyim/com-etzhayyim-app-business-edge`.** The repo
  has since moved to `cloud-itonami/business-edge`; GitHub still redirects the old
  path, so the record resolves. Stale, not broken.

`README.edn` (208 bytes) is the same kind of artefact — an extraction manifest,
not documentation. It is *not* a machine-readable version of this file.

## §3 Install

```bash
cd kotoba
npm install
```

```
added 135 packages in 4m
```

**3m35s** cold on a warm npm cache, and `node_modules` lands at **311 MB** — for
a 32 KB source tree. That is `@etzhayyim/sdk` pulling `@atproto/*`, `viem`,
`@signalapp/libsignal-client` and friends, none of which the eleven functions in
this repo exercise.

Two things to know before you start it:

- **Budget more than five minutes.** My first attempt died under a 300-second
  timeout mid-way through a git-dependency `prepare: tsc` step, and the resulting
  error (`npm error git dep preparation failed / signal SIGTERM`) reads like a
  broken dependency rather than a clock. It is a clock.
- **You do not need SSH access to GitHub.** npm rewrites the eight git-sourced
  packages to `ssh://git@github.com/…` URLs and warns
  `skipping integrity check for git dependency` about each one, which looks like
  it will demand a key. All eight repos are public and npm fetches them fine.

Warnings you will see and can ignore for this workflow:

- `npm warn allow-scripts 8 packages have install scripts not yet covered` — the
  `@etzhayyim/*` packages declare `prepare: tsc`. §4 and §5 pass anyway, because
  vitest and `tsc` both consume the SDK's TypeScript sources directly rather than
  a built `dist/`.
- `npm warn gitignore-fallback No .npmignore file found` — cosmetic.

**`node_modules/` was not gitignored before this commit**, so after installing,
`git status` showed 311 MB staged for your next `git add .`:

```
?? kotoba/node_modules/
?? kotoba/package-lock.json
```

A `.gitignore` covering `node_modules/` ships alongside this document, so the
311 MB will no longer follow you into a commit.

**`package-lock.json` is left untracked and un-ignored**, which is the state I
found and not a decision I made — so `git add -A` will still stage an 80 KB
generated lockfile from your machine. Whether this repo should carry a lockfile is
a real open question: the two `@etzhayyim/*` dependencies are pinned to exact
commits in `package.json`, so the parts that matter are stable, but the ~130
transitive packages below them float per install. Until someone decides, stage
explicitly rather than with `-A`.

**If you skip this step**, §4 fails like this, which is easy to misread as a
broken repo:

```
> vitest run
sh: vitest: command not found
```

## §4 Run the tests

```bash
npm test
```

```
 RUN  v4.1.10 /private/tmp/maturity-business-edge/kotoba

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  299ms (transform 64ms, setup 0ms, import 82ms, tests 9ms, environment 0ms)
```

Seven tests, all green, in under a third of a second. They run against
`MockEtzhayyim` from `@etzhayyim/sdk-mock` — an in-memory PDS. **No network, no
live PDS, no WASM.**

What they cover: component register / dedup / validation / get / list-filter;
customDomain FK enforcement and dedup; apiKey seal-and-round-trip through the E2E
envelope; the read-cap negative case; usageDaily integer validation; and the
`coverage` rollup. What they do not cover is everything in §6–§8.

```bash
npm run typecheck
```

Exit 0, no diagnostics. `strict: true`, `noEmit: true` — this is a type-checked
source package, not a build. Note `tsconfig.json` has `"include": ["src/**/*.ts"]`,
so **the test file is not typechecked**; vitest transpiles it without checking.

## §5 Watch the read-cap actually work

`MockEtzhayyim.did` is a public mutable field, which lets you read one store as
several identities — the only way to exercise read-cap here, because each mock
instance owns a private store (§6). Create `test/scratch.test.ts`:

```ts
import { it } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import { registerComponent, listComponents, recordApiKey, listApiKeys,
         recordUsageDaily, listUsageDaily, coverage } from "../src/index.js";

const OWNER = "did:web:business-edge.etzhayyim.com";
const OUTSIDER = "did:web:outsider.example";
const PARTNER = "did:web:partner.example";

it("read-cap over one store", async () => {
  const e: any = new MockEtzhayyim({ did: OWNER });
  await registerComponent(e, { componentId: "c1", tenantId: "t1", name: "api", version: 1, wasmCid: "bafy1" });
  await recordApiKey(e, { keyId: "k1", tenantId: "t1", name: "ci", keyHash: "sha256:secret", keyPrefix: "be_" });
  await recordApiKey(e, { keyId: "k2", tenantId: "t1", name: "shared", keyHash: "sha256:shared", keyPrefix: "be_",
                          recipients: [PARTNER] });
  await recordUsageDaily(e, { componentId: "c1", tenantId: "t1", date: "2026-08-12",
                              requests: 7, kvReads: 0, kvWrites: 0, storageBytes: 0, computeMs: 0 });

  const view = async (label: string) => console.log(
    `${label.padEnd(30)} components=${(await listComponents(e)).total}` +
    ` apiKeys=${(await listApiKeys(e)).total}` +
    ` keyNames=${JSON.stringify((await listApiKeys(e)).items.map((k: any) => k.name))}` +
    ` usage=${(await listUsageDaily(e)).total}`);

  await view("as owner");
  e.did = OUTSIDER; await view("as outsider");
  e.did = PARTNER;  await view("as partner (recipient of k2)");
  e.did = OUTSIDER; console.log("outsider coverage ->", JSON.stringify(await coverage(e)));
});
```

**The `--disable-console-intercept` flag is not optional** — without it vitest
swallows every `console.log` on a passing test and you get a green tick with no
output, which looks like your code never ran:

```bash
npx vitest run test/scratch.test.ts --disable-console-intercept
```

```
as owner                       components=1 apiKeys=2 keyNames=["ci","shared"] usage=1
as outsider                    components=1 apiKeys=0 keyNames=[] usage=0
as partner (recipient of k2)   components=1 apiKeys=1 keyNames=["shared"] usage=0
outsider coverage -> {"componentCount":1,"customDomainCount":0,"apiKeyCount":0,"usageDailyCount":0,"componentsByStatus":{"deploying":1},"truncated":false}
```

That is the whole design in four lines:

- **the plaintext catalogue is public** — the outsider reads `components=1`, and its
  `coverage` still reports the component. If you put anything confidential in a
  component record, everyone has it. That is why `env` is excluded.
- **the sealed records are not** — the outsider gets `apiKeys=0`, `usage=0`, and
  zeroes for both in `coverage`.
- **`recipients` is per-record and grants exactly what it names** — the partner sees
  `shared` and not `ci`, and `usage=0` because `usageDaily` was written with no
  `recipients`. Read-cap is not a role you hold over a tenant; it is a list on each
  envelope.
- **the writer is always on that list** — the mock adds `this.did` unless you pass
  `wrapToSelf: false`, which is why the owner sees all three sealed records.

Delete `test/scratch.test.ts` when you are done — `npm test` picks up anything
matching `test/**/*.test.ts`.

## §6 Distinct `componentId`s silently collide

`componentRkey` slugifies (`toLowerCase`, non-alphanumerics → `-`, trim hyphens)
but `componentDidFor` only lowercases. So the rkey — which is the identity the
store actually uses — throws away information the DID keeps:

```
id="c_1"    rkey="comp-c-1"     did=…:comp:c_1
id="c/1"    rkey="comp-c-1"     did=…:comp:c/1
id="C-1"    rkey="comp-c-1"     did=…:comp:c-1
id="c 1"    rkey="comp-c-1"     did=…:comp:c 1
id="c--1"   rkey="comp-c-1"     did=…:comp:c--1
id="日本"    rkey="comp-"        did=…:comp:日本
```

Register two of them and the second is refused as a duplicate of the first — with
the *first* record's DID, under the caller's own id:

```
register c_1 -> { status: 'registered',   did: '…:comp:c_1', componentId: 'c_1' }
register c/1 -> { status: 'alreadyExists', did: '…:comp:c_1', componentId: 'c/1' }
get c/1      -> {"did":"…:comp:c_1","componentId":"c_1","tenantId":"t1","name":"one",…}
rows         -> 1
```

`getComponent({componentId: "c/1"})` returns **somebody else's record** and
nothing in the return value says so. Consequences:

- **every non-ASCII id maps to `comp-`**, so `日本`, `한국`, `🌸`, `"  "` and `"___"`
  are all one component. Confirmed: registering `日本` then `한국` yields
  `alreadyExists` with `…:comp:日本` and one row.
- an `alreadyExists` response is **not** proof that the caller previously
  registered that id.
- the DID is not a key. Two records can never share an rkey but two ids can, so
  DIDs are strictly finer-grained than storage. Do not use the DID to look
  anything up.

Until this is fixed, constrain ids to `[a-z0-9-]+` upstream. `usageDailyRkey`
slugifies the same way (`usageDailyRkey("c 1", "2026-08-12")` → `"usage-c-1-2026-08-12"`),
so the same rule applies there.

## §7 The two E2E writers overwrite without warning

`registerComponent` and `registerCustomDomain` read before writing and return
`alreadyExists`. `recordApiKey` and `recordUsageDaily` **do not** — they compute an
rkey and call `encryptedWrite`, and the mock's write is documented as
"idempotent … overwrite the previous value":

```
usage rows after 2 writes to same (component,date) -> 1 [ 2000 ]
apiKey rows after 2 writes to same keyId          -> 1 [ [ 'second', 'h2', 't9' ] ]
getApiKey k1 returns -> second
```

Both writes returned `status: "recorded"`. Read that carefully:

- **a metering job that runs twice does not double-count — it replaces.** Second
  write wins (2000, not 1000 and not 3000). Whether that is what you want depends
  on whether your collector emits deltas or totals, and nothing in the API tells
  you which it assumes.
- **re-recording an existing `keyId` destroys the previous key's hash with no
  trace, and can move it to a different tenant.** `k1` went from
  `(ci, h1, t1)` to `(second, h2, t9)` in one call. If you intend rotation, mint
  a new `keyId`; if you intend revocation, note that there is no revoke here at
  all (the proto has `RevokeApiKey`; this repo does not).

Also unvalidated on these two paths:

```
usage date='nonsense' -> {"status":"recorded","uri":"…/usage-c-nonsense",…}
apiKey expiresAt past -> {"status":"recorded",…}
```

`date` is typed `/** ISO date YYYY-MM-DD. */` and enforced nowhere, so a typo
quietly becomes its own day-row. An `expiresAt` in 1999 is accepted without
comment. The metering *integers* are checked (`-1` and `1.5` both give
`invalidMetering`), and so is component `version` (`0`, `1.5` and `"1"` all give
`invalidVersion`) — the validation that exists is narrow, not absent.

There is no tenant collection, so there is no tenant FK:

```
unknown tenant (no FK) -> {"status":"registered","did":"…:comp:ok1","componentId":"ok1"}
```

## §8 `total` means two different things, and `coverage` under-counts

### The plaintext `list*` functions filter *after* paging

`listComponents` and `listCustomDomains` read **one page** and filter it in
memory. They do not search the collection. Insert 60 components for tenant
`bulk`, then 3 for tenant `wanted`, and ask for `wanted`:

```
listComponents tenant=wanted default(50) -> 0 cursor: comp-bulk-1050
listComponents tenant=wanted limit=200   -> 3 [ 'late-a', 'late-b', 'late-c' ]
listComponents page2 via cursor          -> 3 [ 'late-a', 'late-b', 'late-c' ]
listUsageDaily tenant=wanted default(50) -> 3 [ 'late-a', 'late-b', 'late-c' ]
```

**Line 1 returns zero while three match.** The default page of 50 was all `bulk`
rows and the filter had nothing to keep. Line 4 is the same query against the E2E
path and it is correct, because `scanUsageDaily` / `scanApiKeys` page the whole
collection before filtering. Two `list*` families in one file, opposite semantics
for the same field name:

- for plaintext, `total` is *this page after filtering* — never a count of matches.
- an empty `items` with a defined `cursor` means **keep going**, not "no results".
  Only `cursor === undefined` means the end.
- `limit` caps the raw read (max 200), not the filtered result, so raising it makes
  filters *appear* to start working. That is collection size, not a fix.

### `coverage` loses one row per page boundary and says it did not

`coverage` is the function that pages everything, so it is the one you would trust
for a real count. On this mock it is wrong above 100 rows:

```
rows=99   e.count=99   coverage=99   lost=0 truncated=false
rows=100  e.count=100  coverage=100  lost=0 truncated=false
rows=101  e.count=101  coverage=100  lost=1 truncated=false
rows=150  e.count=150  coverage=149  lost=1 truncated=false
rows=201  e.count=201  coverage=200  lost=1 truncated=false
rows=250  e.count=250  coverage=248  lost=2 truncated=false
rows=301  e.count=301  coverage=299  lost=2 truncated=false
```

`e.count(collection)` is the mock's own ground truth, so the rows are there and
`coverage` cannot see them — while reporting `truncated: false`.

**This is a cursor-contract bug in `@etzhayyim/sdk-mock`, not in this repo.** The
mock's `read` documents its cursor as "the rkey of the last item in the previous
page" and then returns `all[startIdx + limit]` — the *first item of the next*
page — while the cursor consumer starts at `sortedIdx + 1`. The record the cursor
names is skipped. Every paginated read through this mock drops one row per
boundary; `coverage` merely makes it visible. Until it is fixed, **no count above
100 from this test suite is trustworthy**, and that includes any test you write.

### `truncated` is a false alarm as often as a warning

```
maxScan=3       componentCount=5   truncated=true   (actual rows = 5)
maxScan=5       componentCount=5   truncated=true   (actual rows = 5)
maxScan=6       componentCount=5   truncated=false  (actual rows = 5)
maxScan=10      componentCount=100 truncated=true   (actual rows = 250)
maxScan=150     componentCount=200 truncated=true   (actual rows = 250)
```

Two separate effects:

- the flag is `count >= maxScan`, so a **complete** scan of exactly `maxScan` rows
  reports `truncated: true` (rows 1–2 above are complete and flagged).
- `maxScan` is checked once per *page*, not per row, so it bounds work only to
  100-row granularity — `maxScan: 10` still fetched a full page of 100.

`maxScan` is also clamped: `Math.min(input.maxScan ?? 10_000, 10_000)`, so
`999999` scans to 10,000, not to a million. Treat `truncated: true` as "maybe" and
`truncated: false` as "maybe" too.

## §9 What this document does not claim

- **Nothing here has touched a real PDS.** Every result above came from
  `MockEtzhayyim`, an in-memory double whose store is **private per instance** —
  two mocks with the same DID share nothing (`instance A: 1 component / instance B
  (same DID): 0`). Latency, real cursor semantics, auth, rate limits and
  partial-write behaviour on a live server are all unobserved. In particular the
  repo's own test `enforces read-cap: a non-recipient DID cannot decrypt the key`
  constructs a second mock and asserts it sees zero keys — which it would do even
  with no read-cap logic at all. §5 is the version of that test that proves
  something.
- **The DIDs cannot be resolved.** `business-edge.etzhayyim.com` is NXDOMAIN
  (checked against 1.1.1.1; `etzhayyim.com` itself resolves). Every
  `did:web:business-edge.etzhayyim.com:*` string above is well-formed and
  unresolvable.
- **Nothing in the proto was exercised**, because no code generates or serves it.
  I read it; I did not run it.
- **The XRPC services, Worker, appview, W-Protocol stream, `edge-runtime` data
  plane and plan-tier billing in `AGENTS.md` were not exercised, because no code
  for them is in this repository.** I checked that no repo named `edge-runtime`
  exists in `manifest/west.yml` (4,167 projects); I did not search GitHub at large.
- **I did not run this on Linux or Windows**, and tested no Node version other
  than v26.3.0.
- **The read-then-write in `registerComponent` / `registerCustomDomain` is not
  atomic** — two concurrent registrations of one id could both see "not present".
  I reasoned that from the source; I did not build a race, and the single-threaded
  mock would not have shown one.
- **No performance claim.** 311 MB and 3m35s are one machine, one cold install,
  once.

import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  registerComponent,
  getComponent,
  listComponents,
  registerCustomDomain,
  listCustomDomains,
  recordApiKey,
  listApiKeys,
  getApiKey,
  recordUsageDaily,
  listUsageDaily,
  coverage,
} from "../src/index.js";

const OWNER = "did:web:business-edge.etzhayyim.com";

describe("business-edge kotoba (kotoba-E2E split)", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: OWNER });
  });

  describe("component (PLAINTEXT public catalog)", () => {
    it("registers, dedups, validates, gets, lists/filters", async () => {
      expect((await registerComponent(e, { componentId: "c1", tenantId: "t1", name: "api", version: 1, wasmCid: "bafy1" })).status).toBe("registered");
      expect((await registerComponent(e, { componentId: "c1", tenantId: "t1", name: "api", version: 1, wasmCid: "bafy1" })).status).toBe("alreadyExists");
      expect((await registerComponent(e, { componentId: "cX", tenantId: "t", name: "n", version: 0, wasmCid: "z" })).status).toBe("rejected"); // version<1
      expect((await registerComponent(e, { componentId: "cY", tenantId: "t", name: "n", version: 1, wasmCid: "z", status: "bogus" as any })).status).toBe("rejected");
      await registerComponent(e, { componentId: "c2", tenantId: "t2", name: "edge", version: 3, wasmCid: "bafy2", status: "active" });
      const got = await getComponent(e, { componentId: "c2" });
      expect(got.component?.version).toBe(3);
      expect(got.component?.status).toBe("active");
      expect((await getComponent(e, { componentId: "nope" })).error).toBe("notFound");
      expect((await listComponents(e)).total).toBe(2);
      expect((await listComponents(e, { tenantId: "t1" })).total).toBe(1);
      expect((await listComponents(e, { status: "active" })).total).toBe(1);
    });
  });

  describe("customDomain (PLAINTEXT, FK → component via exists())", () => {
    it("enforces FK, dedups, lists/filters", async () => {
      // FK fails when the component does not exist.
      expect((await registerCustomDomain(e, { domain: "x.dev", componentId: "ghost" })).status).toBe("rejected");
      await registerComponent(e, { componentId: "c1", tenantId: "t1", name: "api", version: 1, wasmCid: "bafy1" });
      expect((await registerCustomDomain(e, { domain: "api.dev", componentId: "c1", status: "verified", verifiedAt: "2026-06-03T00:00:00Z" })).status).toBe("registered");
      expect((await registerCustomDomain(e, { domain: "api.dev", componentId: "c1" })).status).toBe("alreadyExists");
      await registerComponent(e, { componentId: "c2", tenantId: "t2", name: "edge", version: 1, wasmCid: "bafy2" });
      await registerCustomDomain(e, { domain: "edge.dev", componentId: "c2" });
      expect((await listCustomDomains(e)).total).toBe(2);
      expect((await listCustomDomains(e, { componentId: "c1" })).total).toBe(1);
      expect((await listCustomDomains(e, { status: "verified" })).total).toBe(1);
    });
  });

  describe("apiKey (E2E-ENCRYPTED confidential credential metadata)", () => {
    it("seals via encryptedWrite, round-trips via encryptedRead, validates", async () => {
      const ok = await recordApiKey(e, { keyId: "k1", tenantId: "t1", name: "ci", keyHash: "sha256:abc", keyPrefix: "be_live_", permissions: ["deploy"] });
      expect(ok.status).toBe("recorded");
      expect(ok.keyWrapId).toBeTruthy();
      expect((await recordApiKey(e, { keyId: "", tenantId: "t", name: "n", keyHash: "h", keyPrefix: "p" })).status).toBe("rejected");
      const got = await getApiKey(e, { keyId: "k1" });
      expect(got.apiKey?.keyHash).toBe("sha256:abc");
      expect(got.apiKey?.permissions).toEqual(["deploy"]);
      expect((await getApiKey(e, { keyId: "nope" })).error).toBe("notFound");
      await recordApiKey(e, { keyId: "k2", tenantId: "t2", name: "prod", keyHash: "sha256:def", keyPrefix: "be_live_" });
      expect((await listApiKeys(e)).total).toBe(2);
      expect((await listApiKeys(e, { tenantId: "t1" })).total).toBe(1);
    });

    it("enforces read-cap: a non-recipient DID cannot decrypt the key", async () => {
      await recordApiKey(e, { keyId: "k1", tenantId: "t1", name: "ci", keyHash: "sha256:abc", keyPrefix: "be_" });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listApiKeys(outsider)).total).toBe(0);
    });

    it("grants read-cap to an explicit recipient", async () => {
      const partner = "did:web:partner.example";
      const r = await recordApiKey(e, { keyId: "k1", tenantId: "t1", name: "ci", keyHash: "h", keyPrefix: "be_", recipients: [partner] });
      expect(r.status).toBe("recorded");
      expect((await listApiKeys(e)).total).toBe(1);
    });
  });

  describe("usageDaily (E2E-ENCRYPTED per-tenant metering)", () => {
    it("seals metering, round-trips, validates integers, filters", async () => {
      const ok = await recordUsageDaily(e, { componentId: "c1", tenantId: "t1", date: "2026-06-03", requests: 1000, kvReads: 50, kvWrites: 10, storageBytes: 2048, computeMs: 320 });
      expect(ok.status).toBe("recorded");
      expect((await recordUsageDaily(e, { componentId: "c1", tenantId: "t1", date: "2026-06-04", requests: -1, kvReads: 0, kvWrites: 0, storageBytes: 0, computeMs: 0 })).status).toBe("rejected");
      await recordUsageDaily(e, { componentId: "c2", tenantId: "t2", date: "2026-06-03", requests: 5, kvReads: 0, kvWrites: 0, storageBytes: 0, computeMs: 1 });
      expect((await listUsageDaily(e)).total).toBe(2);
      expect((await listUsageDaily(e, { componentId: "c1" })).total).toBe(1);
      expect((await listUsageDaily(e, { tenantId: "t2" })).total).toBe(1);
    });
  });

  describe("coverage rollup", () => {
    it("counts plaintext catalog + E2E confidential collections", async () => {
      await registerComponent(e, { componentId: "c1", tenantId: "t1", name: "api", version: 1, wasmCid: "bafy1", status: "active" });
      await registerComponent(e, { componentId: "c2", tenantId: "t1", name: "edge", version: 1, wasmCid: "bafy2", status: "deploying" });
      await registerCustomDomain(e, { domain: "api.dev", componentId: "c1" });
      await recordApiKey(e, { keyId: "k1", tenantId: "t1", name: "ci", keyHash: "h", keyPrefix: "be_" });
      await recordUsageDaily(e, { componentId: "c1", tenantId: "t1", date: "2026-06-03", requests: 1, kvReads: 0, kvWrites: 0, storageBytes: 0, computeMs: 0 });
      const cov = await coverage(e);
      expect(cov.componentCount).toBe(2);
      expect(cov.customDomainCount).toBe(1);
      expect(cov.apiKeyCount).toBe(1);
      expect(cov.usageDailyCount).toBe(1);
      expect(cov.componentsByStatus?.active).toBe(1);
      expect(cov.componentsByStatus?.deploying).toBe(1);
    });
  });
});

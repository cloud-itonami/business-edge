/**
 * business-edge kotoba — registry. kotoba-E2E split.
 *
 * Plaintext path (component, customDomain): sdk.write / sdk.read — public
 * control-plane catalog with NO secret values. customDomain FK → component
 * enforced via exists().
 * E2E path (apiKey, usageDaily): sdk.encryptedWrite / sdk.encryptedRead —
 * confidential body sealed in the kotoba envelope (ADR-2605181100), read-cap =
 * owner DID. The substrate never sees key_hash / per-tenant metering in plaintext.
 *
 * WASM execution, secret/env custody, raw_key + verificationToken issuance, CDN
 * upload, fiat plan settlement, and quota enforcement stay etzhayyim (consent-cap).
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  API_KEY_INNER_TYPE,
  COMPONENT_COLLECTION,
  CUSTOM_DOMAIN_COLLECTION,
  USAGE_DAILY_INNER_TYPE,
  apiKeyRkey,
  componentDidFor,
  componentRkey,
  domainDidFor,
  domainRkey,
  isComponentStatus,
  isDomainStatus,
  isPositiveInt,
  isUint,
  usageDailyRkey,
  type ApiKeyBody,
  type ApiKeyView,
  type ComponentRecord,
  type ComponentView,
  type CoverageInput,
  type CoverageOutput,
  type CustomDomainRecord,
  type CustomDomainView,
  type GetApiKeyInput,
  type GetApiKeyOutput,
  type GetComponentInput,
  type GetComponentOutput,
  type ListApiKeysInput,
  type ListApiKeysOutput,
  type ListComponentsInput,
  type ListComponentsOutput,
  type ListCustomDomainsInput,
  type ListCustomDomainsOutput,
  type ListUsageDailyInput,
  type ListUsageDailyOutput,
  type RecordApiKeyInput,
  type RecordApiKeyOutput,
  type RecordUsageDailyInput,
  type RecordUsageDailyOutput,
  type RegisterComponentInput,
  type RegisterComponentOutput,
  type RegisterCustomDomainInput,
  type RegisterCustomDomainOutput,
  type UsageDailyBody,
  type UsageDailyView,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

// ─── Component (PLAINTEXT) ──────────────────────────────────────────

export async function registerComponent(e: Etzhayyim, input: RegisterComponentInput): Promise<RegisterComponentOutput> {
  if (!input.componentId || !input.tenantId || !input.name || !input.wasmCid) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isPositiveInt(input.version)) return { status: "rejected", error: "invalidVersion" };
  if (input.status !== undefined && !isComponentStatus(input.status)) return { status: "rejected", error: "invalidStatus" };
  const rkey = componentRkey(input.componentId);
  const existing = await e
    .read<ComponentRecord>({ collection: COMPONENT_COLLECTION, rkey })
    .catch(() => ({ records: [] as Array<{ uri: string; value: ComponentRecord }> }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", componentUri: existing.records[0].uri, did: existing.records[0].value.did, componentId: input.componentId };
  }
  const now = new Date().toISOString();
  const did = componentDidFor(input.componentId);
  const record: ComponentRecord = {
    did,
    componentId: input.componentId,
    tenantId: input.tenantId,
    name: input.name,
    version: input.version,
    wasmCid: input.wasmCid,
    routes: input.routes ?? [],
    status: input.status ?? "deploying",
    createdAt: now,
  };
  const receipt = await e.write({ collection: COMPONENT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", componentUri: receipt.uri, did, componentId: input.componentId };
}

export async function getComponent(e: Etzhayyim, input: GetComponentInput): Promise<GetComponentOutput> {
  if (!input.componentId) return { error: "invalidComponentId" };
  const resp = await e
    .read<ComponentRecord>({ collection: COMPONENT_COLLECTION, rkey: componentRkey(input.componentId) })
    .catch(() => ({ records: [] as Array<{ uri: string; value: ComponentRecord }> }));
  const r = resp.records[0];
  if (!r?.value) return { error: "notFound" };
  return { component: { ...r.value, componentUri: r.uri } };
}

async function componentExists(e: Etzhayyim, componentId: string): Promise<boolean> {
  const resp = await e
    .read<ComponentRecord>({ collection: COMPONENT_COLLECTION, rkey: componentRkey(componentId) })
    .catch(() => ({ records: [] as Array<{ uri: string; value: ComponentRecord }> }));
  return Boolean(resp.records[0]?.value);
}

export async function listComponents(e: Etzhayyim, input: ListComponentsInput = {}): Promise<ListComponentsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ComponentRecord>({ collection: COMPONENT_COLLECTION, cursor: input.cursor, limit });
  const items: ComponentView[] = resp.records
    .filter((r) => (!input.tenantId || r.value.tenantId === input.tenantId) && (!input.status || r.value.status === input.status))
    .map((r) => ({ ...r.value, componentUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Custom domain (PLAINTEXT, FK → component via exists()) ──────────

export async function registerCustomDomain(e: Etzhayyim, input: RegisterCustomDomainInput): Promise<RegisterCustomDomainOutput> {
  if (!input.domain || !input.componentId) return { status: "rejected", error: "missingRequiredFields" };
  if (input.status !== undefined && !isDomainStatus(input.status)) return { status: "rejected", error: "invalidStatus" };
  // FK integrity: the target component must already exist.
  if (!(await componentExists(e, input.componentId))) return { status: "rejected", error: "componentNotFound" };
  const rkey = domainRkey(input.domain);
  const existing = await e
    .read<CustomDomainRecord>({ collection: CUSTOM_DOMAIN_COLLECTION, rkey })
    .catch(() => ({ records: [] as Array<{ uri: string; value: CustomDomainRecord }> }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", domainUri: existing.records[0].uri, did: existing.records[0].value.did, domain: input.domain };
  }
  const now = new Date().toISOString();
  const did = domainDidFor(input.domain);
  const record: CustomDomainRecord = {
    did,
    domain: input.domain,
    componentId: input.componentId,
    status: input.status ?? "pending",
    ...(input.verifiedAt ? { verifiedAt: input.verifiedAt } : {}),
    createdAt: now,
  };
  const receipt = await e.write({ collection: CUSTOM_DOMAIN_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", domainUri: receipt.uri, did, domain: input.domain };
}

export async function listCustomDomains(e: Etzhayyim, input: ListCustomDomainsInput = {}): Promise<ListCustomDomainsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<CustomDomainRecord>({ collection: CUSTOM_DOMAIN_COLLECTION, cursor: input.cursor, limit });
  const items: CustomDomainView[] = resp.records
    .filter((r) => (!input.componentId || r.value.componentId === input.componentId) && (!input.status || r.value.status === input.status))
    .map((r) => ({ ...r.value, domainUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── API key (E2E-ENCRYPTED) ────────────────────────────────────────

export async function recordApiKey(e: Etzhayyim, input: RecordApiKeyInput): Promise<RecordApiKeyOutput> {
  if (!input.keyId || !input.tenantId || !input.name || !input.keyHash || !input.keyPrefix) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const body: ApiKeyBody = {
    keyId: input.keyId,
    tenantId: input.tenantId,
    name: input.name,
    keyHash: input.keyHash,
    keyPrefix: input.keyPrefix,
    permissions: input.permissions ?? [],
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: API_KEY_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: apiKeyRkey(input.keyId),
  });
  return { status: "recorded", uri: receipt.uri, keyWrapId: receipt.keyId, keyId: input.keyId };
}

async function scanApiKeys(e: Etzhayyim, maxScan: number): Promise<ApiKeyView[]> {
  const out: ApiKeyView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<ApiKeyBody>({ innerType: API_KEY_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      out.push({ ...r.value, uri: r.uri, sender: r.sender, envelopeCreatedAt: r.createdAt });
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listApiKeys(e: Etzhayyim, input: ListApiKeysInput = {}): Promise<ListApiKeysOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanApiKeys(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((k) => !input.tenantId || k.tenantId === input.tenantId);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getApiKey(e: Etzhayyim, input: GetApiKeyInput): Promise<GetApiKeyOutput> {
  if (!input.keyId) return { error: "invalidKeyId" };
  const all = await scanApiKeys(e, DEFAULT_MAX_SCAN);
  const found = all.find((k) => k.keyId === input.keyId);
  if (!found) return { error: "notFound" };
  return { apiKey: found };
}

// ─── Usage daily (E2E-ENCRYPTED, per-tenant metering) ───────────────

export async function recordUsageDaily(e: Etzhayyim, input: RecordUsageDailyInput): Promise<RecordUsageDailyOutput> {
  if (!input.componentId || !input.tenantId || !input.date) return { status: "rejected", error: "missingRequiredFields" };
  for (const v of [input.requests, input.kvReads, input.kvWrites, input.storageBytes, input.computeMs]) {
    if (!isUint(v)) return { status: "rejected", error: "invalidMetering" };
  }
  const body: UsageDailyBody = {
    componentId: input.componentId,
    tenantId: input.tenantId,
    date: input.date,
    requests: input.requests,
    kvReads: input.kvReads,
    kvWrites: input.kvWrites,
    storageBytes: input.storageBytes,
    computeMs: input.computeMs,
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: USAGE_DAILY_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: usageDailyRkey(input.componentId, input.date),
  });
  return { status: "recorded", uri: receipt.uri, keyWrapId: receipt.keyId };
}

async function scanUsageDaily(e: Etzhayyim, maxScan: number): Promise<UsageDailyView[]> {
  const out: UsageDailyView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<UsageDailyBody>({ innerType: USAGE_DAILY_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      out.push({ ...r.value, uri: r.uri, sender: r.sender, envelopeCreatedAt: r.createdAt });
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listUsageDaily(e: Etzhayyim, input: ListUsageDailyInput = {}): Promise<ListUsageDailyOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanUsageDaily(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter(
    (u) => (!input.componentId || u.componentId === input.componentId) && (!input.tenantId || u.tenantId === input.tenantId),
  );
  return { items: filtered.slice(0, limit), total: filtered.length };
}

// ─── Coverage rollup (countAll across plaintext + E2E) ──────────────

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  const componentsByStatus: Record<string, number> = {};
  let componentCount = 0;
  let compCursor: string | undefined;
  while (componentCount < maxScan) {
    const page = await e.read<ComponentRecord>({ collection: COMPONENT_COLLECTION, cursor: compCursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      componentsByStatus[r.value.status] = (componentsByStatus[r.value.status] ?? 0) + 1;
      componentCount += 1;
    }
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    compCursor = page.cursor;
  }
  let customDomainCount = 0;
  let domCursor: string | undefined;
  while (customDomainCount < maxScan) {
    const page = await e.read<CustomDomainRecord>({ collection: CUSTOM_DOMAIN_COLLECTION, cursor: domCursor, limit: PAGE_LIMIT });
    customDomainCount += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    domCursor = page.cursor;
  }
  const apiKeyCount = (await scanApiKeys(e, maxScan)).length;
  const usageDailyCount = (await scanUsageDaily(e, maxScan)).length;
  return {
    componentCount,
    customDomainCount,
    apiKeyCount,
    usageDailyCount,
    componentsByStatus,
    truncated:
      componentCount >= maxScan || customDomainCount >= maxScan || apiKeyCount >= maxScan || usageDailyCount >= maxScan,
  };
}

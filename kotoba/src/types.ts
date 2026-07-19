/**
 * business-edge kotoba — developer edge-compute control-plane, kotoba-E2E split.
 *
 * Per ADR-2606011400 (Consensys product-front / infra-back) + ADR-2605172400
 * (3-axis split) + ADR-2605181100 (kotoba E2E encrypted-record envelope). Founder
 * directive 2026-06-03: PII / CUI / confidential migrate to etzhayyim when made
 * safe via kotoba E2E.
 *
 * SPLIT (real data surface from proto/v1/business_edge.proto + CLAUDE.md):
 *   PUBLIC (plaintext AT records) — control-plane catalog with NO secret values:
 *     - component: deployed edge component metadata (name/version/wasmCid/routes/
 *       status). `env` (config/secret map) is EXCLUDED — secret custody stays etzhayyim.
 *     - customDomain: DNS-public custom-domain binding (FK → component via exists()).
 *       `verificationToken` is EXCLUDED — domain-ownership secret stays etzhayyim.
 *   SENSITIVE / confidential (kotoba E2E, com.etzhayyim.encrypted.record) —
 *     - apiKey: key_hash + permissions + expiry (credential metadata). Sealed via
 *       sdk.encryptedWrite, read-cap = owner DID. Substrate never sees key_hash plain.
 *     - usageDaily: per-tenant metering (requests/kvReads/kvWrites/storageBytes/
 *       computeMs) — confidential per-tenant business billing data, E2E.
 *
 *   STAYS etzhayyim (NOT a collection — consumed via consent-capability):
 *     - WASM component EXECUTION on edge-runtime (compute inference act).
 *     - env / secret injection + API-key custody (the raw_key + signing/validation).
 *     - customDomain verificationToken issuance + DNS-challenge verification.
 *     - CDN/B2 wasm upload execution.
 *     - Pro/Enterprise fiat plan settlement (merchant-of-record).
 *     - quota enforcement / throttling (blocking action).
 *   Only the regulated EXECUTION stays etzhayyim; the resulting DATA records migrate.
 *
 * AT-Lexicon: no float. Counts/byte-sizes/ms are integers (int64 → number, JS-safe
 * domain). No decimals in any migrated field.
 */

// ─── NSIDs ──────────────────────────────────────────────────────────
// Plaintext public collections.
export const COMPONENT_COLLECTION = "com.etzhayyim.apps.businessEdge.component";
export const CUSTOM_DOMAIN_COLLECTION = "com.etzhayyim.apps.businessEdge.customDomain";
// E2E inner-type NSIDs (body shape inside the encrypted envelope).
export const API_KEY_INNER_TYPE = "com.etzhayyim.apps.businessEdge.apiKey";
export const USAGE_DAILY_INNER_TYPE = "com.etzhayyim.apps.businessEdge.usageDaily";

export const EDGE_DID_PREFIX = "did:web:business-edge.etzhayyim.com:" as const;

export type ComponentStatus = "deploying" | "active" | "stopped" | "failed";
export type DomainStatus = "pending" | "verified" | "failed";
export const COMPONENT_STATUSES: readonly ComponentStatus[] = ["deploying", "active", "stopped", "failed"];
export const DOMAIN_STATUSES: readonly DomainStatus[] = ["pending", "verified", "failed"];

// ─── Component (PLAINTEXT, public catalog — NO env/secrets) ──────────

export interface ComponentRecord {
  did: string;
  componentId: string;
  tenantId: string;
  name: string;
  /** integer >= 1. */
  version: number;
  wasmCid: string;
  routes: string[];
  status: ComponentStatus;
  createdAt: string;
}
export interface ComponentView extends ComponentRecord {
  componentUri: string;
}
export interface RegisterComponentInput {
  componentId: string;
  tenantId: string;
  name: string;
  version: number;
  wasmCid: string;
  routes?: string[];
  status?: ComponentStatus;
}
export interface RegisterComponentOutput {
  status: "registered" | "alreadyExists" | "rejected";
  componentUri?: string;
  did?: string;
  componentId?: string;
  error?: string;
}
export interface GetComponentInput {
  componentId: string;
}
export interface GetComponentOutput {
  component?: ComponentView;
  error?: string;
}
export interface ListComponentsInput {
  tenantId?: string;
  status?: ComponentStatus;
  limit?: number;
  cursor?: string;
}
export interface ListComponentsOutput {
  items: ComponentView[];
  cursor?: string;
  total: number;
}

// ─── Custom domain (PLAINTEXT, DNS-public — NO verificationToken) ────

export interface CustomDomainRecord {
  did: string;
  domain: string;
  componentId: string;
  status: DomainStatus;
  verifiedAt?: string;
  createdAt: string;
}
export interface CustomDomainView extends CustomDomainRecord {
  domainUri: string;
}
export interface RegisterCustomDomainInput {
  domain: string;
  componentId: string;
  status?: DomainStatus;
  verifiedAt?: string;
}
export interface RegisterCustomDomainOutput {
  status: "registered" | "alreadyExists" | "rejected";
  domainUri?: string;
  did?: string;
  domain?: string;
  error?: string;
}
export interface ListCustomDomainsInput {
  componentId?: string;
  status?: DomainStatus;
  limit?: number;
  cursor?: string;
}
export interface ListCustomDomainsOutput {
  items: CustomDomainView[];
  cursor?: string;
  total: number;
}

// ─── API key (E2E-ENCRYPTED, confidential credential metadata) ───────

export interface ApiKeyBody {
  keyId: string;
  tenantId: string;
  name: string;
  /** Salted hash — never the raw key (raw_key custody stays etzhayyim). */
  keyHash: string;
  keyPrefix: string;
  permissions: string[];
  expiresAt?: string;
  createdAt: string;
}
export interface ApiKeyView extends ApiKeyBody {
  uri: string;
  sender: string;
  envelopeCreatedAt: string;
}
export interface RecordApiKeyInput {
  keyId: string;
  tenantId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions?: string[];
  expiresAt?: string;
  /** Extra DIDs to grant read-cap (owner always included). */
  recipients?: string[];
}
export interface RecordApiKeyOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyWrapId?: string;
  keyId?: string;
  error?: string;
}
export interface ListApiKeysInput {
  tenantId?: string;
  limit?: number;
  cursor?: string;
}
export interface ListApiKeysOutput {
  items: ApiKeyView[];
  cursor?: string;
  total: number;
}
export interface GetApiKeyInput {
  keyId: string;
}
export interface GetApiKeyOutput {
  apiKey?: ApiKeyView;
  error?: string;
}

// ─── Usage daily (E2E-ENCRYPTED, confidential per-tenant metering) ───

export interface UsageDailyBody {
  componentId: string;
  tenantId: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** integers >= 0. */
  requests: number;
  kvReads: number;
  kvWrites: number;
  storageBytes: number;
  computeMs: number;
}
export interface UsageDailyView extends UsageDailyBody {
  uri: string;
  sender: string;
  envelopeCreatedAt: string;
}
export interface RecordUsageDailyInput {
  componentId: string;
  tenantId: string;
  date: string;
  requests: number;
  kvReads: number;
  kvWrites: number;
  storageBytes: number;
  computeMs: number;
  recipients?: string[];
}
export interface RecordUsageDailyOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyWrapId?: string;
  error?: string;
}
export interface ListUsageDailyInput {
  componentId?: string;
  tenantId?: string;
  limit?: number;
  cursor?: string;
}
export interface ListUsageDailyOutput {
  items: UsageDailyView[];
  cursor?: string;
  total: number;
}

// ─── Coverage rollup ────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  componentCount?: number;
  customDomainCount?: number;
  apiKeyCount?: number;
  usageDailyCount?: number;
  componentsByStatus?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

export function isUint(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}
export function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1;
}
export function isComponentStatus(s: unknown): s is ComponentStatus {
  return typeof s === "string" && (COMPONENT_STATUSES as readonly string[]).includes(s);
}
export function isDomainStatus(s: unknown): s is DomainStatus {
  return typeof s === "string" && (DOMAIN_STATUSES as readonly string[]).includes(s);
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function componentDidFor(id: string): string {
  return `${EDGE_DID_PREFIX}comp:${id.toLowerCase()}`;
}
export function componentRkey(id: string): string {
  return `comp-${slug(id)}`;
}
export function domainDidFor(domain: string): string {
  return `${EDGE_DID_PREFIX}dom:${domain.toLowerCase()}`;
}
export function domainRkey(domain: string): string {
  return `dom-${slug(domain)}`;
}
export function apiKeyRkey(id: string): string {
  return `apikey-${slug(id)}`;
}
export function usageDailyRkey(componentId: string, date: string): string {
  return `usage-${slug(componentId)}-${slug(date)}`;
}

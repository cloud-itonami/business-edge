/**
 * business-edge kotoba — barrel. kotoba-E2E split (ADR-2605181100):
 * public control-plane catalog (component + customDomain) plaintext;
 * confidential credential metadata (apiKey) + per-tenant metering (usageDaily)
 * sealed via kotoba E2E. WASM execution / secret custody / fiat settlement /
 * quota enforcement stay etzhayyim via consent-capability.
 */
export * from "./types.js";
export {
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
} from "./registry.js";

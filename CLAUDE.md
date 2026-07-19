# etzhayyim-project-business-edge

開発者向けエッジコンピューティングプラットフォーム。`business-edge.etzhayyim.com`

kotodama の全プリミティブ（KV, Graph, CDN, PubSub, Lock, Secrets, VirtualActor）をテナント分離で外部提供する管理プレーン App。

## App Identity

| Key | Value |
|---|---|
| nanoid | `bz4x8m2w` |
| domain | `business-edge.etzhayyim.com` |
| performer ID | `bz4x8m2w` |
| AT bot DID | `did:web:business-edge.etzhayyim.com` |

## Architecture: Control Plane / Data Plane

- **Control Plane**: この App (`business-edge.etzhayyim.com`) — テナント管理、デプロイ、メタリング
- **Data Plane**: `edge-runtime` (kotodama-server multi-tenant Deployment) — テナント WASM 実行

## XRPC Services

| Service | Path | 用途 |
|---|---|---|
| `ComponentCommandService` | Command | Deploy/Delete/Rollback コンポーネント |
| `KvCommandService` | Command | KV namespace/key 操作 |
| `TenantCommandService` | Command | テナント設定、API キー、カスタムドメイン |
| `BusinessEdgeQueryService` | Query | 全 read 操作 (components, usage, keys, metrics) |

## AT Protocol Lexicon

| Lexicon | 用途 |
|---|---|
| `com.etzhayyim.edge.component.deploy` | デプロイコマンド |
| `com.etzhayyim.edge.component.delete` | 削除コマンド |
| `com.etzhayyim.edge.component.rollback` | ロールバックコマンド |
| `com.etzhayyim.edge.tenant.configure` | テナント設定変更 |
| `com.etzhayyim.edge.usage.report` | 日次使用量レポート |

## Data Model

### W Protocol Event Stream Records (全 WRecord kind RLS: org_id, user_id, actor_id)

| Table | Key | 用途 |
|---|---|---|
| `edge_tenants` | `tenant_id` | テナント登録 (plan_tier, status, custom_domains_json) |
| `edge_components` | `component_id` | コンポーネント登録 (name, version, wasm_cid, routes_json, env_json) |
| `edge_component_versions` | `component_id, version` | バージョン履歴 (rollback 用) |
| `edge_api_keys` | `key_id` | API キー (key_hash, permissions_json, expires_at) |
| `edge_usage_events` | `event_id` | 使用量イベント (component_id, event_type, quantity) |
| `edge_usage_daily` | `component_id, date` | 日次ロールアップ (requests, kv_reads, kv_writes, storage_bytes, compute_ms) |
| `edge_custom_domains` | `domain` | カスタムドメイン (component_id, status, verified_at) |

### SQL Graph

```sql
(:EdgeTenant {id, org_id, plan})-[:OWNS]->(:EdgeComponent {id, name, version})
(:EdgeComponent)-[:DEPLOYED_VERSION]->(:ComponentVersion {version, wasm_cid})
(:EdgeComponent)-[:ROUTES_TO]->(:CustomDomain {domain, status})
```

## Plan Tiers

| Tier | Requests/day | KV ops/day | Storage | Components | Custom Domains | Price |
|---|---|---|---|---|---|---|
| Free | 100K | 10K | 1GB | 3 | 0 | 0 |
| Pro | 10M | 1M | 50GB | 50 | 5 | 2000 |
| Enterprise | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Custom |

## Deploy Flow

1. `DeployComponent(wasm_bytes, name, routes, env)` via XRPC
2. WASM binary validation (Component Model magic bytes)
3. `kotodama.CdnUpload("edge/components/{org_id}/{component_id}/{version}.wasm")` → B2
4. Lance `edge_components` + `edge_component_versions` write
5. Graph `MERGE (t)-[:OWNS]->(c)-[:DEPLOYED_VERSION]->(v)`
6. AT Record `com.etzhayyim.edge.component.deploy` publish
7. edge-runtime ComponentRegistry lazy-loads on next request

## Use-When-Needed Policy

このファイルは `etzhayyim-project-business-edge` 配下を変更するときのみ参照する。

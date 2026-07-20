# Raw flows without Loki (Phase 1)

## Operator → console ConfigMap keys

The operator should inject the following into the console plugin config (same YAML as
`config/sample-config.yaml` top-level keys):

```yaml
# Hot tier: one hop to FLP Service (peer fan-in is FLP-side)
flowBuffer:
  enable: true
  url: http://flowlogs-pipeline.<ns>.svc:9200
  timeout: 2s

# Cold tier: Hive Parquet on S3/MinIO (optional)
s3:
  enable: true
  endpoint: https://minio.example:9000
  bucket: netobserv-flows
  prefix: ""                 # optional before cluster_id=
  account: production-cluster
  region: us-east-1
  skipTls: false
  maxObjects: 75             # cap objects per query (newest first); prevents OOM
  accessKeyPath: /var/s3-creds/accessKey
  secretKeyPath: /var/s3-creds/secretKey
```

CRD mapping (operator-owned, not in this repo):

| Console config | FlowCollector |
|---|---|
| `flowBuffer.*` | `spec.processor.flowBuffer` + reconciled Service URL |
| `s3.*` | `spec.consolePlugin.s3` + first `exporters[].type: S3` connection/secret |

Frontend receives `dataSources: ["flp"]` and/or `["s3"]` plus `flowBufferOnly: true` when
only the buffer backs raw flows. The datasource dropdown exposes Loki, Prometheus, S3, and Auto
when the corresponding backends are configured.

Default FLP flowBuffer listen port is **`:9200`**.

## FLP HTTP contract (source of truth)

Cluster endpoint (console → FLP Service, one hop):

```
GET|POST {flowBuffer.url}/api/flowbuffer/flows
  ?start=<unix ms or RFC3339>
  &end=<unix ms or RFC3339>
  &limit=<n>
  &filter.<Field>=value   # repeatable
```

POST JSON body (optional alternative):

```json
{ "start": 1710000000000, "end": 1710000300000, "limit": 100,
  "filters": { "SrcK8S_Namespace": ["foo"] } }
```

Local peer endpoint (FLP internal only — console must not call this):

```
GET|POST /api/flowbuffer/local/flows
```

Response:

```json
{
  "flows": [ { "...enriched GenericMap..." } ],
  "oldestTimestamp": 1710000000000,
  "newestTimestamp": 1710000300000,
  "size": 12345,
  "capacity": 50000,
  "truncated": false,
  "peersQueried": 3,
  "peersFailed": 1,
  "warnings": [{ "code": "PEER_QUERY_FAILED", "peer": "http://...", "message": "..." }]
}
```

Console maps each GenericMap to a Loki-style stream entry (`TimeFlowEndMs` → timestamp,
JSON line → `Record.fields`). Coverage uses `oldestTimestamp` / `newestTimestamp` /
`truncated` for S3 fallback and `RAW_FLOWS_BUFFER_ONLY`. FLP `PEER_QUERY_FAILED`
warnings are forwarded in the AggregatedQueryResponse.

## Query routing

Dropdown / `dataSource` query param:

| Mode | Behavior |
|---|---|
| `auto` (Loki off) | flowBuffer first, then S3 for uncovered range |
| `s3` | S3-primary for the full range; still merge flowBuffer tip if enabled |
| `loki` | Loki when enabled |
| `prom` | Prometheus (metrics tabs) |

With Loki off and Auto:

1. One hop to `GET /api/flowbuffer/flows`
2. If not satisfied and `s3.enable` → MinIO/Parquet with Hive hour partition prune
3. Merge flp + s3 with StreamMerger exact-record dedupe (timestamp + line)
4. If not satisfied and no S3 → partial results + `warnings[{code: RAW_FLOWS_BUFFER_ONLY}]`
   and `stats.truncated: true`, `stats.dataSources: ["flp"]`

## DuckDB vs parquet-go

Phase 1 uses **pure-Go** `minio-go` + `parquet-go` (no CGO) for multi-arch images.
`pkg/s3query.Querier` is the seam for a future DuckDB backend once packaging is solved.

## Local test sketch

1. Run FLP with flowBuffer exposing `/api/flowbuffer/flows` on `:9200`
2. Point console config:

```yaml
loki: {}   # empty / no url
flowBuffer:
  enable: true
  url: http://localhost:9200
```

3. `make build-backend` and start plugin; open Network Traffic → table
4. Widen time range beyond buffer window → banner + per-query warning
5. With MinIO + Hive Parquet under `cluster_id=/year=/month=/day=/hour=/`, enable `s3`
   and confirm `dataSources` includes `flp` and `s3` without duplicate rows

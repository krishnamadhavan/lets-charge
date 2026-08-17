# Week-1 bring-up — CitrineOS + OCPP 1.6

Date: 2026-08-16. Sibling clone: `~/Documents/xAI/citrineos-core` @ `61622a0` (`v2.0.0-beta3`). Published images: `ghcr.io/citrineos/citrineos-server:latest` + operator-ui.

This file records **facts** from a live lab. It does not change product locks in [`v1-design.md`](v1-design.md).

## Verdict

**CitrineOS 1.6 loop works** on this machine:

`Boot → Heartbeat → RemoteStart → StartTransaction → MeterValues → RemoteStop → StopTransaction`

Persisted CitrineOS `Transactions` row `id=1`: `ocppConnectionName=cp001`, `transactionId="1"`, `meterStart=1.25` kWh, `totalKwh=1.25`, `isActive=false`, `startTime`/`endTime` both set.

The charger was our lab OCPP 1.6 client (`scripts/lab-ocpp16-charger.mjs`), **not** EVerest. The official EVerest manager image is now local on this machine but **does not stay up on Apple Silicon** (see below). The CSMS path is already proven.

This is **not** a real-SKU session. PR 9 / PR 11 stay gated.

## How to start (this laptop)

CitrineOS uses its documented host ports. Our layer stays off those ports.

| Service | Host |
|---|---|
| Operator UI | 3000 |
| CitrineOS Postgres | 5432 (db `citrine`, user/pass `citrine`) |
| HTTP / Swagger | 8080 |
| WS no-auth (1.6 + 2.x) | 8081 |
| WS basic-auth | 8082 |
| TLS WS | 8443 / 8444 |
| Hasura | 8090 |
| Our API / demo web / Postgres | 3001 / 5173 / 5433 |

```bash
# CitrineOS (published images)
cd ~/Documents/xAI/citrineos-core
pnpm citrine
# or: docker compose -f docker-compose.yml --profile ui up -d

# Optional: EVerest 1.6 (large image)
cd ~/Documents/xAI/citrineos-core/apps/ocpp-server/everest
OCPP_VERSION=1.6 EVEREST_IMAGE_TAG=2025.6.1-dt-esdp docker compose up -d --build

# Lab charger (this repo) — enough to prove the loop
node ~/Documents/xAI/lets-charge/scripts/lab-ocpp-sink.mjs          # :3456
node ~/Documents/xAI/lets-charge/scripts/lab-ocpp16-charger.mjs     # ws://127.0.0.1:8081/cp001
```

Sibling clone needs **Node 24.16.0+** only if you run `pnpm citrine` / their source. The image path needs Docker only. This machine has Node `v24.18.0` and Docker `29.5.2`. `pnpm` was enabled via corepack (`11.22.0`); their `packageManager` field is `pnpm@10.19.0`.

Stop CitrineOS with the same compose files: `docker compose … down`. Leave `clean-my-car` running.

## OpenAPI facts (`GET http://localhost:8080/docs/json`)

Title: **CitrineOS Central System API 2.0.0-beta3**. 127 paths. Top-level `security: null`. A bearer `authorization` scheme exists in components but **docker default Message/Data APIs accepted unauthenticated curl**.

### Commands (Message API)

| Action | Method + path | Query | Body |
|---|---|---|---|
| RemoteStart 1.6 | `POST /ocpp/1.6/evdriver/remoteStartTransaction` | `identifier` (station), `tenantId` (required, default 1), optional `callbackUrl` | `{ connectorId, idTag }` (`idTag` max 20) |
| RemoteStop 1.6 | `POST /ocpp/1.6/evdriver/remoteStopTransaction` | same | `{ transactionId }` **integer** |
| HTTP 200 | | | `[{ "success": true }]` = queued (`IMessageConfirmation[]`). Not charger Accept. |

No Authorization HTTP header was sent. Lab `tenantId=1` on the **querystring**.

### Data API (verified)

| Action | Path | Notes |
|---|---|---|
| Subscribe | `POST /data/ocpprouter/subscription?tenantId=1` | Body: `{ ocppConnectionName, url, onConnect, onClose, onMessage, sentMessage }`. Field is **`ocppConnectionName`**, not `stationId`. Response was the new id (`1`). |
| List | `GET /data/ocpprouter/subscription?tenantId=1&ocppConnectionName=cp001` | |
| Boot config | `PUT/GET/DELETE /data/configuration/boot?ocppConnectionName=&tenantId=1` | |
| Transaction | `GET /data/transactions/transaction?ocppConnectionName=&transactionId=&tenantId=1` | |

### Authorization Data API — **does not exist on this tag**

Generated OpenAPI has **no** `/data/.../authorization` upsert. EVDriver Data API is only `GET /data/evdriver/localListVersion`.

Lab path that unblocked `StartTransaction`: SQL insert into CitrineOS `Authorizations` (tenant 1). That is **not** the product adapter (we do not write their tables from app code). Next adapter options, in order:

1. Hasura GraphQL insert into `Authorizations` from **our** API process (not the browser). Table is tracked (`public_Authorizations.yaml`). Console on `:8090` has no `HASURA_GRAPHQL_ADMIN_SECRET` in current compose.
2. OCPP 1.6 `POST /ocpp/1.6/evdriver/sendLocalList` if the box consults a local list.
3. Fold a real Data API into the contract only if a later CitrineOS release adds one.

Without a row, `StartTransaction.conf` is `{ idTagInfo: { status: "Invalid" }, transactionId: 0 }`. After insert of `ADMIN` / `RFIDTEST01` with `status=Accepted`, the next start was `{ idTagInfo: { status: "Accepted" }, transactionId: 1 }`.

## WebSocket

- Listen: `ws://0.0.0.0:8081/`, `8082`, `wss://8443`, `wss://8444`. **No port 8092.**
- Lab URL: `ws://127.0.0.1:8081/cp001` with subprotocol **`ocpp1.6`**.
- EVerest `start.sh` hard-codes the same: `ws://host.docker.internal:8081/cp001`.
- `allowUnknownChargingStations` is on for 8081. First connect auto-commissioned a `ChargingStations` row (`stationId` PK `2`, `ocppConnectionName=cp001`).

## Subscription callback (live)

Matches public `webhook.dispatcher.ts`. CitrineOS in Docker reached the host via `http://host.docker.internal:3456/ocpp`.

Connect:

```json
{ "ocppConnectionName": "cp001", "event": "connected" }
```

Message:

```json
{
  "ocppConnectionName": "cp001",
  "event": "message",
  "origin": "cs",
  "message": "[2,\"13\",\"StopTransaction\",{...}]",
  "info": {
    "correlationId": "13",
    "origin": "cs",
    "timestamp": "2026-08-16T08:33:06.691Z",
    "protocol": "ocpp1.6",
    "action": "StopTransaction",
    "type": "2"
  }
}
```

`sentMessage` also fires CSMS-origin frames (RemoteStart/Stop CALL and CALLRESULT). Some CALLRESULT rows show `action: "NoAction"` in `info` (correlation still works). Delivery was at-most-once; sink returned 200.

## Raw store (CitrineOS)

Table **`OCPPMessages`** (Hasura backfill name). Columns include `ocppConnectionName`, `correlationId`, `origin` (`cs` / `csms`), `protocol` (`ocpp1.6`), `action`, `type` (2/3/4), `payload` jsonb, `raw` text, `tenantId`. 34 rows for the lab session.

## Captured sequence (redacted)

Station `cp001`. Vendor `lets-charge-lab` / model `sim-ocpp16` / serial `LAB-CP001` / firmware `lab-0.1`. idTag `ADMIN`.

1. BootNotification → `Accepted`, `interval: 60`
2. Heartbeat → `currentTime`
3. RemoteStart (`ADMIN`, connector 1) → HTTP `[{success:true}]` then charger CALL `Accepted`
4. StartTransaction (before auth row) → `Invalid` / `transactionId: 0` — **do not bill**
5. SQL seed `Authorizations` for `ADMIN`, `RFIDTEST01`
6. RemoteStart again → StartTransaction `Accepted` / `transactionId: 1`
7. MeterValues `Energy.Active.Import.Register` = `2500` Wh
8. RemoteStop `{transactionId:1}` → Accepted
9. StopTransaction `meterStop: 2500` → `idTagInfo.Accepted`
10. StatusNotification `Available`

CitrineOS stored energy in **kWh** (`1.25`), not Wh. Our projector must not assume their units equal ours.

## EVerest status

`pnpm citrine --everest16` expands to CitrineOS compose + `apps/ocpp-server/everest` compose (`OCPP_VERSION=1.6`, image `ghcr.io/everest/everest-demo/manager:2025.6.1-dt-esdp`). Their compose pins `platform: linux/x86_64`.

On this **arm64** Mac the image pulled and the manager **started as `OCPP16`**, then exited 1 immediately:

```text
everest-framework 0.22.1 @v0.22.1
Using MQTT broker mqtt-server:1883
Syscall pipe2() failed (Invalid argument), exiting
```

`mqtt-server` and `nodered` stay up (`:1880`). The manager does not, so there is no EVerest Boot on `:8081`. This is qemu/x86_64-emulation vs everest-framework, not a CitrineOS bug. Replay on an amd64 Linux host (or a Docker setup with working amd64 Rosetta) before treating `--everest16` as green. Until then the lab charger is the week-1 stand-in. Do not block product work on this.

## Health URLs

- Swagger: http://localhost:8080/docs
- Health: `GET /health` → `{"status":"pass"}`
- Operator UI: http://localhost:3000
- Hasura: http://localhost:8090
- RabbitMQ mgmt: http://localhost:15672 (guest/guest)

## What this does *not* close

- Buy-rule #1 on Schneider / Exicom (still planning default).
- Real-SKU billable-shape session (UI merge gate).
- EVerest actually registering (image not local yet).
- HTTP auth on `:8080` if they later turn the bearer scheme on.

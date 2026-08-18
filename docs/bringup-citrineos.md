# Week-1 bring-up — CitrineOS + EVerest 1.6

Date: 2026-08-18. Sibling: `~/Documents/xAI/citrineos-core` @ `61622a0` (`v2.0.0-beta3`).  
This file is **facts** from a live lab. It does not change product locks in [`v1-design.md`](v1-design.md).

## Verdict

**EVerest 1.6 against CitrineOS works** on this machine:

`Boot → Heartbeat → RemoteStart → StartTransaction → MeterValues → RemoteStop → StopTransaction`

CitrineOS `Transactions` row `id=2`: `ocppConnectionName=cp001`, `transactionId="2"`, `meterStart=0`, `totalKwh=0.066`, `isActive=false`, start and end both set.

This is **not** a real-SKU session. PR 9 / PR 11 stay gated.

A lab JS charger (`scripts/lab-ocpp16-charger.mjs`) proved the same CSMS path earlier (tx `1`). EVerest is now the week-1 stand-in.

## How to start (this laptop)

| Service | Host |
|---|---|
| [CitrineOS Operator UI](http://localhost:3000/) | 3000 |
| CitrineOS Postgres | 5432 (db `citrine` / `citrine` / `citrine`) |
| [Swagger](http://localhost:8080/docs) | 8080 |
| OCPP WS (no auth, 1.6 + 2.x) | 8081 |
| WS basic-auth | 8082 |
| TLS WS | 8443 / 8444 |
| [Hasura](http://localhost:8090/) | 8090 |
| Our API / demo web / Postgres | 3001 / 5173 / 5433 |
| [EVerest UI](http://localhost:1880/ui/) | 1880 |
| [EVerest OCPP logs](http://localhost:8888/) | 8888 |

```bash
# CitrineOS (published images, default ports)
docker compose -f ~/Documents/xAI/citrineos-core/docker-compose.yml --profile ui up -d

# EVerest 1.6 — arm64 overlay required on this Mac
# --project-directory must be their everest folder (Dockerfile + start.sh live there).
# Both -f files are required: the overlay is not a full compose file.
export OCPP_VERSION=1.6 EVEREST_IMAGE_TAG=2025.6.1-dt-esdp
docker compose \
  --project-directory ~/Documents/xAI/citrineos-core/apps/ocpp-server/everest \
  -f ~/Documents/xAI/citrineos-core/apps/ocpp-server/everest/docker-compose.yml \
  -f ~/Documents/xAI/lets-charge/deploy/everest-native-platform.yml \
  up -d --build
```

Do **not** run vanilla `pnpm citrine --everest16` here. Their compose pins `linux/x86_64`; qemu dies with `Syscall pipe2() failed`. Official manager/mqtt images publish **linux/arm64** — the overlay uses those.

Sibling source needs **Node 24.16.0+** only if you run their launcher from git. Image path needs Docker only.

## Week-1 answers (design open questions 5–9, 13)

| # | Fact |
|---|---|
| **5** | RemoteStart `POST /ocpp/1.6/evdriver/remoteStartTransaction`. RemoteStop `POST /ocpp/1.6/evdriver/remoteStopTransaction`. Subscribe `POST /data/ocpprouter/subscription`. Commission/boot `PUT /data/configuration/boot`. Password `POST /data/configuration/password`. **No Authorization Data API** on `2.0.0-beta3` (see below). |
| **6** | Callback matches public `webhook.dispatcher.ts`: `{ ocppConnectionName, event: "connected"\|"closed"\|"message", origin, message, info }`. Confirmed on lab sink and on EVerest traffic (CitrineOS still POSTs the old `:3456` subscription if it exists). |
| **7** | One URL **per station**. Create-subscription field is **`ocppConnectionName`**, not `stationId`. Always `?tenantId=1` on the querystring. |
| **8** | OCPP 1.6 WS is `ws://127.0.0.1:8081/<ocppConnectionName>` subprotocol **`ocpp1.6`**. No port 8092. Also 8082 / 8443 / 8444. |
| **9** | Docker default Message/Data APIs accept **unauthenticated** curl. OpenAPI has a bearer scheme; top-level `security` is `null`. `tenantId` is required; lab default **1**. |
| **13** | EVerest station id is **`cp001`**. Hard-coded in their `start.sh` as `ws://host.docker.internal:8081/cp001`. Do not assume `CS01`. |

Also recorded (not in that OQ list): Hasura backfill table is **`OCPPMessages`**. CitrineOS `Transactions.transactionId` is text (`"2"`); RemoteStop body `transactionId` is an **integer**. Energy in their row is **kWh**; EVerest meters are **Wh** (and often decimal strings like `"38.00"`).

## OpenAPI (`GET http://localhost:8080/docs/json`)

Title: **CitrineOS Central System API 2.0.0-beta3**. 127 paths.

### Message API

| Action | Path | Query | Body | HTTP 200 |
|---|---|---|---|---|
| RemoteStart 1.6 | `POST /ocpp/1.6/evdriver/remoteStartTransaction` | `identifier` (station), `tenantId` (required), optional `callbackUrl` | `{ connectorId, idTag }` (`idTag` ≤ 20) | `[{ "success": true }]` = **queued**, not charger Accept |
| RemoteStop 1.6 | `POST /ocpp/1.6/evdriver/remoteStopTransaction` | same | `{ transactionId }` **integer** | same |
| SendLocalList 1.6 | `POST /ocpp/1.6/evdriver/sendLocalList` | same | OCPP SendLocalList | same |

### Data API

| Action | Path | Notes |
|---|---|---|
| Subscribe | `POST /data/ocpprouter/subscription?tenantId=1` | Body `{ ocppConnectionName, url, onConnect, onClose, onMessage, sentMessage }` |
| List / delete | `GET` / `DELETE` same path | GET needs `ocppConnectionName` |
| Boot config | `PUT/GET/DELETE /data/configuration/boot?ocppConnectionName=&tenantId=1` | |
| Password | `POST /data/configuration/password` | |
| Transaction | `GET /data/transactions/transaction?ocppConnectionName=&transactionId=&tenantId=1` | |

### Authorization Data API — **does not exist**

No `/data/.../authorization`. EVDriver Data API is only `GET /data/evdriver/localListVersion`.

Lab path that unblocks `StartTransaction`: SQL (or Hasura) insert into `Authorizations` (`idToken`, `status=Accepted`, `tenantId=1`). **Not** the product adapter. Product options: server-side Hasura insert; or `SendLocalList` if the box uses a local list.

Without a row: `StartTransaction.conf` = `{ idTagInfo: { status: "Invalid" }, transactionId: 0 }`. With `ADMIN` / `RFIDTEST01` Accepted, EVerest got `{ idTagInfo: { status: "Accepted" }, transactionId: 2 }`.

## Identity / wire

- EVerest `ocppConnectionName` = **`cp001`**
- Boot: `chargePointVendor=Pionix`, `chargePointModel=Yeti`, `firmwareVersion=0.1`, `chargeBoxSerialNumber=cp001`
- Protocol: `ocpp1.6`
- `allowUnknownChargingStations` on `:8081` auto-commissioned `ChargingStations.id=2`

## EVerest captured sequence (2026-08-18)

Plug is **not** automatic. After RemoteStart the connector sits `Preparing` / Authorized until a carsim plugin:

```bash
docker exec everest-mqtt-server-1 mosquitto_pub -h localhost \
  -t 'everest_external/nodered/1/carsim/cmd/execute_charging_session' \
  -m 'sleep 1;iec_wait_pwr_ready;sleep 1;draw_power_regulated 16,3;sleep 36000'
```

(Or the [EVerest UI](http://localhost:1880/ui/) “Car Plugin” button.)

| Step | What happened |
|---|---|
| Boot | `Accepted`, `interval: 60` |
| Heartbeat | `currentTime` |
| RemoteStart `ADMIN` connector 1 | HTTP `[{success:true}]`; charger CALLRESULT `{status: Accepted}` |
| Status | `Preparing` (`info: Authorized`) |
| After carsim plugin | `StartTransaction` `{connectorId:1,idTag:ADMIN,meterStart:0}` → `{idTagInfo.Accepted, transactionId:2}` |
| Status | `SuspendedEVSE` then `Charging` |
| MeterValues | `Energy.Active.Import.Register` at Outlet, unit **Wh**, value `"38.00"` (+ L1/L2/L3). Includes `transactionId: 2` |
| RemoteStop `{transactionId:2}` | HTTP queued; charger `{status: Accepted}` |
| StopTransaction | `meterStop: 66`, `reason: Remote`, `transactionId: 2`. CALLRESULT was `{}` (no `idTagInfo`) |
| Status | `Finishing` |
| CitrineOS row | `totalKwh=0.066` (they store **kWh**), `isActive=false` |

EVerest also sends `DataTransfer` CSRs for V2G; CitrineOS 1.6 **Rejected** them. `SecurityEventNotification` gets `CALLERROR` / `InternalError`. Ignore both for v1.

## Subscription callback (lab sink, same dispatcher)

```json
{ "ocppConnectionName": "cp001", "event": "connected" }
```

```json
{
  "ocppConnectionName": "cp001",
  "event": "message",
  "origin": "cs",
  "message": "[2,\"…\",\"StopTransaction\",{…}]",
  "info": {
    "correlationId": "…",
    "origin": "cs",
    "timestamp": "…",
    "protocol": "ocpp1.6",
    "action": "StopTransaction",
    "type": "2"
  }
}
```

`sentMessage` also fires CSMS-origin frames. Some CALLRESULT `info.action` is `"NoAction"`; correlate by id. Delivery is at-most-once.

## Raw store

Table **`OCPPMessages`**. Columns: `ocppConnectionName`, `correlationId`, `origin` (`cs` / `csms`), `protocol`, `action`, `type` (2/3/4), `payload` jsonb, `raw` text, `tenantId`.

## What this does *not* close

- Buy-rule #1 on Schneider / Exicom.
- Real-SKU billable-shape session (UI merge gate).
- Official `pnpm citrine --everest16` on this Mac (use the arm64 overlay).
- HTTP auth on `:8080` if they later enable the bearer scheme.
- Product Authorization adapter (Hasura / SendLocalList) — still SQL in the lab.

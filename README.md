# Apartment EV charging — CMS + apps

Hardware-agnostic charge-point software for **apartment / housing-society** parking. We build the cloud (CMS), the society operator web, and the resident apps (Android, then iOS). We do **not** manufacture chargers. Vendor boxes talk to us over **OCPP**.

v1 is one society, a handful of AC wallboxes, and a working charge from “plug in” to “kWh on a receipt.” It is not a public highway network and not a roaming app for India.

This file is the product **scope contract**. Implementation of our layer starts as a pnpm workspace; the OCPP engine is CitrineOS in a sibling clone, not this repo.

## What we are building

A **Charge Station Management System (CSMS)** plus a thin product layer on top:

| Surface | Who uses it | v1 job |
|---|---|---|
| OCPP engine | The wallbox | Boot, stay online, start, meter, stop |
| Operator CMS (web) | Society manager / installer | See which chargers are up, start/stop, list sessions |
| Resident app | Flat owner / tenant | Start/stop the charger in front of them, see live kWh, get a receipt |
| Your product layer | Us | Society → slot → charger → resident; later billing and a building load cap |

The apps never talk to the box. The CSMS is the source of truth for charger state and energy.

```text
Schneider EVlink Pro AC 7.4  ─┐
Exicom Spin Air 7.4          ─┼─ OCPP 1.6J ─►  CitrineOS (engine)
EVerest simulator (week 1)   ─┘                    │
                                                   ├─ CitrineOS Operator UI  (lab only)
                                                   └─ our layer
                                                        ├─ society / tenant / session
                                                        └─ driver API → Android, then iOS
```

## First customer

**Apartment / society basement or podium parking.**

That locks the product:

- AC wallboxes (overnight / workday charging), not DC fast
- Shared building electrical headroom — design for a site-level amp cap; do not implement the algorithm in v1
- Residents and a society admin, not highway drive-up customers
- Shared or assigned parking slots

Public CPO, fleets, maps of India, and roaming are later products.

## Hardware we will certify (exactly two SKUs)

We do not claim “any OCPP charger.” v1 has a **supported-hardware list of two models**. Each line is one SKU + firmware, not a category.

| # | Model | Role |
|---|---|---|
| 1 | **Schneider Electric EVlink Pro AC**, 7.4 kW, single-phase, Type 2 | Building-grade reference. OCPP 1.6J, third-party backend documented. |
| 2 | **Exicom Spin Air**, 7.4 kW, Type 2 | India volume. Datasheet lists 3rd-party CMS + OCPP 1.6J. What societies already buy. |

Fallback if Schneider is slow to buy in ones and twos: **Delta AC Mini Plus** 7.4 kW (same role as #1).

A model is not certified until all four are true:

1. We can set a **custom CSMS WebSocket URL** without a vendor ticket
2. It speaks **OCPP 1.6 JSON**, not SOAP
3. We know the **exact firmware** on the unit we test
4. **RemoteStart / RemoteStop** and RFID both work pointed at *our* backend

Do not add DC, 22 kW three-phase, or “OCPP can be enabled” boxes to this list.

Week 1 uses a simulator, not these boxes. Order both SKUs so they exist by the time the engine loop works.

## Open-source base

We start from **[CitrineOS](https://github.com/citrineos/citrineos-core)** (LF Energy, Apache 2.0, TypeScript). It is the OCPP engine: 1.6 and 2.0.1, operator UI, Docker, and an [EVerest](https://github.com/EVerest/everest-core) charger simulator (`pnpm citrine --everest16`).

**How we use it:** run CitrineOS; do not fork it into our apartment app. Society tenants, flat-wise billing, load caps, and the mobile apps sit on its APIs. Vendor quirks (Schneider vs Exicom) live in **our hardware-profile layer**, not as `if (vendor)` inside their router.

| Also looked at | Verdict |
|---|---|
| [SteVe](https://github.com/steve-community/steve) | Best-known OCPP 1.6 server. GPL-3.0, dated UI. Use as a second brain when a charger misbehaves — not the product base. |
| SAP Open e-Mobility | Archived January 2025. Dead. |
| [mobilityhouse/ocpp](https://github.com/mobilityhouse/ocpp) | Python library, not a CSMS. Only if we later write our own engine. |

v1 implements **OCPP 1.6 JSON only**. The data model should not block 2.0.1 later. We do not implement both protocols in the first cut.

## v1 — in scope

One vertical slice, then a thin CMS and one driver client.

**Protocol (the product)**

- Charge point boots, heartbeats, and reports status
- Remote start / remote stop
- Meter values persisted
- A **session** with start, stop, and kWh — not billable unless start and stop (or a recovered stop) both exist
- Raw OCPP messages stored *and* normalized, so vendor dialects can be replayed
- Charger identity is `vendor + model + firmware + serial`

**Operator CMS (web)**

- List chargers and online / offline
- Last heartbeat, status, error
- Start / stop from the browser
- Session list

One admin user. No roles, no multi-tenant white-label.

**Resident client**

- Mobile **web** first (bench + first society demo)
- Then **Android**
- Then **iOS**, same API
- Four screens: sign in, charger in front of me, start/stop + live kWh, receipt
- Prepaid test balance is enough; no UPI in the first cut

**Apartment model (minimum)**

- One society, parking slots, chargers bound to slots, residents bound to flats
- Site-level amp cap exists on the data model; the load-management algorithm does not ship in v1

## v1 — out of scope

Do not leak these into the first cut.

- Native iOS and Android in parallel on day one
- Public maps, reservations, subscriptions
- UPI, GST invoices, wallets (stub payment until sessions are reliable)
- OCPI / roaming / other CPO networks
- Dynamic load-management algorithm (column now, logic later)
- OCPP 2.0.1, Plug & Charge, ISO 15118
- White-label theming for other operators
- “Support every Indian OEM”
- Hardware manufacturing, ARAI, installation contracting

## How we start (order is the plan)

Do not open Xcode or Android Studio first. Do not design twelve screens.

| Week | Demo |
|---|---|
| 1 | CitrineOS + EVerest 1.6. Boot → heartbeat → remote start → meters → stop. |
| 2–3 | Same loop on the **Schneider**. One-page hardware profile (plug-in events, meter measurands, connector names). |
| 4 | Same loop on the **Exicom**. The diff between the two profiles *is* the compatibility layer. |
| 5 | Operator web: online/offline, start/stop, session list. |
| 6 | Resident mobile-web: identify charger → start → live kWh → stop. |

A second physical model (week 4) is the real “are we vendor-compatible?” test. v1 apps ship against EVerest until a real box is on the bench.

## Architecture we are committing to

```text
Vendor box  --OCPP 1.6J-->  CitrineOS CSMS
                                |
                                +--> Operator web (CMS)
                                +--> Driver API  -->  mobile web, then Android, then iOS
```

Rules:

- CSMS owns charger state and energy. Apps never talk to the box.
- Every inbound OCPP message is stored raw and normalized.
- Supported hardware is an explicit list, not a marketing claim.

Stack beyond CitrineOS (our layer, apps, billing) is **not pinned** until the week-1 simulator loop works.

## Repo layout

```text
~/Documents/xAI/
  citrineos-core/     # sibling clone (not our git history). Node 24.16.0+ to run their launcher.
  lets-charge/        # this repo. Our layer: Node 22+.
    apps/api          # Fastify — Docker on :3001
    apps/web          # React — built nginx demo on :5173; host Vite optional
    packages/         # hardware, db (product schema + ocpp_messages), citrine-client
    deploy/           # compose: db :5433, api :3001, demo web :5173
```

Pinned CitrineOS images live in [`deploy/citrineos.env`](deploy/citrineos.env). Do not vendor or workspace-import `@citrineos/core`.

```bash
pnpm install
pnpm up             # Postgres :5433 + API :3001
pnpm up:citrine     # same, plus join the `citrineos` network and subscribe cp001
pnpm up:demo        # + built web on :5173 (nginx, same-origin /v1)
pnpm dev:web        # host Vite override — stop the web container first
```

CitrineOS itself is started from the sibling on its default ports (UI **:3000**, Postgres **:5432**). See [`docs/bringup-citrineos.md`](docs/bringup-citrineos.md).

Stack for our layer (TypeScript / Fastify / Postgres / Drizzle / React+Vite) is still **provisional**.

## Current status

- Scope agreed: apartment / society, two certified AC SKUs, CitrineOS as engine.
- v1 design contract: [`docs/v1-design.md`](docs/v1-design.md).
- Week-1 CitrineOS 1.6 loop proven on **EVerest** (`cp001`, tx 2): [`docs/bringup-citrineos.md`](docs/bringup-citrineos.md).
- Workspace scaffold: API and Postgres in Docker, built web image for demo, host Vite optional.
- Raw OCPP ingest: `POST /internal/citrine/ocpp?secret=` writes `ocpp_messages`. `pnpm up:citrine` subscribes EVerest `cp001` only.
- Product schema + lab seed: one society, three slots, EVerest charger `cp001` (`LC-B12`), two residents with ₹1,000 test credit.
- Hardware profiles: Schneider EVlink Pro AC and Exicom Spin Air (plug-in fields still null). Same projector; dialect lives in the two YAML files.
- Lab start/stop adapter: `POST /internal/lab/sessions/start` queues CitrineOS RemoteStart (201 = queued). Authorization via Hasura (`ADMIN`, `RFIDTEST01`, resident tags).
- Auth stub: resident OTP (`000000` when `OTP_STUB=true`), admin password from env, cookies `lc_resident` / `lc_admin`.
- Operator web: [http://localhost:5173/admin](http://localhost:5173/admin). Resident: [http://localhost:5173/](http://localhost:5173/) and `/c/LC-B12`. v1 UI runs against **EVerest**.
- Our API OpenAPI 3.0: [http://localhost:3001/docs](http://localhost:3001/docs) (JSON [http://localhost:3001/docs/json](http://localhost:3001/docs/json)). CitrineOS remains [http://localhost:8080/docs](http://localhost:8080/docs).

# Session handoff — 2026-08-16

Read this before doing anything else. Then read [`README.md`](../README.md). That README is the **scope contract**. This file is **why we decided it, what we already researched, and what the next session should do**.

Do not re-litigate the product unless the user asks. Do not start app UI. Do not write CSMS protocol code until they say the week-1 bring-up can start.

**Repo:** `~/Documents/xAI/lets-charge` · [github.com/krishnamadhavan/lets-charge](https://github.com/krishnamadhavan/lets-charge)  
**This conversation started in the wrong folder** (`~/Documents/xAI/spotify`). Spotify’s README was restored. All charging work belongs **only** here.

---

## One-sentence product

Hardware-agnostic **CMS + resident apps** for **apartment / housing-society** EV charging in India. We do not make chargers. Vendor AC wallboxes talk to us over **OCPP 1.6 JSON**. Engine is **CitrineOS**, not a from-scratch protocol stack.

---

## How we got here

1. User asked for a simple read of [incredibleengineering.in](https://www.incredibleengineering.in/) (Chennai EV-charger OEM: Type 2 AC, CCS2 DC, plus their own CMS/app).
2. Then: can we build **only the software** (CMS + iOS/Android) and pair it with any hardware vendor?
3. Then: first customer is **apartment / society**. Which two boxes do we certify? Which open-source CSMS do we start from? **No product code yet.**
4. Scope was written into the README. User asked to switch folders to `lets-charge`. This handoff exists so a **new Grok session launched from `lets-charge`** can continue.

Incredible Engineering is **background only**. Do not centre the product, hardware list, or partnership story on them.

---

## Decisions (locked)

| Decision | Choice |
|---|---|
| First customer | One apartment / housing society (basement or podium parking) |
| What we sell | Software: OCPP CSMS + operator web + resident apps |
| What we do not sell | Chargers, installation, ARAI/BIS hardware |
| Protocol in v1 | OCPP 1.6 JSON only. Data model must not block 2.0.1 later. |
| Hardware claim | Explicit list of **two certified SKUs**, not “any OCPP charger” |
| Certified pair | **Schneider Electric EVlink Pro AC** 7.4 kW 1-phase Type 2 + **Exicom Spin Air** 7.4 kW Type 2 |
| Fallback for SKU #1 | Delta AC Mini Plus 7.4 kW if Schneider is hard to buy in ones and twos |
| Open-source engine | [CitrineOS](https://github.com/citrineos/citrineos-core) (LF Energy, Apache 2.0). Run it; **do not fork it into our app**. |
| Apps order | Mobile **web** first → Android → iOS. Same driver API. Not both stores on day one. |
| Payments in v1 | Stub / prepaid test balance. No UPI yet. |
| Load management | Site-level amp cap on the **data model** only. No algorithm in v1. |
| Stack for *our* layer | **Not pinned** until `pnpm citrine --everest16` works. |

### Buy-rules (a SKU is not “certified” until all four)

1. Custom CSMS WebSocket URL without a vendor ticket
2. OCPP 1.6 JSON, not SOAP
3. Exact firmware version known on the unit we test
4. RemoteStart / RemoteStop **and** RFID work pointed at *our* backend, not only their cloud

Reject: DC, 22 kW 3-phase as first SKU, anything that says “OCPP can be enabled”, home-only boxes locked to the vendor app.

---

## Why software-only is valid

Industry default is to split the box from the brain.

- **OCPP** = charger ↔ our cloud
- **OCPI** (later) = our network ↔ other networks
- Roles: hardware OEM / CSMS vendor / CPO / eMSP. We are CSMS + apartment product, optionally CPO for one society.

Proven software-only: AMPECO, Driivz, Monta, ChargeLab, EV Connect globally; Pulse Energy, YoCharge, Evoltsoft in India. Pulse (Peak XV) aggregates others (e.g. HPCL’s 5k+ chargers). Closed stacks (ChargePoint, Tesla) exist; they are not the model.

**Caveat we must not forget:** “OCPP-compliant” is not plug-and-play. Vendors have dialects (when they send StatusNotification, when StartTransaction fires, meter timestamp formats). Real failures: ghost sessions (energy, no bill), chargers reverting to max amps when the net drops and blowing a site fuse, firmware that slightly changes JSON and billing dies. Mature CSMS keep a **per-vendor hardware profile**. That is why we certify two different dialects (Schneider = clean/global, Exicom = India volume).

India specifics worth keeping:

- Charging is **de-licensed**; DISCOM load, electrical inspector, fire NOC, BIS hardware are site problems.
- MoP 2024: networked chargers expected to speak OCPP; OCPI for roaming. 2.0.1 is being pushed for new networked units; **field boxes are still mostly 1.6**.
- Charging is a **service** (GST ~18%), not “electricity”.
- UPI is table-stakes later; 2W/3W is India’s volume but **v1 is car AC in a society**, not Bharat AC-001 scooters.
- Access/fragmentation (many apps) is the consumer pain, not range.

Build-vs-buy: AMPECO-class guidance is ~€500k–1M and 12 months for a *minimal* in-house CSMS. That is why we start from CitrineOS instead of parsing the spec.

---

## Open-source evaluation (already done)

| Repo | Verdict |
|---|---|
| **[citrineos/citrineos-core](https://github.com/citrineos/citrineos-core)** | **Use this.** Apache 2.0, TypeScript, Fastify, Postgres, RabbitMQ, Next operator UI. OCPP 1.6 **and** 2.0.1 (1.6 added April 2025, still younger than SteVe). Docker: `pnpm citrine --everest16`. Optional OCPI in-repo — ignore in v1. |
| [steve-community/steve](https://github.com/steve-community/steve) | Best-known 1.6 (~1.1k★, since 2013, OCA-related 1.6 behavior). **GPL-3.0.** Lab comparison only. |
| SAP Open e-Mobility (`sap-labs-france/ev-server`) | Archived Jan 2025. Dead. |
| [mobilityhouse/ocpp](https://github.com/mobilityhouse/ocpp) | Python **library**, not a CSMS. |
| [EVerest/everest-core](https://github.com/EVerest/everest-core) | Charger **firmware** / simulator. Week-1 fake wallbox via CitrineOS. Not our CMS. |
| Random FastAPI+Vue CSMS clones | Do not inherit. |

**How we use CitrineOS:** it is the OCPP engine. Our product (society, flats, slots, residents, later billing, apps) sits **on its APIs**. Vendor quirks live in **our hardware-profile layer**. Do not rewrite their operator UI into the apartment app.

Honest caveats: heavier stack (RabbitMQ, Hasura, Postgres, MinIO); 1.6 less battle-tested than SteVe.

---

## Architecture (committed)

```text
Schneider EVlink Pro AC 7.4  ─┐
Exicom Spin Air 7.4          ─┼─ OCPP 1.6J ─►  CitrineOS (engine)
EVerest simulator (week 1)   ─┘                    │
                                                   ├─ CitrineOS Operator UI  (lab only)
                                                   └─ our layer
                                                        ├─ society / slot / tenant / session
                                                        └─ driver API → mobile web → Android → iOS
```

Rules:

- CSMS is source of truth. Apps never talk to the box.
- Store every inbound OCPP message **raw and normalized**.
- Charger identity = `vendor + model + firmware + serial`.
- A session is not billable unless start and stop (or a recovered stop) both exist.

### v1 surfaces

| Surface | Job |
|---|---|
| OCPP engine | Boot, heartbeat, status, remote start/stop, meters, session with kWh |
| Operator web | Online/offline, last heartbeat/error, start/stop, session list. One admin. |
| Resident client | Sign in, charger in front of me, start/stop + live kWh, receipt |

### Explicitly out of v1

Native iOS+Android in parallel, maps, reservations, UPI/GST/wallets, OCPI/roaming, load-management **algorithm**, OCPP 2.0.1 / Plug & Charge / ISO 15118, white-label, “every Indian OEM”, hardware manufacturing.

---

## Week plan (order is the plan)

| Week | Demo |
|---|---|
| 1 | CitrineOS + EVerest 1.6. Boot → heartbeat → remote start → meters → stop. |
| 2–3 | Same loop on **Schneider**. One-page hardware profile. |
| 4 | Same loop on **Exicom**. The **diff** is the compatibility layer. |
| 5 | Operator web: online/offline, start/stop, session list. |
| 6 | Resident mobile-web: identify charger → start → live kWh → stop. |

Until a **real box** has completed a session against our URL, UI work is decoration.

---

## Repo state (as of this handoff)

| Path | What |
|---|---|
| `README.md` | Scope contract (keep in sync if decisions change) |
| `docs/handoff.md` | This file |
| `docs/v1-design.md` | v1 design contract (written 2026-08-16; product defaults locked) |
| `docs/bringup-citrineos.md` | Week-1 facts: CitrineOS 1.6 loop works (lab charger). EVerest manager exits on this arm64 Mac. |
| `scripts/lab-ocpp16-charger.mjs` | Lab OCPP 1.6 charger (not product) |
| `scripts/lab-ocpp-sink.mjs` | Lab subscription sink |
| `.grok/rules/` | Conventional commits, no commits to `main`, delete branch after merge |
| Application / product code | **None** |
| Sibling | `~/Documents/xAI/citrineos-core` @ `v2.0.0-beta3` (`61622a0`) |

`lets-charge` already has `origin` (`github.com/krishnamadhavan/lets-charge`). `main` is protected. Do not commit the README/handoff/design to `main`; use `docs/…` or `chore/…` if the user wants it committed.

**Do not touch** `~/Documents/xAI/spotify` for this product.

---

## Next session — do this, in order

1. Confirm you are in `~/Documents/xAI/lets-charge` (`pwd`). If not, stop.
2. Re-read `README.md`, this file, and [`docs/v1-design.md`](v1-design.md). Do not redo the Incredible Engineering site tour, the global CSMS market scan, or rewrite the design contract unless asked.
3. **C is done.** **B is done for CitrineOS** (1.6 loop proven with a lab charger; notes in [`bringup-citrineos.md`](bringup-citrineos.md)). Official EVerest manager **does not run on this arm64 Mac** (`pipe2()` under `linux/x86_64`). Product defaults are locked (prepaid wallet, we operate, compose + sibling).
4. Ask the user which they want **now**:
   - Replay EVerest on an **amd64 Linux** host later. Do not keep fighting qemu on this laptop.
   - **PR 1:** scaffold the pnpm workspace (`chore(repo): scaffold pnpm workspace and compose overlay`).
   - Fold week-1 facts into `docs/v1-design.md` (Authorization has **no** Data API on `v2.0.0-beta3`; Hasura/`Authorizations` is the lab path).
5. If they say “just continue” with no pick, prefer **fold week-1 facts**, then **PR 3** (raw OCPP ingest) once the workspace PR is on `main`. Do not open Xcode/Android Studio. Do not start operator/resident UI. Do not treat the lab charger session as the real-SKU merge gate.

---

## Open questions

Resolved 2026-08-16 (user, recommended defaults — see [`v1-design.md`](v1-design.md)):

- **SKU CSMS URL this month:** planning default — Schneider likely, Exicom unproven until bench. Does not certify. No vendor call now.
- **Billing:** `prepaid_wallet` stub. No UPI/GST in v1.
- **Hosting:** we operate CitrineOS + our layer for the first society.
- **Repo layout:** compose dependency + sibling `citrineos-core` clone. Not a submodule.

Week-1 facts (see [`bringup-citrineos.md`](bringup-citrineos.md)): Message paths pinned; callback matches `webhook.dispatcher.ts`; 1.6 WS is `:8081` + `ocpp1.6`; station id `cp001`; **no Authorization Data API** on this tag. EVerest image is local; **manager exits on this arm64 Mac** (`pipe2() failed`). Lab charger is the working 1.6 stand-in.

---

## Voice / working style the user already set

- Explain in simpler terms when they ask for understanding; go deep when they ask for analysis.
- Conventional commits; never commit to `main`.
- They asked for scope in the README and a folder switch — they want artifacts in the **right repo**, not long chat-only plans.
- Verify UI in a browser when we eventually ship web. That is not now.

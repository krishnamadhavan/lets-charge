#!/usr/bin/env node
// Lab-only OCPP 1.6 JSON charger. Speaks to CitrineOS on :8081.
// Not a product charger and not a substitute for EVerest or a real SKU.

const CSMS = process.env.CSMS_URL ?? 'ws://127.0.0.1:8081/cp001';
const STATION = process.env.STATION_ID ?? 'cp001';
const ID_TAG = process.env.ID_TAG ?? 'ADMIN';
const CONNECTOR = Number(process.env.CONNECTOR_ID ?? 1);

let nextId = 1;
const pending = new Map();
let transactionId = null;
let meterWh = 0;
let ws;

function rpcId() {
  return String(nextId++);
}

function sendCall(action, payload) {
  const id = rpcId();
  const frame = [2, id, action, payload];
  console.log('→ CALL', action, JSON.stringify(payload));
  ws.send(JSON.stringify(frame));
  return id;
}

function sendResult(uniqueId, payload) {
  console.log('→ RESULT', uniqueId, JSON.stringify(payload));
  ws.send(JSON.stringify([3, uniqueId, payload]));
}

function isoNow() {
  return new Date().toISOString();
}

async function handleCall(uniqueId, action, payload) {
  console.log('← CALL', action, JSON.stringify(payload));
  switch (action) {
    case 'RemoteStartTransaction': {
      sendResult(uniqueId, { status: 'Accepted' });
      sendCall('StatusNotification', {
        connectorId: CONNECTOR,
        status: 'Preparing',
        errorCode: 'NoError',
        timestamp: isoNow(),
      });
      pending.set(
        sendCall('StartTransaction', {
          connectorId: CONNECTOR,
          idTag: payload.idTag ?? ID_TAG,
          meterStart: meterWh,
          timestamp: isoNow(),
        }),
        'StartTransaction',
      );
      break;
    }
    case 'RemoteStopTransaction': {
      sendResult(uniqueId, { status: 'Accepted' });
      if (transactionId == null) return;
      pending.set(
        sendCall('StopTransaction', {
          transactionId,
          meterStop: meterWh,
          timestamp: isoNow(),
          idTag: ID_TAG,
        }),
        'StopTransaction',
      );
      break;
    }
    case 'GetConfiguration':
      sendResult(uniqueId, { configurationKey: [], unknownKey: payload.key ?? [] });
      break;
    case 'ChangeConfiguration':
      sendResult(uniqueId, { status: 'Accepted' });
      break;
    case 'Reset':
      sendResult(uniqueId, { status: 'Accepted' });
      break;
    case 'TriggerMessage':
      sendResult(uniqueId, { status: 'Accepted' });
      break;
    default:
      sendResult(uniqueId, { status: 'Rejected' });
  }
}

function handleResult(uniqueId, payload) {
  const action = pending.get(uniqueId);
  pending.delete(uniqueId);
  console.log('← RESULT', action ?? uniqueId, JSON.stringify(payload));
  if (action === 'StartTransaction' && payload?.transactionId != null) {
    transactionId = payload.transactionId;
    console.log('transactionId=', transactionId);
    sendCall('StatusNotification', {
      connectorId: CONNECTOR,
      status: 'Charging',
      errorCode: 'NoError',
      timestamp: isoNow(),
    });
    meterWh += 1250;
    sendCall('MeterValues', {
      connectorId: CONNECTOR,
      transactionId,
      meterValue: [
        {
          timestamp: isoNow(),
          sampledValue: [
            {
              value: String(meterWh),
              measurand: 'Energy.Active.Import.Register',
              unit: 'Wh',
            },
          ],
        },
      ],
    });
  }
  if (action === 'StopTransaction') {
    sendCall('StatusNotification', {
      connectorId: CONNECTOR,
      status: 'Available',
      errorCode: 'NoError',
      timestamp: isoNow(),
    });
    transactionId = null;
  }
}

async function main() {
  console.log('connecting', CSMS, 'as', STATION);
  ws = new WebSocket(CSMS, ['ocpp1.6']);
  ws.addEventListener('open', () => {
    console.log('ws open, protocol=', ws.protocol);
    const bootId = sendCall('BootNotification', {
      chargePointVendor: 'lets-charge-lab',
      chargePointModel: 'sim-ocpp16',
      chargePointSerialNumber: 'LAB-CP001',
      firmwareVersion: 'lab-0.1',
    });
    pending.set(bootId, 'BootNotification');
    sendCall('StatusNotification', {
      connectorId: 0,
      status: 'Available',
      errorCode: 'NoError',
      timestamp: isoNow(),
    });
    sendCall('StatusNotification', {
      connectorId: CONNECTOR,
      status: 'Available',
      errorCode: 'NoError',
      timestamp: isoNow(),
    });
    const hb = sendCall('Heartbeat', {});
    pending.set(hb, 'Heartbeat');
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    const type = msg[0];
    if (type === 2) handleCall(msg[1], msg[2], msg[3] ?? {});
    else if (type === 3) handleResult(msg[1], msg[2] ?? {});
    else console.log('← other', JSON.stringify(msg));
  });
  ws.addEventListener('close', (ev) => {
    console.log('ws close', ev.code, ev.reason);
    process.exit(ev.code === 1000 ? 0 : 1);
  });
  ws.addEventListener('error', (err) => {
    console.error('ws error', err.message ?? err);
  });
}

main();

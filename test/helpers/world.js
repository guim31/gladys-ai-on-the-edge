// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake MQTT broker the test
// publishes firmware messages on, a fake fetch answering the REST API, and
// the integration wired on top through registerHandlers — the same wiring as
// index.js.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const BROKER_URL = 'mqtt://broker.example:1883';
export const CLIENT_ID = 'gladys-aote-0a1b2c3d';
export const DEVICE_ADDRESS = 'http://192.0.2.30';

/**
 * One number as the firmware writes it (ClassFlowPostProcessing::
 * getJsonFromNumber): every field a string, two-space indentation, "\n"
 * line ends. `value` and `rate` are "" when the round failed.
 */
export function numberJson({
  value = '1234.5678',
  raw = value === '' ? '0123N.5678' : `0${value}`,
  pre = '1234.5670',
  error = 'no error',
  rate = '0.000160',
  timestamp = '2026-11-10T14:05:02+0100',
} = {}) {
  const n = '\n';
  return (
    `  {${n}` +
    `    "value": "${value}",${n}` +
    `    "raw": "${raw}",${n}` +
    `    "pre": "${pre}",${n}` +
    `    "error": "${error}",${n}` +
    `    "rate": "${rate}",${n}` +
    `    "timestamp": "${timestamp}"${n}` +
    `  }${n}`
  );
}

/** GET /json as the firmware writes it (ClassFlowPostProcessing::GetJSON). */
export function restJson(numbers) {
  const n = '\n';
  const entries = Object.entries(numbers).map(
    ([name, fields]) => `"${name}":${n}${numberJson(fields)}${n}`,
  );
  return `{${n}${entries.join(`,${n}`)}}`;
}

/** The system topics a device publishes after connecting and at each round. */
export function announce(world, main = 'watermeter', { hostname = 'watermeter' } = {}) {
  world.broker.send(`${main}/connection`, 'connected');
  world.broker.send(`${main}/hostname`, hostname);
  world.broker.send(`${main}/interval`, '5.0');
  world.broker.send(`${main}/uptime`, '3600');
  world.broker.send(`${main}/freeMem`, '1904123');
  world.broker.send(`${main}/wifiRSSI`, '-61');
  world.broker.send(`${main}/CPUtemp`, '47');
  world.broker.send(`${main}/fwVersion`, 'v16.0.0');
  world.broker.send(`${main}/MAC`, '0A:00:00:00:00:01');
  world.broker.send(`${main}/IP`, '192.0.2.30');
}

/** A fake broker: mqtt.connect() returning a client the test drives. */
export function createFakeBroker() {
  const broker = {
    clients: [],
    connections: [],
    grantedQos: 0,
    get client() {
      return broker.clients[broker.clients.length - 1];
    },
    connect(url, options) {
      const client = new EventEmitter();
      client.subscriptions = [];
      client.ended = false;
      client.subscribe = (topics, opts, callback) => {
        const list = [].concat(topics);
        client.subscriptions.push(...list);
        callback?.(
          null,
          list.map((topic) => ({ topic, qos: broker.grantedQos })),
        );
      };
      client.publish = () => {
        throw new Error('the integration never publishes');
      };
      client.end = () => {
        client.ended = true;
      };
      broker.clients.push(client);
      broker.connections.push({ url, options });
      return client;
    },
    accept() {
      broker.client.emit('connect');
    },
    send(topic, payload) {
      broker.client.emit('message', topic, Buffer.from(String(payload)));
    },
    drop() {
      broker.client.emit('close');
      broker.client.emit('offline');
    },
  };
  return broker;
}

/**
 * A fake fetch: `routes` maps a full URL to { status, body } (or to an Error,
 * thrown as a network failure). Every request is recorded.
 */
export function createFakeFetch(routes = {}) {
  const fake = async (url, options = {}) => {
    fake.requests.push({ url, headers: options.headers ?? {} });
    const route = fake.routes[url];
    if (route instanceof Error) {
      throw route;
    }
    const { status = 200, body = '' } = route ?? { status: 404, body: 'Not found' };
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  fake.routes = routes;
  fake.requests = [];
  return fake;
}

/** The REST routes of a working device. */
export function deviceRoutes(address = DEVICE_ADDRESS, numbers = { main: {} }) {
  return {
    [`${address}/json`]: { body: restJson(numbers) },
    [`${address}/rssi`]: { body: '-67' },
    [`${address}/cpu_temperature`]: { body: '52' },
    [`${address}/statusflow`]: { body: 'Flow finished (14:05:12)' },
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array<object>} [options.devices] devices already created in Gladys
 * @param {object} [options.routes] REST routes of the fake fetch
 * @param {object} [options.timings]
 */
export async function createWorld({
  config = { broker_url: BROKER_URL },
  devices = [],
  routes = {},
  timings,
} = {}) {
  const broker = createFakeBroker();
  const fetch = createFakeFetch(routes);
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    connectMqtt: broker.connect,
    fetch,
    loadClientId: async () => ({ clientId: CLIENT_ID, persisted: true }),
    timings: { discoveryDelayMs: 0, ...timings },
  });
  await gladys.connect();
  await flush();
  return { gladys, broker, fetch, app, hub: app.hub };
}

/** Let the pending promise callbacks and zero-delay timers run. */
export const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** Add the discovered device with that external id, as the user would. */
export async function addDiscovered(world, externalId) {
  const device = world.gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  if (!device) {
    throw new Error(`${externalId} was not discovered`);
  }
  await world.gladys.fake.deviceCreated(device);
  await flush();
  return device;
}

/** Add every discovered device. */
export async function addAll(world) {
  for (const device of [...world.gladys.fake.discoveredDevices]) {
    await addDiscovered(world, device.external_id);
  }
}

/** The last published state of a feature. */
export function lastState(world, featureExternalId) {
  const states = world.gladys.fake.states.filter(
    (s) => s.device_feature_external_id === featureExternalId,
  );
  const last = states[states.length - 1];
  return last === undefined ? undefined : (last.text ?? last.state);
}

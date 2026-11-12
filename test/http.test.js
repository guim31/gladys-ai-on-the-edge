// -----------------------------------------------------------------------------
// REST: the container polls on its own timer (never through onPoll), one
// request after the other, with basic authentication when configured.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraIds, meterIds } from '../src/devices.js';
import {
  DEVICE_ADDRESS,
  addAll,
  createWorld,
  deviceRoutes,
  flush,
  lastState,
} from './helpers/world.js';

const MINUTE = 60_000;

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

async function restWorld(t, { config = {}, routes = deviceRoutes() } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld({
    config: { http_devices: '192.0.2.30', poll_interval: '5', ...config },
    routes,
  });
  t.after(() => world.app.stop());
  await tick(t, 0);
  return {
    ...world,
    camera: cameraIds(world.gladys, 'http:192.0.2.30'),
    meter: (number) => meterIds(world.gladys, `http:192.0.2.30/${number}`),
  };
}

test('REST only: polled at once, discovered, the integration page says connected', async (t) => {
  const world = await restWorld(t, {
    routes: deviceRoutes(DEVICE_ADDRESS, { main: {}, gas: { value: '42.123' } }),
  });
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(
    world.fetch.requests.map((r) => r.url),
    ['json', 'rssi', 'cpu_temperature', 'statusflow'].map((p) => `${DEVICE_ADDRESS}/${p}`),
  );
  assert.deepEqual(
    world.gladys.fake.discoveredDevices.map((d) => d.name),
    ['192.0.2.30', '192.0.2.30 gas', '192.0.2.30 main'],
  );
  const camera = world.gladys.fake.discoveredDevices[0];
  assert.ok(camera.features.some((f) => f.external_id === world.camera.feature('status')));
  assert.ok(world.gladys.fake.discoveredDevices.every((d) => d.should_poll === false));
});

test('the own timer reads the devices, without the core calling onPoll', async (t) => {
  const world = await restWorld(t);
  await addAll(world);
  assert.equal(lastState(world, world.meter('main').feature('index')), 1234.5678);
  assert.equal(lastState(world, world.camera.feature('status')), 'Flow finished');
  assert.equal(lastState(world, world.camera.feature('rssi')), -67);
  assert.equal(lastState(world, world.camera.feature('cpu_temperature')), 52);
  assert.equal(lastState(world, world.camera.feature('online')), 1);

  Object.assign(world.fetch.routes, deviceRoutes(DEVICE_ADDRESS, { main: { value: '1234.7000' } }));
  await tick(t, 4 * MINUTE);
  assert.equal(lastState(world, world.meter('main').feature('index')), 1234.5678);
  await tick(t, 1 * MINUTE);
  assert.equal(lastState(world, world.meter('main').feature('index')), 1234.7);
});

test('a device that stops answering is offline, then back', async (t) => {
  const world = await restWorld(t);
  await addAll(world);
  world.fetch.routes[`${DEVICE_ADDRESS}/json`] = new TypeError('fetch failed');
  await tick(t, 5 * MINUTE);
  assert.equal(lastState(world, world.camera.feature('online')), 0);
  assert.equal(lastState(world, world.meter('main').feature('index')), 1234.5678);
  Object.assign(world.fetch.routes, deviceRoutes());
  await tick(t, 5 * MINUTE);
  assert.equal(lastState(world, world.camera.feature('online')), 1);
});

test('403 before the first round: online, no reading yet', async (t) => {
  const routes = deviceRoutes();
  routes[`${DEVICE_ADDRESS}/json`] = {
    status: 403,
    body: 'Flow not (yet) started: REST API /json not yet available!',
  };
  routes[`${DEVICE_ADDRESS}/statusflow`] = { body: 'Initialization (delayed)' };
  const world = await restWorld(t, { routes });
  assert.deepEqual(
    world.gladys.fake.discoveredDevices.map((d) => d.name),
    ['192.0.2.30'],
  );
  await addAll(world);
  assert.equal(lastState(world, world.camera.feature('online')), 1);
  assert.equal(lastState(world, world.camera.feature('status')), 'Initialization (delayed)');
});

test('basic authentication when the web interface has a password', async (t) => {
  const world = await restWorld(t, {
    config: { http_username: 'admin', http_password: 'p4ss' },
  });
  const expected = `Basic ${Buffer.from('admin:p4ss').toString('base64')}`;
  assert.ok(world.fetch.requests.every((r) => r.headers.Authorization === expected));
});

test('a scan polls again and republishes the discovery', async (t) => {
  const world = await restWorld(t);
  const before = world.fetch.requests.length;
  await world.gladys.fake.scanRequest();
  await flush();
  assert.equal(world.fetch.requests.length, before + 4);
});

test('a configuration saved during a poll: the new devices are polled at once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  let release;
  const world = await createWorld({
    config: { http_devices: '192.0.2.30' },
    routes: deviceRoutes(),
  });
  t.after(() => world.app.stop());
  // Hold the next requests of the old device.
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const hold = world.hub.fetch;
  world.hub.fetch = async (url, options) => {
    if (url.startsWith(DEVICE_ADDRESS)) {
      await gate;
    }
    return hold(url, options);
  };
  const inFlight = world.hub.pollAll();
  Object.assign(world.fetch.routes, deviceRoutes('http://192.0.2.31'));
  await world.gladys.fake.configUpdated({ http_devices: '192.0.2.31' });
  await flush();
  assert.ok(world.fetch.requests.some((r) => r.url === 'http://192.0.2.31/json'));
  release();
  await inFlight;
  await flush();
  assert.deepEqual([...world.hub.cameras.keys()], ['http:192.0.2.31']);
});

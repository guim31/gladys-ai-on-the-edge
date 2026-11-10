// -----------------------------------------------------------------------------
// MQTT: discovery, states, reading errors, leak, LWT and silence, republish.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraIds, meterIds } from '../src/devices.js';
import {
  BROKER_URL,
  addAll,
  announce,
  createWorld,
  flush,
  lastState,
  numberJson,
} from './helpers/world.js';

const MINUTE = 60_000;
const START = Date.UTC(2026, 10, 10, 13, 0);

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

/** A broker with one device that published a round, everything added. */
async function addedWorld(t, config = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: START });
  const world = await createWorld({ config: { broker_url: BROKER_URL, ...config } });
  t.after(() => world.app.stop());
  world.broker.accept();
  announce(world);
  world.broker.send('watermeter/main/json', numberJson());
  await tick(t, 0);
  await addAll(world);
  const camera = cameraIds(world.gladys, 'mqtt:watermeter');
  const meter = meterIds(world.gladys, 'mqtt:watermeter/main');
  return { ...world, camera, meter };
}

test('subscribes to every main topic, never publishes, and reports the link', async (t) => {
  const world = await createWorld({
    config: {
      broker_url: 'mqtt://alice:secret@broker.example:1883',
      main_topics: 'watermeter, gasmeter',
    },
  });
  t.after(() => world.app.stop());
  world.broker.accept();
  await flush();
  assert.deepEqual(world.broker.client.subscriptions, ['watermeter/#', 'gasmeter/#']);
  assert.equal(world.broker.connections[0].url, 'mqtt://broker.example:1883');
  assert.equal(world.broker.connections[0].options.username, 'alice');
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
});

test('a round makes a camera device and a meter device in the Discovery tab', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: START });
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.broker.accept();
  announce(world);
  world.broker.send('watermeter/main/json', numberJson());
  world.broker.send('watermeter/main/value', '1234.5678');
  await tick(t, 0);
  const devices = world.gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['watermeter', cameraIds(world.gladys, 'mqtt:watermeter').device],
      ['watermeter main', meterIds(world.gladys, 'mqtt:watermeter/main').device],
    ],
  );
  const meter = devices[1];
  assert.deepEqual(
    meter.features.map((f) => [f.name, f.category, f.type, f.unit]),
    [
      ['Index du compteur', 'volume-sensor', 'decimal', 'cubicmeter'],
      ['Débit (L/h)', 'volume-sensor', 'decimal', 'liter'],
      ['Fuite probable', 'leak-sensor', 'binary', undefined],
      ['Erreur de lecture', 'input', 'binary', undefined],
      ['État de la lecture', 'text', 'text', undefined],
      ['Dernière lecture', 'text', 'text', undefined],
    ],
  );
  // MQTT has no flow status.
  assert.deepEqual(
    devices[0].features.map((f) => f.external_id.split(':').pop()),
    ['online', 'rssi', 'cpu_temperature'],
  );
});

test('the states of the added devices follow the rounds', async (t) => {
  const world = await addedWorld(t);
  assert.equal(lastState(world, world.meter.feature('index')), 1234.5678);
  // 0.00016 m³/min = 9.6 L/h.
  assert.equal(lastState(world, world.meter.feature('flow')), 9.6);
  assert.equal(lastState(world, world.meter.feature('leak')), 0);
  assert.equal(lastState(world, world.meter.feature('read_error')), 0);
  assert.equal(lastState(world, world.meter.feature('error_text')), 'OK');
  assert.equal(lastState(world, world.meter.feature('last_reading')), '2026-11-10 14:05');
  assert.equal(lastState(world, world.camera.feature('online')), 1);
  assert.equal(lastState(world, world.camera.feature('rssi')), -61);
  assert.equal(lastState(world, world.camera.feature('cpu_temperature')), 47);

  // The same round again changes nothing: no state sent.
  const count = world.gladys.fake.states.length;
  world.broker.send('watermeter/main/json', numberJson());
  await tick(t, 5000);
  assert.equal(world.gladys.fake.states.length, count);

  world.broker.send('watermeter/main/json', numberJson({ value: '1234.6000', rate: '0.0' }));
  await tick(t, 5000);
  assert.equal(lastState(world, world.meter.feature('index')), 1234.6);
  assert.equal(lastState(world, world.meter.feature('flow')), 0);
});

test('a failed round keeps the index and says why', async (t) => {
  const world = await addedWorld(t, { language: 'en' });
  world.broker.send(
    'watermeter/main/json',
    numberJson({ value: '', rate: '', error: 'Rate too high - Read: 1334.5678 - Pre: 1234.5678' }),
  );
  await tick(t, 5000);
  assert.equal(lastState(world, world.meter.feature('index')), 1234.5678);
  assert.equal(lastState(world, world.meter.feature('read_error')), 1);
  assert.equal(lastState(world, world.meter.feature('error_text')), 'Too big a step refused');
  world.broker.send('watermeter/main/json', numberJson({ value: '', rate: '', error: '' }));
  await tick(t, 5000);
  assert.equal(lastState(world, world.meter.feature('error_text')), 'Unreadable digit');
  world.broker.send('watermeter/main/json', numberJson({ value: '1234.6', error: 'no error' }));
  await tick(t, 5000);
  assert.equal(lastState(world, world.meter.feature('read_error')), 0);
  assert.equal(lastState(world, world.meter.feature('index')), 1234.6);
});

test('a probable leak: the index goes up at every round for the chosen hours', async (t) => {
  const world = await addedWorld(t, { leak_hours: '1' });
  let value = 1234.5678;
  const round = async () => {
    value += 0.001;
    world.broker.send('watermeter/main/json', numberJson({ value: value.toFixed(4) }));
    await tick(t, 5 * MINUTE);
  };
  // 55 minutes of flow: not yet.
  for (let i = 0; i < 12; i += 1) {
    await round();
  }
  assert.equal(lastState(world, world.meter.feature('leak')), 0);
  await round();
  assert.equal(lastState(world, world.meter.feature('leak')), 1);
  // A round without a visible change is tolerated.
  world.broker.send('watermeter/main/json', numberJson({ value: value.toFixed(4) }));
  await tick(t, 5 * MINUTE);
  assert.equal(lastState(world, world.meter.feature('leak')), 1);
  // The index stays still for three rounds: the flow stopped.
  for (let i = 0; i < 3; i += 1) {
    world.broker.send('watermeter/main/json', numberJson({ value: value.toFixed(4) }));
    await tick(t, 5 * MINUTE);
  }
  assert.equal(lastState(world, world.meter.feature('leak')), 0);
});

test('no leak detection when set to never', async (t) => {
  const world = await addedWorld(t, { leak_hours: '0' });
  let value = 1234.5678;
  for (let i = 0; i < 40; i += 1) {
    value += 0.01;
    world.broker.send('watermeter/main/json', numberJson({ value: value.toFixed(4) }));
    await tick(t, 5 * MINUTE);
  }
  assert.equal(lastState(world, world.meter.feature('leak')), 0);
});

test('offline on the LWT, and after a silence of three rounds', async (t) => {
  const world = await addedWorld(t);
  world.broker.send('watermeter/connection', 'connection lost');
  await tick(t, 5000);
  assert.equal(lastState(world, world.camera.feature('online')), 0);
  announce(world);
  await tick(t, 5000);
  assert.equal(lastState(world, world.camera.feature('online')), 1);
  await tick(t, 16 * MINUTE);
  assert.equal(lastState(world, world.camera.feature('online')), 0);
});

test('electricity: a kWh index and a power in kW, no leak feature', async (t) => {
  const world = await addedWorld(t, { meter_types: 'main=electricity_kwh' });
  const device = world.gladys.fake.discoveredDevices.find(
    (d) => d.external_id === world.meter.device,
  );
  assert.deepEqual(
    device.features.slice(0, 2).map((f) => [f.category, f.type, f.unit]),
    [
      ['energy-sensor', 'index', 'kilowatt-hour'],
      ['energy-sensor', 'power', 'kilowatt'],
    ],
  );
  assert.ok(!device.features.some((f) => f.external_id.endsWith(':leak')));
  // 0.00016 kWh/min = 0.0096 kW.
  assert.equal(lastState(world, world.meter.feature('flow')), 0.0096);
});

test('a device added in Gladys gets every state again', async (t) => {
  const world = await addedWorld(t);
  const before = world.gladys.fake.states.length;
  await world.gladys.fake.deviceCreated(
    world.gladys.fake.discoveredDevices.find((d) => d.external_id === world.meter.device),
  );
  await flush();
  const resent = world.gladys.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.ok(resent.includes(world.meter.feature('index')));
  assert.ok(resent.includes(world.camera.feature('online')));
});

test('without configuration, the integration page says what to fill in', async () => {
  const world = await createWorld({ config: {} });
  try {
    assert.equal(world.gladys.fake.connectionStatus.connected, false);
    assert.equal(typeof world.gladys.fake.connectionStatus.message, 'object');
    assert.ok(world.gladys.fake.connectionStatus.message.de);
  } finally {
    world.app.stop();
  }
});

// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal cycle (a round every five
// minutes, REST polls), one line when a failure starts and one when it ends,
// never a password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_ADDRESS,
  addAll,
  announce,
  createWorld,
  deviceRoutes,
  flush,
  numberJson,
} from './helpers/world.js';

const MINUTE = 60_000;

/** Capture every log line at the given level and above. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

async function addedWorld(t, config) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld({
    config: {
      broker_url: 'mqtt://alice:hunter2@broker.example:1883',
      http_devices: '192.0.2.30',
      ...config,
    },
    routes: deviceRoutes(),
  });
  t.after(() => world.app.stop());
  world.broker.accept();
  announce(world);
  world.broker.send('watermeter/main/json', numberJson());
  await tick(t, 0);
  await addAll(world);
  return world;
}

test('a normal cycle writes nothing at info level', async (t) => {
  const world = await addedWorld(t);
  const lines = captureLogs(t, 'info');
  let value = 1234.5678;
  for (let i = 0; i < 24; i += 1) {
    value += 0.002;
    announce(world);
    world.broker.send('watermeter/main/json', numberJson({ value: value.toFixed(4) }));
    await tick(t, 5 * MINUTE);
  }
  assert.deepEqual(lines, []);
});

test('failures are told once, their end once, without the password', async (t) => {
  const world = await addedWorld(t);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 3; i += 1) {
    world.broker.drop();
    world.broker.client.emit('error', new Error('connect ECONNREFUSED'));
    world.broker.send('watermeter/main/json', numberJson({ value: '', rate: '', error: '' }));
    world.fetch.routes[`${DEVICE_ADDRESS}/json`] = new TypeError('fetch failed');
    await tick(t, 5 * MINUTE);
  }
  world.broker.accept();
  world.broker.send('watermeter/main/json', numberJson());
  Object.assign(world.fetch.routes, deviceRoutes());
  await tick(t, 5 * MINUTE);
  const text = lines.join('\n');
  assert.equal(lines.filter((l) => /unreachable/.test(l)).length, 1, text);
  assert.equal(lines.filter((l) => /reading failed/.test(l)).length, 1, text);
  assert.equal(lines.filter((l) => /does not answer/.test(l)).length, 1, text);
  assert.match(text, /Connected to the MQTT broker mqtt:\/\/broker\.example:1883/);
  assert.match(text, /readings are valid again/);
  assert.match(text, /answers again/);
  assert.doesNotMatch(text, /hunter2|alice:/);
});

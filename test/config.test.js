import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isConfigured,
  meterTypeOf,
  normalizeAddresses,
  normalizeBrokerUrl,
  normalizeConfig,
  normalizeMeterTypes,
  normalizeTopics,
  safeUrl,
} from '../src/config.js';

test('defaults: the firmware main topic, nothing configured without a broker', () => {
  const config = normalizeConfig({});
  assert.deepEqual(config.main_topics, ['watermeter']);
  assert.equal(config.poll_interval, 5);
  assert.equal(config.leak_hours, 3);
  assert.equal(config.meter_type, 'water_m3');
  assert.equal(config.language, 'fr');
  assert.equal(isConfigured(config), false);
  assert.equal(isConfigured(normalizeConfig({ http_devices: '192.0.2.30' })), true);
  assert.equal(isConfigured(normalizeConfig({ broker_url: '192.0.2.10' })), true);
  assert.equal(isConfigured(normalizeConfig({ broker_url: '192.0.2.10', main_topics: '' })), false);
});

test('addresses, topics and per-number types are cleaned', () => {
  assert.equal(normalizeBrokerUrl('192.0.2.10'), 'mqtt://192.0.2.10');
  assert.equal(normalizeBrokerUrl('http://192.0.2.10'), '');
  assert.deepEqual(normalizeTopics(' /watermeter/, home/gas ; # , watermeter'), [
    'watermeter',
    'home/gas',
  ]);
  assert.deepEqual(
    normalizeAddresses(
      '192.0.2.30, http://user:pw@192.0.2.31:8080/index.html, ftp://x, 192.0.2.30',
    ),
    ['http://192.0.2.30', 'http://192.0.2.31:8080'],
  );
  assert.deepEqual(normalizeMeterTypes('main=water_l, elec: electricity_kwh, x=oil'), {
    main: 'water_l',
    elec: 'electricity_kwh',
  });
  const config = normalizeConfig({ meter_type: 'gas_m3', meter_types: 'elec=electricity_kwh' });
  assert.equal(meterTypeOf(config, 'elec'), 'electricity_kwh');
  assert.equal(meterTypeOf(config, 'main'), 'gas_m3');
  assert.equal(safeUrl('mqtt://alice:secret@broker.example:1883/x'), 'mqtt://broker.example:1883');
});

// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// firmware messages: MQTT (default and named numbers) and REST, every meter
// type, in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BROKER_URL,
  DEVICE_ADDRESS,
  announce,
  createWorld,
  deviceRoutes,
  flush,
  numberJson,
} from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const scenarios = [
  { label: 'water m³', config: {} },
  { label: 'water L, English', config: { meter_type: 'water_l', language: 'en' } },
  { label: 'gas, German', config: { meter_type: 'gas_m3', language: 'de' } },
  { label: 'electricity, Spanish', config: { meter_type: 'electricity_kwh', language: 'es' } },
  { label: 'mixed types', config: { meter_types: 'main=water_m3, elec=electricity_kwh' } },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const world = await createWorld({
      config: {
        broker_url: BROKER_URL,
        main_topics: 'watermeter, home/elec',
        http_devices: '192.0.2.30',
        ...scenario.config,
      },
      routes: deviceRoutes(DEVICE_ADDRESS, { main: {}, elec: { value: '5021.4' } }),
    });
    try {
      world.broker.accept();
      announce(world);
      world.broker.send('watermeter/main/json', numberJson());
      world.broker.send('home/elec/json', numberJson({ value: '5021.4' }));
      await flush();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const devices = world.gladys.fake.discoveredDevices;
      assert.ok(devices.length >= 6, `expected the fixture devices, got ${devices.length}`);

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
            const allowed = table.units_by_category[feature.category];
            if (allowed) {
              assert.ok(
                allowed.includes(feature.unit),
                `${at}: ${feature.unit} not offered for ${feature.category}`,
              );
            }
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
        }
      }
      // Device names are distinct too.
      assert.equal(new Set(devices.map((d) => d.name)).size, devices.length);
    } finally {
      world.app.stop();
    }
  });
}

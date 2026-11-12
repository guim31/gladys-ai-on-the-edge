// -----------------------------------------------------------------------------
// The check_connection action, the get_reading scene action, the widget.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { meterIds } from '../src/devices.js';
import { buildMetersContent } from '../src/widgets.js';
import { BROKER_URL, addAll, announce, createWorld, flush, numberJson } from './helpers/world.js';

async function world(t, config = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const w = await createWorld({ config: { broker_url: BROKER_URL, language: 'en', ...config } });
  t.after(() => w.app.stop());
  w.broker.accept();
  announce(w);
  w.broker.send('watermeter/main/json', numberJson());
  t.mock.timers.tick(0);
  await flush();
  return w;
}

test('check_connection says what is heard', async (t) => {
  const w = await world(t, { main_topics: 'watermeter, gasmeter' });
  const ack = await w.gladys.fake.action('check_connection');
  assert.equal(
    ack.data.message,
    'MQTT mqtt://broker.example:1883: 1 of 2 main topic(s) heard (a device publishes once per round).',
  );
});

test('get_reading: a sentence and values', async (t) => {
  const w = await world(t);
  await addAll(w);
  const device = meterIds(w.gladys, 'mqtt:watermeter/main').device;
  const ack = await w.gladys.fake.sceneAction('get_reading', { device });
  assert.deepEqual(ack.data.outputs, {
    summary: 'watermeter main: 1,234.568 m³, 10 L/h.',
    index: 1234.5678,
    flow: 9.6,
    reading_error: false,
    leak: false,
  });
  w.broker.send('watermeter/main/json', numberJson({ value: '', rate: '', error: '' }));
  await flush();
  const failed = await w.gladys.fake.sceneAction('get_reading', { device });
  assert.equal(
    failed.data.outputs.summary,
    'watermeter main: 1,234.568 m³, 10 L/h. Last reading of watermeter main: Unreadable digit.',
  );
  const unknown = await w.gladys.fake.sceneAction('get_reading', { device: 'nope' });
  assert.match(unknown.data.outputs.summary, /not a meter/);
});

test('the widget lists the added meters, valid for the core', async (t) => {
  const w = await world(t);
  const empty = await w.gladys.fake.widgetGet('meters', { language: 'fr' });
  assert.match(empty.data.content.components[0].text, /Ajoutez d'abord les compteurs/);
  await addAll(w);
  const ack = await w.gladys.fake.widgetGet('meters', { language: 'fr' });
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  assert.deepEqual(content.components[0].items, [
    {
      label: 'watermeter main',
      value: '1\u202f234,568 m³ · 10 L/h',
      icon: 'droplet',
      color: 'neutral',
    },
  ]);
  const hidden = await w.gladys.fake.widgetGet('meters', { settings: { show_flow: false } });
  assert.equal(hidden.data.content.components[0].items[0].value, '1,234.568 m³');
});

test('the widget shows a leak in red, a failed reading in orange', () => {
  const content = buildMetersContent({
    meters: [
      { name: 'Water', meterType: 'water_m3', value: 12.5, flow: 300, failed: false, leak: true },
      {
        name: 'Power',
        meterType: 'electricity_kwh',
        value: 5021,
        flow: 1.25,
        failed: true,
        leak: false,
      },
    ],
    showFlow: true,
    language: 'en',
  });
  assert.deepEqual(
    content.components[0].items.map((i) => [i.value, i.color, i.icon]),
    [
      ['5,021 kWh · 1.25 kW', 'warning', 'zap'],
      ['Leak? 12.5 m³ · 300 L/h', 'danger', 'alert-triangle'],
    ],
  );
});

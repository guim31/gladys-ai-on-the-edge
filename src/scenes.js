// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `get_reading` — the last reading of a meter, as a sentence ready for a
// message ("watermeter meter: 1,234.567 m³, 12 L/h.") and as values a scene can
// use: `index`, `flow`, `reading_error`, `leak`. In the language of the
// configuration (a scene action does not receive the user's).
// -----------------------------------------------------------------------------

import { formatFlow, formatIndex, pick, READING_TEXT } from './texts.js';

export const SCENE_ACTION = {
  GET_READING: 'get_reading',
};

/**
 * @param {import('./hub.js').Hub} hub
 * @param {{ device?: string }} fields
 */
export function getReading(hub, fields = {}) {
  const language = hub.config?.language ?? 'fr';
  const text = pick(READING_TEXT, language);
  const entry = hub.meters().find(({ device }) => device.external_id === fields.device);
  if (!entry) {
    return { summary: text.unknown, index: 0, flow: 0, reading_error: false, leak: false };
  }
  const { device, meter, meterType, leak } = entry;
  const name = device.name || entry.key;
  if (!meter || meter.value === null) {
    return {
      summary: text.noValue(name),
      index: 0,
      flow: 0,
      reading_error: meter?.reading ? meter.reading.error !== 'none' : false,
      leak: false,
    };
  }
  const failed = meter.reading.error !== 'none';
  let summary = text.value(
    name,
    formatIndex(meter.value, meterType, language),
    meter.flow === null ? '' : formatFlow(meter.flow, meterType, language),
  );
  if (failed) {
    summary += text.error(name, hub.statusText(meter.reading, language));
  }
  return {
    summary,
    index: meter.value,
    flow: meter.flow ?? 0,
    reading_error: failed,
    leak: leak === 1,
  };
}

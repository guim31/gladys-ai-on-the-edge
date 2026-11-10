// -----------------------------------------------------------------------------
// AI-on-the-edge-device -> Gladys devices.
//
// - One "camera" device per ESP32-CAM, keyed by its source: `mqtt:<main
//   topic>` or `http:<host[:port]>` (percent-encoded in the external id):
//     online            input/binary, LWT (MQTT) or answering (REST);
//     rssi              signal/integer, Wi-Fi signal in dBm;
//     cpu_temperature   device-temperature-sensor/decimal, °C;
//     status            text/text, the flow status (REST only: MQTT has none).
// - One "meter" device per number of a camera (`<source>/<number>`):
//     index         energy-sensor/index in kWh (electricity, the feature the
//                   Gladys energy monitoring reads), or volume-sensor/decimal
//                   in m³ or L (water, gas);
//     flow          volume-sensor/decimal in L/h (water, gas), or power
//                   energy-sensor/power in kW (electricity);
//     leak          leak-sensor/binary, continuous flow for N hours (water,
//                   gas only);
//     read_error    input/binary, the last round failed;
//     error_text    text/text, what the last round said;
//     last_reading  text/text, the time of the last valid reading.
// Pushed by the container, never polled by the core. Feature keys are
// forever: never renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { DEFAULT_NUMBER } from './aote.js';
import { DEFAULT_METER_NAME, FEATURE_NAMES, pick } from './texts.js';

export const CAMERA_TYPE = 'camera';
export const METER_TYPE = 'meter';

export const MAX_INDEX = 1_000_000_000;
export const MAX_FLOW_L_H = 100_000;
export const MAX_POWER_KW = 1_000;

const part = (text) => encodeURIComponent(text).replace(/\./g, '%2E');

/** The key of a camera: its source, MQTT main topic or REST address host. */
export const cameraKey = (source, id) => `${source}:${id}`;
export const meterKey = (camera, number) => `${camera}/${number}`;

export const cameraIds = (gladys, key) => gladys.externalIds(CAMERA_TYPE, part(key));
export const meterIds = (gladys, key) => gladys.externalIds(METER_TYPE, part(key));

/** The key of a camera or meter external id; null for another type. */
export function keyOf(gladys, externalId, type) {
  const prefix = gladys.externalIds(type, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length);
  if (rest === '' || rest.includes(':')) {
    return null;
  }
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** `mqtt:watermeter/main` -> { camera: 'mqtt:watermeter', number: 'main' }. */
export function splitMeterKey(key) {
  const at = key.lastIndexOf('/');
  return { camera: key.slice(0, at), number: key.slice(at + 1) };
}

/** The feature key of a feature external id. */
export const featureKeyOf = (externalId) => externalId.slice(externalId.lastIndexOf(':') + 1);

export const isElectricity = (meterType) => meterType === 'electricity_kwh';

function featureMaker(ids, language) {
  const names = pick(FEATURE_NAMES, language);
  return (key, fields, nameKey = key) => ({
    name: names[nameKey],
    external_id: ids.feature(key),
    selector: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...fields,
  });
}

/**
 * @param {object} gladys
 * @param {{ key: string, name: string, source: 'mqtt'|'http' }} camera
 * @param {string} language
 */
export function buildCameraDevice(gladys, camera, language) {
  const ids = cameraIds(gladys, camera.key);
  const feature = featureMaker(ids, language);
  const features = [
    feature('online', { category: CAT.INPUT, type: TYPE.SENSOR.BINARY, min: 0, max: 1 }),
    feature('rssi', { category: CAT.SIGNAL, type: TYPE.SIGNAL.QUALITY, min: -120, max: 0 }),
    feature('cpu_temperature', {
      category: CAT.DEVICE_TEMPERATURE_SENSOR,
      type: TYPE.SENSOR.DECIMAL,
      unit: UNIT.CELSIUS,
      min: -40,
      max: 125,
    }),
  ];
  if (camera.source === 'http') {
    features.push(feature('status', { category: CAT.TEXT, type: TYPE.TEXT.TEXT, min: 0, max: 0 }));
  }
  return {
    name: camera.name,
    external_id: ids.device,
    selector: ids.device,
    model: 'AI-on-the-edge-device',
    should_poll: false,
    params: [{ name: 'source', value: camera.key }],
    features,
  };
}

/**
 * @param {object} gladys
 * @param {{ key: string, cameraName: string, number: string, meterType: string }} meter
 * @param {string} language
 */
export function buildMeterDevice(gladys, meter, language) {
  const ids = meterIds(gladys, meter.key);
  const feature = featureMaker(ids, language);
  const electricity = isElectricity(meter.meterType);
  const features = [
    electricity
      ? feature('index', {
          category: CAT.ENERGY_SENSOR,
          type: TYPE.ENERGY_SENSOR.INDEX,
          unit: UNIT.KILOWATT_HOUR,
          min: 0,
          max: MAX_INDEX,
        })
      : feature('index', {
          category: CAT.VOLUME_SENSOR,
          type: TYPE.VOLUME_SENSOR.DECIMAL,
          unit: meter.meterType === 'water_l' ? UNIT.LITER : UNIT.CUBIC_METER,
          min: 0,
          max: MAX_INDEX,
        }),
    electricity
      ? feature(
          'flow',
          {
            category: CAT.ENERGY_SENSOR,
            type: TYPE.ENERGY_SENSOR.POWER,
            unit: UNIT.KILOWATT,
            min: 0,
            max: MAX_POWER_KW,
          },
          'power',
        )
      : feature('flow', {
          category: CAT.VOLUME_SENSOR,
          type: TYPE.VOLUME_SENSOR.DECIMAL,
          unit: UNIT.LITER,
          min: 0,
          max: MAX_FLOW_L_H,
        }),
  ];
  if (!electricity) {
    features.push(
      feature('leak', { category: CAT.LEAK_SENSOR, type: TYPE.SENSOR.BINARY, min: 0, max: 1 }),
    );
  }
  features.push(
    feature('read_error', { category: CAT.INPUT, type: TYPE.SENSOR.BINARY, min: 0, max: 1 }),
    feature('error_text', { category: CAT.TEXT, type: TYPE.TEXT.TEXT, min: 0, max: 0 }),
    feature('last_reading', { category: CAT.TEXT, type: TYPE.TEXT.TEXT, min: 0, max: 0 }),
  );
  const numberName =
    meter.number === DEFAULT_NUMBER ? pick(DEFAULT_METER_NAME, language) : meter.number;
  return {
    name: `${meter.cameraName} ${numberName}`,
    external_id: ids.device,
    selector: ids.device,
    model: 'AI-on-the-edge-device meter',
    should_poll: false,
    params: [
      { name: 'number', value: meter.number },
      { name: 'meter_type', value: meter.meterType },
    ],
    features,
  };
}

/**
 * The flow feature value from the firmware rate (meter units per minute):
 * L/h for water and gas, kW for electricity. Never negative.
 */
export function flowOf(rate, meterType) {
  if (rate === null || rate === undefined) {
    return null;
  }
  const perHour = Math.max(0, rate) * 60;
  if (isElectricity(meterType)) {
    return Math.min(MAX_POWER_KW, Math.round(perHour * 10000) / 10000);
  }
  const liters = meterType === 'water_l' ? perHour : perHour * 1000;
  return Math.min(MAX_FLOW_L_H, Math.round(liters * 10) / 10);
}

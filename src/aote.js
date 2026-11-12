// -----------------------------------------------------------------------------
// Pure: the MQTT topics and the REST payloads of AI-on-the-edge-device, as read
// in the firmware sources (jomjol/AI-on-the-edge-device, code/components:
// jomjol_mqtt/server_mqtt.cpp, jomjol_flowcontroll/ClassFlowMQTT.cpp,
// ClassFlowPostProcessing.cpp, MainFlowControl.cpp; code/include/defines.h).
//
// MQTT, under the main topic M (one per device, `watermeter` by default):
//   M/connection        "connected" / "connection lost" (LWT)
//   M/uptime, M/freeMem, M/wifiRSSI, M/CPUtemp          every round
//   M/fwVersion, M/MAC, M/IP, M/hostname, M/interval    once after connecting
//   M/<number>/json     every round: { value, raw, pre, error, rate, timestamp },
//                       all strings ("default" number: M/json)
//   M/<number>/value, error, rate, ...   the same, field by field (not used:
//                       the json is one consistent message per round)
// REST: GET /json (every number, same objects; 403 before the first round),
// /rssi, /cpu_temperature (plain integers), /statusflow (text).
// -----------------------------------------------------------------------------

export const DEFAULT_NUMBER = 'default';
export const LWT_CONNECTED = 'connected';
export const SYSTEM_FIELDS = ['connection', 'wifiRSSI', 'CPUtemp', 'hostname', 'interval'];

/** The subscription of a main topic. */
export const subscriptions = (mainTopics) => mainTopics.map((topic) => `${topic}/#`);

/**
 * Which device and what a message is about.
 * @param {string[]} mainTopics
 * @param {string} topic
 * @returns {{ main: string, kind: 'system', field: string }
 *   | { main: string, kind: 'number', number: string } | null}
 */
export function parseTopic(mainTopics, topic) {
  // The longest main topic wins: `meter` and `meter/gas` can both be devices.
  const main = mainTopics
    .filter((candidate) => topic.startsWith(`${candidate}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (main === undefined) {
    return null;
  }
  const parts = topic.slice(main.length + 1).split('/');
  if (parts.length === 1) {
    if (parts[0] === 'json') {
      return { main, kind: 'number', number: DEFAULT_NUMBER };
    }
    return SYSTEM_FIELDS.includes(parts[0]) ? { main, kind: 'system', field: parts[0] } : null;
  }
  if (parts.length === 2 && parts[1] === 'json' && parts[0] !== '') {
    return { main, kind: 'number', number: parts[0] };
  }
  return null;
}

const toNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
};

/**
 * One number of a round, as the firmware reports it.
 *   error: 'none'       a valid reading;
 *          'unreadable' a digit could not be read (no value, no message);
 *          'negative'   the plausibility check refused a decreasing value;
 *          'too_high'   the plausibility check refused a too big step;
 *          'other'      any other firmware message.
 * @param {object} record { value, raw, pre, error, rate, timestamp }
 */
export function interpretReading(record) {
  const source = record && typeof record === 'object' ? record : {};
  const value = toNumber(source.value);
  const message = typeof source.error === 'string' ? source.error.trim() : '';
  let error;
  if (/neg\.? rate/i.test(message)) {
    error = 'negative';
  } else if (/rate too high/i.test(message)) {
    error = 'too_high';
  } else if (message === '' || /^no error$/i.test(message)) {
    error = value === null ? 'unreadable' : 'none';
  } else {
    error = 'other';
  }
  return {
    value,
    // Units of the meter per minute.
    rate: toNumber(source.rate),
    raw: typeof source.raw === 'string' ? source.raw.trim() : '',
    error,
    message: error === 'none' ? '' : message,
    timestamp: typeof source.timestamp === 'string' ? source.timestamp.trim() : '',
  };
}

/** The payload of M/<number>/json; null when it is not JSON. */
export function parseNumberJson(payload) {
  try {
    const record = JSON.parse(String(payload));
    return record && typeof record === 'object' && !Array.isArray(record)
      ? interpretReading(record)
      : null;
  } catch {
    return null;
  }
}

/**
 * The body of GET /json: every number of the device.
 * @returns {Map<string, object>|null} number name -> reading
 */
export function parseRestJson(body) {
  let parsed;
  try {
    parsed = JSON.parse(String(body));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const numbers = new Map();
  for (const [name, record] of Object.entries(parsed)) {
    // A number name never holds a slash: it would break the meter ids.
    if (name !== '' && !name.includes('/') && record && typeof record === 'object') {
      numbers.set(name, interpretReading(record));
    }
  }
  return numbers;
}

/** A plain integer answer (/rssi, /cpu_temperature, M/wifiRSSI, M/CPUtemp). */
export function parseInteger(payload) {
  const text = String(payload ?? '').trim();
  return /^-?\d+(\.\d+)?$/.test(text) ? Math.round(Number(text)) : null;
}

/**
 * The flow status without its time ("Flow finished (14:05:12)" -> "Flow
 * finished"): the time changes at every step and says nothing more.
 */
export function cleanStatus(payload) {
  const text = String(payload ?? '')
    .replace(/\s*\(\d{1,2}:\d{2}(:\d{2})?\)\s*$/, '')
    .trim();
  return text.slice(0, 100);
}

/**
 * The firmware timestamp ("2026-11-10T14:05:00+0100", the device's local
 * time) shortened for a text feature: "2026-11-10 14:05".
 */
export function shortTimestamp(timestamp) {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(timestamp ?? '');
  return match ? `${match[1]} ${match[2]}` : '';
}

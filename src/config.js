// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with blanks, strings or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// The kinds of meter a reading can come from: they choose the Gladys feature
// (energy index or volume) and its unit.
export const METER_TYPES = ['water_m3', 'water_l', 'gas_m3', 'electricity_kwh'];
// The manifest selects (decimal values cannot go through a `number` field).
export const POLL_INTERVAL_CHOICES = ['1', '2', '5', '10', '15'];
export const LEAK_HOURS_CHOICES = ['0', '1', '2', '3', '4', '6', '8', '12', '24'];

export const MAX_DEVICES = 20;

export const DEFAULT_CONFIG = {
  broker_url: '',
  username: '',
  password: '',
  tls_insecure: false,
  main_topics: 'watermeter',
  http_devices: '',
  http_username: '',
  http_password: '',
  poll_interval: '5',
  meter_type: 'water_m3',
  meter_types: '',
  leak_hours: '3',
  language: 'fr',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const bool = (value, fallback) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : fallback;
const choice = (value, choices, fallback) => {
  const raw = text(String(value ?? ''));
  return choices.includes(raw) ? Number(raw) : Number(fallback);
};
const list = (value) =>
  text(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '');

/**
 * The broker address, with its scheme: users type `192.0.2.10`,
 * `192.0.2.10:1883` or a full `mqtt://` / `mqtts://` URL.
 * @returns {string} '' when absent or not a broker URL
 */
export function normalizeBrokerUrl(value) {
  const raw = text(value);
  if (raw === '') {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `mqtt://${raw}`;
  try {
    const url = new URL(withScheme);
    return ['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(url.protocol) && url.hostname
      ? withScheme
      : '';
  } catch {
    return '';
  }
}

/**
 * The MQTT main topics, one per device (`watermeter`, `home/gasmeter`): no
 * wildcard, no leading or trailing slash, no duplicate.
 */
export function normalizeTopics(value) {
  const topics = list(value)
    .map((topic) => topic.replace(/^\/+|\/+$/g, ''))
    .filter((topic) => topic !== '' && !/[#+]/.test(topic));
  return [...new Set(topics)].slice(0, MAX_DEVICES);
}

/**
 * The device addresses for the REST API: `192.0.2.30`, `watermeter.local:8080`
 * or `http://192.0.2.30`. Kept as `http://host[:port]`, without path,
 * credentials or trailing slash; https is accepted for a reverse proxy.
 */
export function normalizeAddress(value) {
  const raw = text(value);
  if (raw === '') {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return '';
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

export function normalizeAddresses(value) {
  const addresses = list(value)
    .map(normalizeAddress)
    .filter((address) => address !== '');
  return [...new Set(addresses)].slice(0, MAX_DEVICES);
}

/**
 * Per-number meter types: `main=water_m3, elec=electricity_kwh`. A number
 * missing there takes the default meter type. Unknown types are ignored.
 * @returns {Record<string, string>}
 */
export function normalizeMeterTypes(value) {
  const types = {};
  for (const entry of list(value)) {
    const match = entry.match(/^([^=:]+)[=:]\s*([a-z_0-9]+)$/i);
    if (match && METER_TYPES.includes(match[2].toLowerCase())) {
      types[match[1].trim()] = match[2].toLowerCase();
    }
  }
  return types;
}

/**
 * @param {object} [raw] the values received from Gladys
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  return {
    broker_url: normalizeBrokerUrl(source.broker_url),
    username: text(source.username),
    // A password may legitimately start or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    tls_insecure: bool(source.tls_insecure, false),
    main_topics: normalizeTopics(source.main_topics ?? DEFAULT_CONFIG.main_topics),
    http_devices: normalizeAddresses(source.http_devices),
    http_username: text(source.http_username),
    http_password: typeof source.http_password === 'string' ? source.http_password : '',
    // Minutes.
    poll_interval: choice(
      source.poll_interval,
      POLL_INTERVAL_CHOICES,
      DEFAULT_CONFIG.poll_interval,
    ),
    meter_type: METER_TYPES.includes(source.meter_type)
      ? source.meter_type
      : DEFAULT_CONFIG.meter_type,
    meter_types: normalizeMeterTypes(source.meter_types),
    // Hours, 0 = no leak detection.
    leak_hours: choice(source.leak_hours, LEAK_HOURS_CHOICES, DEFAULT_CONFIG.leak_hours),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

export const usesMqtt = (config) => Boolean(config?.broker_url) && config.main_topics.length > 0;
export const usesHttp = (config) => (config?.http_devices?.length ?? 0) > 0;
export const isConfigured = (config) => usesMqtt(config) || usesHttp(config);

/** The meter type of a number, from the per-number list or the default. */
export const meterTypeOf = (config, number) =>
  config.meter_types[number] ?? config.meter_types[number.toLowerCase()] ?? config.meter_type;

/**
 * An address safe for the logs and the messages: no user name, no password,
 * no path or query string.
 */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '(invalid address)';
  }
}

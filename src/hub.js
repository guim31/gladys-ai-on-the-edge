// -----------------------------------------------------------------------------
// The hub: the MQTT client, the REST polling and everything Gladys sees from
// them — discovered devices, states, connection status.
//
// What the devices say is kept in `cameras` (one entry per ESP32-CAM, with
// its numbers). Every TICK_MS the states of the devices added in Gladys are
// computed from it, and only the changed ones published (publishChangedStates,
// with a heartbeat so a steady index never looks stale).
//
// Leak: a meter whose index went up at every round for N hours. The index
// moves by its last digit only, so a round without a visible change is
// tolerated: the flow stops once the index has not moved for `gap` (three
// rounds, 15 minutes at least).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  LWT_CONNECTED,
  parseInteger,
  parseNumberJson,
  parseTopic,
  shortTimestamp,
  subscriptions,
} from './aote.js';
import { isConfigured, meterTypeOf, safeUrl, usesHttp, usesMqtt } from './config.js';
import {
  CAMERA_TYPE,
  METER_TYPE,
  buildCameraDevice,
  buildMeterDevice,
  cameraIds,
  cameraKey,
  flowOf,
  isElectricity,
  keyOf,
  meterIds,
  meterKey,
  splitMeterKey,
} from './devices.js';
import { createDeviceClient } from './http.js';
import { createIssueLog } from './issues.js';
import { createClient } from './mqtt.js';
import { CHECK_TEXT, MESSAGES, READING_STATUS, pick } from './texts.js';

const logger = createLogger({ name: 'aote-hub' });

export const WIDGET_KEY = 'meters';

const MINUTE = 60_000;

// The firmware default round (5 minutes) and the bounds of a credible one.
const DEFAULT_ROUND_MS = 5 * MINUTE;
const MIN_ROUND_MS = 30_000;
const MAX_ROUND_MS = 6 * 60 * MINUTE;

export const DEFAULT_TIMINGS = {
  tickMs: 5_000,
  // A discovery list that changed is sent again after this quiet time.
  discoveryDelayMs: 5_000,
  // A steady state is published again after that long.
  heartbeatMs: 6 * 60 * MINUTE,
  // An MQTT device silent for that long (or three rounds) is offline, even
  // without its LWT.
  minStaleMs: 15 * MINUTE,
  // A leak stops once the index has not moved for that long (or three rounds).
  minGapMs: 15 * MINUTE,
};

const isOk = (reading) => reading?.error === 'none';

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {() => number} [options.now]
   * @param {Function} [options.connectMqtt] test seam: mqtt.connect
   * @param {typeof fetch} [options.fetch] test seam
   * @param {() => Promise<{ clientId: string }>} options.loadClientId
   * @param {object} [options.timings]
   */
  constructor({ gladys, now = () => Date.now(), connectMqtt, fetch, loadClientId, timings = {} }) {
    this.gladys = gladys;
    this.now = now;
    this.connectMqtt = connectMqtt;
    this.fetch = fetch;
    this.loadClientId = loadClientId;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.config = null;
    this.client = null;
    /** @type {Map<string, object>} camera key -> what the device said */
    this.cameras = new Map();
    this.discoveryKey = '';
    this.widgetKey = '';
    this.discoveryTimer = null;
    this.tickTimer = null;
    this.pollTimer = null;
    this.polling = null;
    this.generation = 0;
  }

  // --- lifecycle --------------------------------------------------------------

  async configure(config) {
    // The SDK calls this again at every reconnection to Gladys: an unchanged
    // configuration keeps the link and what the devices said (online, leak).
    if (this.config && JSON.stringify(config) === JSON.stringify(this.config)) {
      return;
    }
    const generation = ++this.generation;
    this.#stopSources();
    this.config = config;
    this.polling = null;
    this.cameras.clear();
    this.discoveryKey = '';
    if (!isConfigured(config)) {
      await this.#status(false, MESSAGES.notConfigured);
      return;
    }
    this.#startTick();
    if (usesHttp(config)) {
      this.#startPolling();
    }
    if (!usesMqtt(config)) {
      // REST only: each device says itself whether it answers.
      await this.#status(true);
      return;
    }
    const { clientId } = await this.loadClientId();
    if (generation !== this.generation) {
      return;
    }
    logger.info(`Connecting to the MQTT broker ${safeUrl(config.broker_url)}`);
    this.client = createClient({
      url: config.broker_url,
      username: config.username,
      password: config.password,
      clientId,
      tlsInsecure: config.tls_insecure,
      topics: subscriptions(config.main_topics),
      onMessage: (topic, payload, retained) => this.onMessage(topic, payload, retained),
      onState: (state, detail) => this.onLinkState(state, detail),
      ...(this.connectMqtt ? { connect: this.connectMqtt } : {}),
    });
  }

  stop() {
    this.generation += 1;
    this.#stopSources();
    this.polling = null;
    clearTimeout(this.discoveryTimer);
    this.discoveryTimer = null;
  }

  #stopSources() {
    this.client?.stop();
    this.client = null;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  #startTick() {
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) => logger.error(`Update failed: ${err.message}`));
    }, this.timings.tickMs);
    this.tickTimer.unref?.();
  }

  #startPolling() {
    const generation = this.generation;
    const run = () => {
      if (generation === this.generation) {
        this.pollAll().catch((err) => logger.error(`Polling failed: ${err.message}`));
      }
    };
    this.pollTimer = setInterval(run, this.config.poll_interval * MINUTE);
    this.pollTimer.unref?.();
    run();
  }

  async #status(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  async onLinkState(state, detail) {
    const url = safeUrl(this.config.broker_url);
    if (state === 'connected') {
      logger.info(`Connected to the MQTT broker ${url}`);
      await this.#status(true);
      return;
    }
    logger.warn(`MQTT broker ${url}: ${state} (${detail ?? 'no detail'})`);
    await this.#status(false, state === 'refused' ? MESSAGES.refused : MESSAGES.unreachable);
  }

  // --- what the devices say ---------------------------------------------------

  #camera(source, id, address) {
    const key = cameraKey(source, id);
    let camera = this.cameras.get(key);
    if (!camera) {
      camera = {
        key,
        source,
        id,
        address,
        hostname: '',
        online: null,
        rssi: null,
        cpuTemperature: null,
        status: '',
        intervalMin: null,
        observedRoundMs: null,
        lastHeardAt: null,
        numbers: new Map(),
      };
      this.cameras.set(key, camera);
      this.scheduleDiscovery();
    }
    return camera;
  }

  #setOnline(camera, online) {
    if (camera.online === null) {
      // A device first known now (a REST device that does not answer, or
      // answers 403) shows up in the Discovery tab.
      this.scheduleDiscovery();
    } else if (camera.online !== online) {
      logger.info(`${camera.hostname || camera.id}: ${online ? 'back online' : 'offline'}`);
    }
    camera.online = online;
  }

  /**
   * The round interval of a camera, in ms: what it published (MQTT
   * `interval`, sent once after it connects), else the spacing observed
   * between its rounds, else the firmware default (MQTT) or the polling pace
   * (REST), whichever is longer.
   */
  #roundMs(camera) {
    if (camera.intervalMin !== null) {
      return camera.intervalMin * MINUTE;
    }
    const fallback =
      camera.source === 'mqtt' ? DEFAULT_ROUND_MS : this.config.poll_interval * MINUTE;
    return Math.max(camera.observedRoundMs ?? 0, fallback);
  }

  /** A new round of a meter at `now`: learn the spacing of the rounds. */
  #observeRound(camera, meter, now) {
    if (meter.roundAt !== null) {
      const spacing = now - meter.roundAt;
      // Several numbers arrive in the same round: only real spacings count.
      if (spacing >= MIN_ROUND_MS && spacing <= MAX_ROUND_MS) {
        camera.observedRoundMs = spacing;
      }
    }
    meter.roundAt = now;
  }

  /**
   * @param {string} topic
   * @param {Buffer|string} payload
   * @param {boolean} [retained] replayed by the broker at subscription: says
   *   nothing about the device being alive now (except its retained LWT)
   */
  onMessage(topic, payload, retained = false) {
    const message = parseTopic(this.config.main_topics, topic);
    if (!message) {
      return;
    }
    const camera = this.#camera('mqtt', message.main);
    const now = this.now();
    if (retained) {
      // The silence delay starts now for a device only known from the past.
      camera.lastHeardAt ??= now;
    } else {
      camera.lastHeardAt = now;
    }
    const text = String(payload).trim();
    if (message.kind === 'number') {
      const reading = parseNumberJson(payload);
      if (reading) {
        if (!retained) {
          this.#setOnline(camera, true);
        }
        this.applyReading(camera, message.number, reading, { newRound: !retained });
      }
      return;
    }
    switch (message.field) {
      case 'connection':
        this.#setOnline(camera, text === LWT_CONNECTED);
        break;
      case 'wifiRSSI':
        camera.rssi = parseInteger(text);
        break;
      case 'CPUtemp':
        camera.cpuTemperature = parseInteger(text);
        break;
      case 'hostname':
        if (text !== camera.hostname && text.length <= 64) {
          camera.hostname = text;
          this.scheduleDiscovery();
        }
        break;
      case 'interval': {
        const minutes = Number(text);
        camera.intervalMin = Number.isFinite(minutes) && minutes > 0 ? minutes : null;
        break;
      }
    }
  }

  /**
   * One number of a round.
   * @param {object} [options]
   * @param {boolean} [options.newRound] a live round (MQTT); REST tells it by
   *   a new timestamp
   */
  applyReading(camera, number, reading, { newRound = false } = {}) {
    let meter = camera.numbers.get(number);
    if (!meter) {
      meter = {
        number,
        reading: null,
        value: null,
        flow: null,
        timestamp: '',
        flowingSince: null,
        lastIncreaseAt: null,
        roundAt: null,
        roundTimestamp: '',
      };
      camera.numbers.set(number, meter);
      this.scheduleDiscovery();
    }
    const key = meterKey(camera.key, number);
    const name = `${camera.hostname || camera.id} ${number}`;
    const now = this.now();
    if (camera.source === 'http') {
      // A REST poll faster than the rounds reads the same round again.
      newRound = reading.timestamp !== '' && reading.timestamp !== meter.roundTimestamp;
      meter.roundTimestamp = reading.timestamp || meter.roundTimestamp;
    }
    if (newRound) {
      this.#observeRound(camera, meter, now);
    }
    meter.reading = reading;
    if (!isOk(reading)) {
      this.issues.fail(`reading:${key}`, `${name}: reading failed (${reading.error})`);
      logger.debug(`${name}: ${reading.message || reading.error} (raw ${reading.raw})`);
      return;
    }
    this.issues.ok(`reading:${key}`, `${name}: readings are valid again`);
    if (meter.value !== null && reading.value > meter.value) {
      if (meter.flowingSince === null || now - meter.lastIncreaseAt > this.#gapMs(camera)) {
        meter.flowingSince = now;
      }
      meter.lastIncreaseAt = now;
    }
    meter.value = reading.value;
    // No rate on the first round after a boot: the last flow stays.
    meter.flow = flowOf(reading.rate, meterTypeOf(this.config, number)) ?? meter.flow;
    meter.timestamp = shortTimestamp(reading.timestamp) || meter.timestamp;
  }

  #gapMs(camera) {
    return Math.max(this.timings.minGapMs, 3 * this.#roundMs(camera));
  }

  /** 1 when the index went up at every round for the configured hours. */
  leakOf(camera, meter) {
    const hours = this.config.leak_hours;
    if (hours === 0 || meter.flowingSince === null) {
      return 0;
    }
    if (this.now() - meter.lastIncreaseAt > this.#gapMs(camera)) {
      meter.flowingSince = null;
      return 0;
    }
    return meter.lastIncreaseAt - meter.flowingSince >= hours * 60 * MINUTE ? 1 : 0;
  }

  /** Every REST device, one after the other; a poll still running is joined. */
  pollAll() {
    if (this.polling) {
      return this.polling;
    }
    // A poll started under an older configuration stops at its next device,
    // and never writes into the new state.
    const generation = this.generation;
    const config = this.config;
    const run = (async () => {
      try {
        for (const address of config?.http_devices ?? []) {
          if (generation !== this.generation) {
            return;
          }
          await this.#pollOne(address, config, generation);
        }
        if (generation === this.generation) {
          await this.tick();
        }
      } finally {
        if (this.polling === run) {
          this.polling = null;
        }
      }
    })();
    this.polling = run;
    return run;
  }

  async #pollOne(address, config, generation) {
    const client = createDeviceClient({
      address,
      username: config.http_username,
      password: config.http_password,
      ...(this.fetch ? { fetch: this.fetch } : {}),
    });
    let result;
    let failure = null;
    try {
      result = await client.read();
    } catch (err) {
      failure = err;
    }
    if (generation !== this.generation) {
      return;
    }
    const camera = this.#camera('http', new URL(address).host, address);
    if (!failure) {
      this.issues.ok(`http:${address}`, `${address} answers again`);
      camera.lastHeardAt = this.now();
      this.#setOnline(camera, true);
      camera.rssi = result.rssi;
      camera.cpuTemperature = result.cpuTemperature;
      camera.status = result.status;
      for (const [number, reading] of result.numbers ?? []) {
        this.applyReading(camera, number, reading);
      }
      return;
    }
    this.issues.fail(`http:${address}`, `${address} does not answer (${failure.message})`);
    this.#setOnline(camera, false);
  }

  // --- discovery --------------------------------------------------------------

  /** The cameras and meters heard so far, as Gladys devices. */
  discoveredDevices() {
    const language = this.config?.language ?? 'fr';
    const devices = [];
    const cameras = [...this.cameras.values()]
      .filter((camera) => camera.online !== null || camera.numbers.size > 0)
      .sort((a, b) => a.key.localeCompare(b.key));
    for (const camera of cameras) {
      const name = camera.hostname || camera.id;
      devices.push(buildCameraDevice(this.gladys, { ...camera, name }, language));
      for (const number of [...camera.numbers.keys()].sort()) {
        devices.push(
          buildMeterDevice(
            this.gladys,
            {
              key: meterKey(camera.key, number),
              cameraName: name,
              number,
              meterType: meterTypeOf(this.config, number),
            },
            language,
          ),
        );
      }
    }
    return devices;
  }

  scheduleDiscovery() {
    if (this.discoveryTimer) {
      return;
    }
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      this.publishDiscovery().catch(() => {});
    }, this.timings.discoveryDelayMs);
    this.discoveryTimer.unref?.();
  }

  /** The discovered devices; only sent again when the list changed (or forced). */
  async publishDiscovery({ force = false } = {}) {
    if (!this.config) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discoveryKey) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveryKey = key;
      this.issues.ok('discovery', 'Gladys accepts the discovered devices again');
    } catch (err) {
      this.issues.fail('discovery', `Publishing the discovered devices failed: ${err.message}`);
    }
  }

  // --- states -----------------------------------------------------------------

  /** The added devices of a type, with their key. */
  added(type) {
    const list = [];
    for (const device of this.gladys.devices ?? []) {
      const key = keyOf(this.gladys, device.external_id, type);
      if (key !== null) {
        list.push({ key, device });
      }
    }
    return list;
  }

  /** The camera and meter state of a meter key. */
  meterOf(key) {
    const { camera: cameraKeyOfMeter, number } = splitMeterKey(key);
    const camera = this.cameras.get(cameraKeyOfMeter);
    const meter = camera?.numbers.get(number);
    return camera && meter ? { camera, meter } : null;
  }

  /**
   * Compute the states of the added devices, publish what changed.
   * @returns {Promise<void>}
   */
  async tick() {
    if (!isConfigured(this.config)) {
      return;
    }
    const now = this.now();
    const language = this.config.language;
    const states = [];
    for (const camera of this.cameras.values()) {
      // An MQTT device can die without its LWT reaching the broker.
      const staleMs = Math.max(this.timings.minStaleMs, 3 * this.#roundMs(camera));
      if (
        camera.source === 'mqtt' &&
        camera.online === true &&
        camera.lastHeardAt !== null &&
        now - camera.lastHeardAt > staleMs
      ) {
        this.#setOnline(camera, false);
      }
    }
    for (const { key } of this.added(CAMERA_TYPE)) {
      const camera = this.cameras.get(key);
      if (!camera) {
        continue;
      }
      const ids = cameraIds(this.gladys, key);
      if (camera.online !== null) {
        states.push({
          device_feature_external_id: ids.feature('online'),
          state: camera.online ? 1 : 0,
        });
      }
      if (camera.rssi !== null) {
        states.push({ device_feature_external_id: ids.feature('rssi'), state: camera.rssi });
      }
      if (camera.cpuTemperature !== null) {
        states.push({
          device_feature_external_id: ids.feature('cpu_temperature'),
          state: camera.cpuTemperature,
        });
      }
      if (camera.status !== '') {
        states.push({ device_feature_external_id: ids.feature('status'), text: camera.status });
      }
    }
    const widget = [];
    for (const { key } of this.added(METER_TYPE)) {
      const found = this.meterOf(key);
      if (!found) {
        continue;
      }
      const { camera, meter } = found;
      const ids = meterIds(this.gladys, key);
      const meterType = meterTypeOf(this.config, meter.number);
      if (meter.value !== null) {
        states.push({ device_feature_external_id: ids.feature('index'), state: meter.value });
      }
      if (meter.flow !== null) {
        states.push({ device_feature_external_id: ids.feature('flow'), state: meter.flow });
      }
      const leak = isElectricity(meterType) ? 0 : this.leakOf(camera, meter);
      if (!isElectricity(meterType)) {
        states.push({ device_feature_external_id: ids.feature('leak'), state: leak });
      }
      if (meter.reading) {
        states.push(
          {
            device_feature_external_id: ids.feature('read_error'),
            state: isOk(meter.reading) ? 0 : 1,
          },
          {
            device_feature_external_id: ids.feature('error_text'),
            text: this.statusText(meter.reading, language),
          },
        );
      }
      if (meter.timestamp !== '') {
        states.push({
          device_feature_external_id: ids.feature('last_reading'),
          text: meter.timestamp,
        });
      }
      // The flow moves at every round: the widget TTL is enough for it.
      widget.push([key, meter.value, leak, isOk(meter.reading)]);
    }
    await this.#publish(states);
    const widgetKey = JSON.stringify(widget);
    if (widgetKey !== this.widgetKey) {
      this.widgetKey = widgetKey;
      this.requestWidgetRefresh();
    }
  }

  /** The reading status text of the error_text feature. */
  statusText(reading, language) {
    const text = pick(READING_STATUS, language)[reading.error];
    return reading.error === 'other' && reading.message
      ? `${text}: ${reading.message}`.slice(0, 200)
      : text;
  }

  async #publish(states) {
    // Features not added in Gladys are filtered out: the core would only
    // drop them.
    const known = new Set(
      (this.gladys.devices ?? []).flatMap((device) =>
        (device.features ?? []).map((feature) => feature.external_id),
      ),
    );
    const kept = states.filter((state) => known.has(state.device_feature_external_id));
    if (kept.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(kept, { heartbeat: this.timings.heartbeatMs });
      this.issues.ok('states', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed: ${err.message}`);
    }
  }

  /** Everything again: a device was just added or updated in Gladys. */
  async republish() {
    // The SDK already forgot the states of the created or updated device.
    this.widgetKey = '';
    await this.tick();
  }

  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch {
      // Fire-and-forget: a refresh lost while disconnected is caught up by the TTL.
    }
  }

  // --- readers for the action, the scene action and the widget ------------------

  /** The added meters, with their state (null before the first reading). */
  meters() {
    return this.added(METER_TYPE).map(({ key, device }) => {
      const found = this.meterOf(key);
      const meterType = meterTypeOf(this.config, splitMeterKey(key).number);
      return {
        key,
        device,
        meterType,
        meter: found?.meter ?? null,
        leak: found && !isElectricity(meterType) ? this.leakOf(found.camera, found.meter) : 0,
      };
    });
  }

  checkConnection() {
    const text = pick(CHECK_TEXT, this.config?.language);
    if (!isConfigured(this.config)) {
      return text.notConfigured;
    }
    const lines = [];
    if (usesMqtt(this.config)) {
      const state = this.client?.state ?? null;
      if (state === 'refused') {
        lines.push(text.refused);
      } else if (state === 'unreachable') {
        lines.push(text.unreachable);
      } else if (state !== 'connected') {
        lines.push(text.connecting);
      } else {
        const heard = [...this.cameras.values()].filter((c) => c.source === 'mqtt').length;
        lines.push(
          text.mqtt(safeUrl(this.config.broker_url), heard, this.config.main_topics.length),
        );
      }
    }
    if (usesHttp(this.config)) {
      const answering = [...this.cameras.values()].filter(
        (camera) => camera.source === 'http' && camera.online === true,
      ).length;
      lines.push(text.http(answering, this.config.http_devices.length));
    }
    return lines.join(' ');
  }
}

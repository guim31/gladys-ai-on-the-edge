// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys), so index.js stays a few lines and the tests drive the very same
// wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { loadClientId } from './clientId.js';
import { normalizeConfig } from './config.js';
import { Hub } from './hub.js';
import { SCENE_ACTION, getReading } from './scenes.js';
import { MESSAGES } from './texts.js';
import { WIDGET, getMetersWidget } from './widgets.js';

const logger = createLogger({ name: 'aote-app' });

export const ACTION = {
  CHECK_CONNECTION: 'check_connection',
};

/**
 * @param {object} gladys
 * @param {object} [options] test seams: connectMqtt, fetch, loadClientId, now, timings
 * @returns {{ hub: Hub, stop: () => void }}
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new Hub({
    gladys,
    now: options.now,
    connectMqtt: options.connectMqtt,
    fetch: options.fetch,
    loadClientId: options.loadClientId ?? (() => loadClientId()),
    timings: options.timings,
  });

  // --- Discovery: the devices heard on MQTT and the REST devices ---------------
  gladys.onScanRequest(async () => {
    logger.info('Scan requested');
    if (hub.config?.http_devices.length) {
      await hub.pollAll();
    }
    await hub.publishDiscovery({ force: true });
  });

  // --- Read-only devices -------------------------------------------------------
  gladys.onSetValue(async (device, feature) => {
    throw new Error(`${feature.external_id} is read-only`);
  });

  // No core polling: MQTT pushes and the container polls REST on its own
  // timer. Registered anyway, for a device that would have been created with
  // polling: nothing to do.
  gladys.onPoll(async () => {});

  // A device just added or updated in Gladys: the SDK forgot what it had
  // published and the core dropped the states sent before it existed. Send
  // everything now, and refresh the open widgets (its name may have changed).
  const onDeviceChanged = async () => {
    await hub.republish();
    hub.requestWidgetRefresh();
  };
  gladys.onDeviceCreated(onDeviceChanged);
  gladys.onDeviceUpdated(onDeviceChanged);
  gladys.onDeviceDeleted(async () => {
    hub.requestWidgetRefresh();
  });

  // --- Configuration screen action ----------------------------------------------
  gladys.onAction(ACTION.CHECK_CONNECTION, async () => {
    logger.info('Action check_connection');
    return hub.checkConnection();
  });

  // --- Scene action ---------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTION.GET_READING, (fields) => getReading(hub, fields));

  // --- Dashboard widget -----------------------------------------------------------
  gladys.onWidgetGet(WIDGET.METERS, (request) => getMetersWidget(hub, request));

  // --- Configuration -------------------------------------------------------------
  // A configuration saved while the initial getConfig() is in flight wins
  // over the (older) values it returns.
  let configUpdates = 0;
  gladys.onConfigUpdated(async (raw) => {
    configUpdates += 1;
    logger.info('Configuration updated');
    await hub.configure(normalizeConfig(raw));
  });

  // --- Connection lifecycle (the SDK logs the Gladys link itself) -------------
  gladys.on('connected', async () => {
    try {
      const updates = configUpdates;
      const raw = await gladys.getConfig();
      if (updates !== configUpdates) {
        return;
      }
      await hub.configure(normalizeConfig(raw));
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, MESSAGES.publishFailed).catch(() => {});
    }
  });

  return {
    hub,
    stop() {
      hub.stop();
    },
  };
}

// -----------------------------------------------------------------------------
// The REST client of one device: GET /json, /rssi, /cpu_temperature and
// /statusflow, one after the other (the ESP32 web server is small: never
// several requests at once). HTTP basic authentication when the firmware has
// it enabled. The credentials go in a header, never in a logged address.
// -----------------------------------------------------------------------------

import { cleanStatus, parseInteger, parseRestJson } from './aote.js';

export const REQUEST_TIMEOUT_MS = 10_000;

export class HttpError extends Error {
  constructor(status, path) {
    super(`HTTP ${status} on ${path}`);
    this.status = status;
  }
}

/**
 * @param {object} options
 * @param {string} options.address `http://host[:port]`
 * @param {string} [options.username]
 * @param {string} [options.password]
 * @param {typeof fetch} [options.fetch] test seam
 */
export function createDeviceClient({
  address,
  username = '',
  password = '',
  fetch = globalThis.fetch,
}) {
  const headers = {};
  if (username || password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  async function get(path) {
    const response = await fetch(`${address}${path}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new HttpError(response.status, path);
    }
    return body;
  }

  /** The value of an optional endpoint (older firmware), null when absent. */
  async function optional(path, parse) {
    try {
      return parse(await get(path));
    } catch (err) {
      if (err instanceof HttpError && err.status !== 401) {
        return null;
      }
      throw err;
    }
  }

  return {
    /**
     * One full read. Throws when the device does not answer or refuses the
     * credentials; `numbers` is null while the flow is starting (403).
     * @returns {Promise<{ numbers: Map<string, object>|null, rssi: number|null,
     *   cpuTemperature: number|null, status: string }>}
     */
    async read() {
      let numbers = null;
      let starting = false;
      try {
        numbers = parseRestJson(await get('/json'));
        if (numbers === null) {
          throw new Error('/json is not JSON');
        }
      } catch (err) {
        // 403: the flow has not finished its first round since the boot.
        if (!(err instanceof HttpError && err.status === 403)) {
          throw err;
        }
        starting = true;
      }
      const rssi = await optional('/rssi', parseInteger);
      const cpuTemperature = await optional('/cpu_temperature', parseInteger);
      const status = (await optional('/statusflow', cleanStatus)) ?? '';
      return { numbers: starting ? null : numbers, rssi, cpuTemperature, status };
    },
  };
}

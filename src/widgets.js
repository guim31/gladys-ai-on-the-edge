// -----------------------------------------------------------------------------
// The "Meters" dashboard widget: one line per meter added in Gladys, with its
// index (and its flow, unless hidden).
//
// Content budget of the core: one `status` list of 10 lines at most. A line:
// the meter name given in Gladys, the index with its unit, red for a probable
// leak, orange when the last reading failed. Pre-localized from the viewer's
// `language` (the core caches the content per settings, language and units).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { WIDGET_KEY } from './hub.js';
import { formatFlow, formatIndex, pick } from './texts.js';

export const WIDGET = {
  METERS: WIDGET_KEY,
};

export const CONTENT_TTL_SECONDS = 60;
export const MAX_LINES = 10;
const MAX_VALUE = 40;

export const TEXT = {
  en: {
    notConfigured: 'Configure the integration first: MQTT broker or device addresses.',
    noMeter: 'Add the meters to Gladys first (Discovery tab of the integration).',
    noValue: 'No reading yet',
    leak: 'Leak?',
  },
  fr: {
    notConfigured: "Configurez d'abord l'intégration : broker MQTT ou adresses des appareils.",
    noMeter: "Ajoutez d'abord les compteurs à Gladys (onglet Découverte de l'intégration).",
    noValue: 'Aucune lecture',
    leak: 'Fuite ?',
  },
  de: {
    notConfigured: 'Richte zuerst die Integration ein: MQTT-Broker oder Adressen der Geräte.',
    noMeter: 'Füge die Zähler zuerst zu Gladys hinzu (Tab „Erkennung“ der Integration).',
    noValue: 'Noch keine Ablesung',
    leak: 'Leck?',
  },
  es: {
    notConfigured:
      'Configure primero la integración: broker MQTT o direcciones de los dispositivos.',
    noMeter: 'Añada primero los contadores a Gladys (pestaña Descubrimiento de la integración).',
    noValue: 'Sin lectura',
    leak: '¿Fuga?',
  },
};

const ICON = {
  water_m3: 'droplet',
  water_l: 'droplet',
  gas_m3: 'wind',
  electricity_kwh: 'zap',
};

const textContent = (text) => ({
  ttl_seconds: CONTENT_TTL_SECONDS,
  components: [{ type: 'text', variant: 'body', text }],
});

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Pure builder of the widget content.
 * @param {object} input
 * @param {{ name: string, meterType: string, value: number|null, flow: number|null,
 *   failed: boolean, leak: boolean }[]} input.meters
 * @param {boolean} input.showFlow
 * @param {string} input.language
 */
export function buildMetersContent({ meters, showFlow, language }) {
  const text = pick(TEXT, language);
  const lines = [...meters]
    .sort((a, b) => a.name.localeCompare(b.name, language))
    .slice(0, MAX_LINES)
    .map((meter) => {
      let value = text.noValue;
      if (meter.value !== null) {
        value = formatIndex(meter.value, meter.meterType, language);
        if (showFlow && meter.flow !== null) {
          value += ` · ${formatFlow(meter.flow, meter.meterType, language)}`;
        }
      }
      if (meter.leak) {
        value = `${text.leak} ${value}`;
      }
      return {
        label: clip(meter.name, 40),
        value: clip(value, MAX_VALUE),
        icon: meter.leak ? 'alert-triangle' : ICON[meter.meterType],
        color: meter.leak
          ? WIDGET_COLORS.DANGER
          : meter.failed
            ? WIDGET_COLORS.WARNING
            : WIDGET_COLORS.NEUTRAL,
      };
    });
  return { ttl_seconds: CONTENT_TTL_SECONDS, components: [{ type: 'status', items: lines }] };
}

/**
 * The onWidgetGet handler of the meters widget.
 * @param {import('./hub.js').Hub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function getMetersWidget(hub, { settings = {}, language = 'en' } = {}) {
  const text = pick(TEXT, language);
  if (!isConfigured(hub.config)) {
    return textContent(text.notConfigured);
  }
  const meters = hub.meters();
  if (meters.length === 0) {
    return textContent(text.noMeter);
  }
  const showFlow = !(settings.show_flow === false || settings.show_flow === 'false');
  return buildMetersContent({
    meters: meters.map(({ key, device, meterType, meter, leak }) => ({
      name: device.name || key,
      meterType,
      value: meter?.value ?? null,
      flow: meter?.flow ?? null,
      failed: meter?.reading ? meter.reading.error !== 'none' : false,
      leak: leak === 1,
    })),
    showFlow,
    language,
  });
}

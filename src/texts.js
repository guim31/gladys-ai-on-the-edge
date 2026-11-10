// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of Gladys. German
// says "du", Spanish "usted". The language is the one of the configuration
// (a device integration and a scene action do not receive the user's), except
// for the widget, which gets the viewer's.
// -----------------------------------------------------------------------------

export const pick = (table, language) => table[language] ?? table.en;

/** Feature names, frozen when the user adds the device. */
export const FEATURE_NAMES = {
  en: {
    index: 'Meter index',
    flow: 'Flow (L/h)',
    power: 'Power',
    leak: 'Probable leak',
    read_error: 'Reading error',
    error_text: 'Reading status',
    last_reading: 'Last reading',
    online: 'Online',
    rssi: 'Wi-Fi signal',
    cpu_temperature: 'CPU temperature',
    status: 'Flow status',
  },
  fr: {
    index: 'Index du compteur',
    flow: 'Débit (L/h)',
    power: 'Puissance',
    leak: 'Fuite probable',
    read_error: 'Erreur de lecture',
    error_text: 'État de la lecture',
    last_reading: 'Dernière lecture',
    online: 'En ligne',
    rssi: 'Signal Wi-Fi',
    cpu_temperature: 'Température du processeur',
    status: 'État du traitement',
  },
  de: {
    index: 'Zählerstand',
    flow: 'Durchfluss (L/h)',
    power: 'Leistung',
    leak: 'Wahrscheinliches Leck',
    read_error: 'Lesefehler',
    error_text: 'Status der Ablesung',
    last_reading: 'Letzte Ablesung',
    online: 'Online',
    rssi: 'WLAN-Signal',
    cpu_temperature: 'CPU-Temperatur',
    status: 'Ablaufstatus',
  },
  es: {
    index: 'Índice del contador',
    flow: 'Caudal (L/h)',
    power: 'Potencia',
    leak: 'Fuga probable',
    read_error: 'Error de lectura',
    error_text: 'Estado de la lectura',
    last_reading: 'Última lectura',
    online: 'En línea',
    rssi: 'Señal Wi-Fi',
    cpu_temperature: 'Temperatura del procesador',
    status: 'Estado del proceso',
  },
};

/** The name of the "default" number, the only one of most devices. */
export const DEFAULT_METER_NAME = {
  en: 'meter',
  fr: 'compteur',
  de: 'Zähler',
  es: 'contador',
};

/** The reading status text, by kind of error. */
export const READING_STATUS = {
  en: {
    none: 'OK',
    unreadable: 'Unreadable digit',
    negative: 'Decreasing value refused',
    too_high: 'Too big a step refused',
    other: 'Firmware error',
  },
  fr: {
    none: 'OK',
    unreadable: 'Chiffre illisible',
    negative: 'Baisse de l’index refusée',
    too_high: 'Hausse trop forte refusée',
    other: 'Erreur du firmware',
  },
  de: {
    none: 'OK',
    unreadable: 'Unlesbare Ziffer',
    negative: 'Sinkender Wert abgelehnt',
    too_high: 'Zu großer Sprung abgelehnt',
    other: 'Firmware-Fehler',
  },
  es: {
    none: 'OK',
    unreadable: 'Dígito ilegible',
    negative: 'Valor decreciente rechazado',
    too_high: 'Salto demasiado grande rechazado',
    other: 'Error del firmware',
  },
};

/** Connection status of the integration page. */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter an MQTT broker with the main topics, or the addresses of the devices.',
    fr: 'Saisissez un broker MQTT avec les sujets principaux, ou les adresses des appareils.',
    de: 'Gib einen MQTT-Broker mit den Haupt-Topics oder die Adressen der Geräte ein.',
    es: 'Introduzca un broker MQTT con los temas principales, o las direcciones de los dispositivos.',
  },
  unreachable: {
    en: 'The MQTT broker does not answer. Check its address and that it accepts this network.',
    fr: "Le broker MQTT ne répond pas. Vérifiez son adresse et qu'il accepte ce réseau.",
    de: 'Der MQTT-Broker antwortet nicht. Prüfe seine Adresse und ob er dieses Netz zulässt.',
    es: 'El broker MQTT no responde. Compruebe su dirección y que acepte esta red.',
  },
  refused: {
    en: 'The MQTT broker refuses the user name or the password.',
    fr: "Le broker MQTT refuse le nom d'utilisateur ou le mot de passe.",
    de: 'Der MQTT-Broker lehnt den Benutzernamen oder das Passwort ab.',
    es: 'El broker MQTT rechaza el nombre de usuario o la contraseña.',
  },
  publishFailed: {
    en: 'The integration could not start. Restart it from its page.',
    fr: "L'intégration n'a pas pu démarrer. Redémarrez-la depuis sa page.",
    de: 'Die Integration konnte nicht starten. Starte sie auf ihrer Seite neu.',
    es: 'La integración no pudo arrancar. Reiníciela desde su página.',
  },
};

/** The check_connection action. */
export const CHECK_TEXT = {
  en: {
    notConfigured: MESSAGES.notConfigured.en,
    unreachable: MESSAGES.unreachable.en,
    refused: MESSAGES.refused.en,
    connecting: 'Connecting to the broker, try again in a few seconds.',
    mqtt: (url, heard, topics) =>
      `MQTT ${url}: ${heard} of ${topics} main topic(s) heard (a device publishes once per round).`,
    http: (answering, total) => `REST: ${answering} of ${total} device(s) answer.`,
  },
  fr: {
    notConfigured: MESSAGES.notConfigured.fr,
    unreachable: MESSAGES.unreachable.fr,
    refused: MESSAGES.refused.fr,
    connecting: 'Connexion au broker en cours, réessayez dans quelques secondes.',
    mqtt: (url, heard, topics) =>
      `MQTT ${url} : ${heard} sujet(s) principal(aux) entendu(s) sur ${topics} (un appareil publie une fois par cycle).`,
    http: (answering, total) => `REST : ${answering} appareil(s) sur ${total} répond(ent).`,
  },
  de: {
    notConfigured: MESSAGES.notConfigured.de,
    unreachable: MESSAGES.unreachable.de,
    refused: MESSAGES.refused.de,
    connecting: 'Verbindung zum Broker läuft, versuch es in ein paar Sekunden erneut.',
    mqtt: (url, heard, topics) =>
      `MQTT ${url}: ${heard} von ${topics} Haupt-Topic(s) gehört (ein Gerät sendet einmal pro Durchlauf).`,
    http: (answering, total) => `REST: ${answering} von ${total} Gerät(en) antworten.`,
  },
  es: {
    notConfigured: MESSAGES.notConfigured.es,
    unreachable: MESSAGES.unreachable.es,
    refused: MESSAGES.refused.es,
    connecting: 'Conectando con el broker, inténtelo de nuevo en unos segundos.',
    mqtt: (url, heard, topics) =>
      `MQTT ${url}: ${heard} de ${topics} tema(s) principal(es) oído(s) (un dispositivo publica una vez por ciclo).`,
    http: (answering, total) => `REST: ${answering} de ${total} dispositivo(s) responden.`,
  },
};

const UNIT_LABEL = {
  water_m3: 'm³',
  water_l: 'L',
  gas_m3: 'm³',
  electricity_kwh: 'kWh',
};

/** A meter value with its unit, in the language's number format. */
export function formatIndex(value, meterType, language) {
  const digits = meterType === 'water_l' ? 0 : 3;
  return `${value.toLocaleString(language, { maximumFractionDigits: digits })} ${UNIT_LABEL[meterType]}`;
}

/** A flow (L/h) or a power (kW). */
export function formatFlow(value, meterType, language) {
  const unit = meterType === 'electricity_kwh' ? 'kW' : 'L/h';
  const digits = meterType === 'electricity_kwh' ? 2 : 0;
  return `${value.toLocaleString(language, { maximumFractionDigits: digits })} ${unit}`;
}

/** The get_reading scene action sentence. */
export const READING_TEXT = {
  en: {
    unknown: 'This device is not a meter of AI-on-the-edge-device.',
    noValue: (name) => `${name}: no reading yet.`,
    value: (name, index, flow) => `${name}: ${index}` + (flow ? `, ${flow}.` : '.'),
    error: (name, status) => ` Last reading of ${name}: ${status}.`,
  },
  fr: {
    unknown: "Cet appareil n'est pas un compteur d'AI-on-the-edge-device.",
    noValue: (name) => `${name} : aucune lecture pour l'instant.`,
    value: (name, index, flow) => `${name} : ${index}` + (flow ? `, ${flow}.` : '.'),
    error: (name, status) => ` Dernière lecture de ${name} : ${status}.`,
  },
  de: {
    unknown: 'Dieses Gerät ist kein Zähler von AI-on-the-edge-device.',
    noValue: (name) => `${name}: noch keine Ablesung.`,
    value: (name, index, flow) => `${name}: ${index}` + (flow ? `, ${flow}.` : '.'),
    error: (name, status) => ` Letzte Ablesung von ${name}: ${status}.`,
  },
  es: {
    unknown: 'Este dispositivo no es un contador de AI-on-the-edge-device.',
    noValue: (name) => `${name}: aún sin lectura.`,
    value: (name, index, flow) => `${name}: ${index}` + (flow ? `, ${flow}.` : '.'),
    error: (name, status) => ` Última lectura de ${name}: ${status}.`,
  },
};

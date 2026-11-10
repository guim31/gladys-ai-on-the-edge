# AI-on-the-edge-device for Gladys Assistant

Water, gas and electricity meter readings in
[Gladys Assistant](https://gladysassistant.com) from
[AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device): an
ESP32-CAM photographs the meter and reads its digits with a neural network.
This integration gets the readings over MQTT (subscribe only) or by polling the
REST API of the device.

> Developed without the hardware: feedback welcome. The formats were read in
> the firmware sources and tested against a real Mosquitto broker and a fake
> device serving the REST answers.

## Features

- **Meters**, one per number read by a device: index (m³, L, or kWh as an
  energy _Index_), flow in L/h (or power in kW), **Probable leak** (water and
  gas: the index going up at every round for N hours), reading error, reading
  status, time of the last valid reading.
- **Cameras**, one per ESP32-CAM: online (LWT or answering), Wi-Fi signal, CPU
  temperature, flow status (REST).
- MQTT (one main topic per device, several devices) and REST (several
  addresses, optional basic authentication, own timer from 1 to 15 minutes).
- Scene action **Meter reading**, dashboard widget **Meters**, action **Check
  the connection**. Leak and reading error are device features: any scene can
  start on them.
- English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- An ESP32-CAM running AI-on-the-edge-device (version 15 or later
  recommended), reading the meter correctly in its own web interface, and
  either publishing to an MQTT broker Gladys can reach or reachable over HTTP.

## Installation

In Gladys: **Integrations → Install from GitHub**, with this repository's URL
(`https://github.com/guim31/gladys-ai-on-the-edge`), or from the store once
published. Enter the broker and the main topics (or the device addresses), the
meter type, click **Check the connection**, then add the devices from the
Discovery tab. The user documentation is in [`docs/`](docs/en.md) (English,
French, German, Spanish).

## Limitations

- Water and gas indexes are volume sensors: Gladys 5 has no energy dashboard
  for them. Electricity uses the kWh energy index.
- The firmware publishes no flow status over MQTT: that feature exists over
  REST only.
- The leak detection depends on the meter resolution and the round interval.
- Changing a main topic or an address creates new devices.

## Development

Node.js 22+, ESM, no build step. Runtime dependencies:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and [`mqtt`](https://github.com/mqttjs/MQTT.js) (MIT).

```bash
npm install
npm test              # node --test, on the SDK's fake Gladys, a fake broker and a fake fetch
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js          SDK wiring (src/app.js registers the handlers)
src/app.js        handlers: discovery, action, scene action, widget, configuration
src/hub.js        MQTT messages, REST polling, discovery, states, leak, online
src/aote.js       the firmware topics and payloads (pure)
src/http.js       REST client of one device
src/devices.js    camera and meter devices, their features
src/mqtt.js       MQTT client: link states (credentials never logged)
src/scenes.js     "Meter reading" scene action
src/widgets.js    "Meters" widget
src/texts.js      every text, in en/fr/de/es
src/clientId.js   stable MQTT client id, kept in /data
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core.

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device) by
  jomjol and contributors: the MQTT and REST formats were read from its
  sources; no code of the firmware is included.
- Cover: the project's icon (`images/icon/watermeter.svg`, based on a public
  domain drawing by SachaD, freesvg.org).
- [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the
AI-on-the-edge-device project.

## License

[Apache-2.0](LICENSE)

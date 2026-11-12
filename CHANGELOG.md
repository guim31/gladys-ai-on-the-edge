# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Water, gas and electricity meters read by AI-on-the-edge-device, over MQTT
  (one main topic per device) or by polling the REST API (1 to 15 minutes,
  optional basic authentication).
- One meter device per number: index (m³, L, or kWh energy index), flow in L/h
  or power in kW, probable leak (continuous flow for 1 to 24 hours), reading
  error, reading status, last reading.
- One camera device per ESP32-CAM: online, Wi-Fi signal, CPU temperature, flow
  status (REST).
- Scene action "Meter reading", dashboard widget "Meters", action "Check the
  connection".
- English, French, German and Spanish.

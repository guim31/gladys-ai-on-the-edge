# AI-on-the-edge

Liest deinen Wasser-, Gas- oder Stromzähler in Gladys mit
[AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device) ab: Eine ESP32-CAM
fotografiert den Zähler und liest seine Ziffern mit einem neuronalen Netz. Die Integration
erhält die Werte per MQTT oder über die REST-API des Geräts.

> Ohne die Hardware entwickelt: Die Formate stammen aus den Quellen der Firmware und ihrer
> Dokumentation. Rückmeldungen im Gladys-Forum sind willkommen.

## Was du bekommst

- Ein **Zähler**-Gerät pro Zahl, die eine ESP32-CAM liest: Zählerstand (m³, L oder kWh),
  Durchfluss (L/h) oder Leistung (kW), ein Alarm **Wahrscheinliches Leck** (Wasser und Gas), ein
  Lesefehler-Merker, der Status der Ablesung und die Zeit der letzten gültigen Ablesung.
- Ein **Kamera**-Gerät pro ESP32-CAM: online, WLAN-Signal, CPU-Temperatur und, per REST, der
  Ablaufstatus.
- Ein Dashboard-Widget **Zähler**, eine Szenen-Aktion **Zählerstand** und eine Schaltfläche
  **Verbindung prüfen**.

## Bevor du anfängst

- Eine ESP32-CAM mit AI-on-the-edge-device (Version 15 oder neuer empfohlen), eingerichtet und
  mit korrekter Ablesung in ihrer eigenen Weboberfläche.
- **MQTT** (empfohlen): Stell auf der MQTT-Seite des Geräts den Broker ein und notier das
  _MainTopic_ (standardmäßig `watermeter`). Das Gerät sendet nach jedem Durchlauf (standardmäßig
  alle 5 Minuten). Der von Gladys installierte Broker geht: Seine Zugangsdaten stehen auf der
  MQTT-Seite von Gladys.
- **REST**: Das Gerät muss von Gladys per HTTP erreichbar sein. Am Gerät ist nichts einzustellen.

## Konfiguration

- **Adresse des MQTT-Brokers**, **Benutzername**, **Passwort**: der Broker, an den das Gerät
  sendet. Lass die Adresse leer, um nur REST zu nutzen.
- **Haupt-Topics**: das _MainTopic_ jedes Geräts, durch Kommas getrennt (`watermeter,
gasmeter`). Ein Gerät pro Topic.
- **Adressen der Geräte**: für REST die IP-Adresse oder der Name jedes Geräts, durch Kommas
  getrennt. **Benutzer** und **Passwort der Weboberfläche** nur, wenn sie geschützt ist.
- **Lesen alle**: der REST-Takt. Richte ihn nach dem Intervall der Geräte: Öfter lesen bringt
  nichts Neues.
- **Zählertyp**: `water_m3` (Wasser, m³), `water_l` (Wasser, L), `gas_m3` (Gas, m³) oder
  `electricity_kwh` (Strom, kWh). **Typ pro Zahl** gibt einer Zahl eines Geräts, das mehrere
  Zähler liest, einen anderen Typ: `main=water_m3, elec=electricity_kwh`.
- **Wahrscheinliches Leck nach**: von 1 bis 24 Stunden, oder nie.
- **Sprache der Texte**: Namen der Funktionen, Status der Ablesung, Szenen-Sätze.

## Geräte

Öffne den Tab **Erkennung** der Integration, sobald ein Gerät einen Durchlauf gesendet hat
(oder per REST gelesen wurde), und füge die gewünschten Geräte hinzu. **Der Zählertyp wird vor
dem Hinzufügen des Zählers gewählt**: Er legt Funktion und Einheit des Zählerstands fest.

- **Zählerstand**: für Strom ein _Index_ in kWh, die Energiezähler-Funktion, die Gladys kennt.
  Für Wasser und Gas ein Volumensensor in m³ oder L: Gladys 5 hat dafür noch kein
  Energie-Dashboard.
- **Durchfluss (L/h)** oder **Leistung**: aus der Rate, die die Firmware zwischen zwei gültigen
  Ablesungen berechnet.
- **Lesefehler** und **Status der Ablesung**: OK, eine unlesbare Ziffer, ein sinkender Wert oder
  ein zu großer Sprung, von den Plausibilitätsprüfungen der Firmware abgelehnt. Der Zählerstand
  behält seinen letzten gültigen Wert.
- **Online**: das LWT des Geräts per MQTT (oder drei Durchläufe ohne Nachricht), die Antwort des
  Geräts per REST.

## Wahrscheinliches Leck

Nur Wasser und Gas. Steigt der Zählerstand während der gewählten Zeit bei jedem Durchlauf, geht
die Funktion **Wahrscheinliches Leck** auf 1: ein offener Hahn, eine undichte Spülung, ein Rohr.
Ein Durchlauf ohne sichtbare Änderung wird toleriert (ein kleiner Durchfluss bewegt die letzte
Ziffer langsam); der Alarm endet, wenn sich der Zählerstand drei Durchläufe lang nicht bewegt
hat. Nutz ihn als Szenen-Auslöser, wie jeden Lecksensor.

## Szenen

- Auslöser: jede Funktion wie gewohnt, zum Beispiel **Wahrscheinliches Leck** auf 1 oder
  **Lesefehler** auf 1.
- Aktion **Zählerstand**: der letzte Stand eines Zählers als Satz für eine Nachricht
  (`watermeter Zähler: 1.234,568 m³, 10 L/h.`) und als Werte: `index`, `flow`, `reading_error`,
  `leak`.

## Dashboard

Das Widget **Zähler** listet die zu Gladys hinzugefügten Zähler mit ihrem Stand, rot bei einem
wahrscheinlichen Leck und orange, wenn die letzte Ablesung fehlgeschlagen ist. **Durchfluss oder
Leistung anzeigen** blendet den zweiten Wert aus.

## Verbindung prüfen

Die Schaltfläche **Verbindung prüfen** zeigt, ob der Broker antwortet, wie viele Haupt-Topics
gehört wurden und wie viele REST-Geräte antworten.

## Grenzen

- Ohne ESP32-CAM entwickelt: getestet mit den exakten Nachrichtenformaten der Firmware, einem
  echten Mosquitto-Broker und einem nachgebildeten Gerät, das die REST-Antworten liefert.
- Die Firmware sendet den Ablaufstatus nicht per MQTT: Die Funktion **Ablaufstatus** gibt es nur
  per REST.
- Die Leckerkennung hängt von der Auflösung des Zählers (der letzten gelesenen Ziffer) und vom
  Durchlaufintervall des Geräts ab.
- Ein geändertes Haupt-Topic oder eine geänderte Geräteadresse erzeugt neue Geräte in Gladys.
- Nicht mit dem Projekt AI-on-the-edge-device verbunden.

## Fehlerbehebung

- **Nichts im Tab Erkennung**: Warte einen Durchlauf ab (standardmäßig 5 Minuten), prüf das
  _MainTopic_ und ob das Gerät denselben Broker nutzt; per REST, ob Gladys die Geräteadresse
  erreicht.
- **Lesefehler oft auf 1**: Korrigier Ausrichtung und Ziffern in der Weboberfläche des Geräts;
  die Integration meldet nur, was die Firmware liest.
- **Der Broker lehnt Benutzername oder Passwort ab**: Prüf die Zugangsdaten der MQTT-Seite von
  Gladys oder deines Brokers.

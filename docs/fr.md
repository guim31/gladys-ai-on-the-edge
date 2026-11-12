# AI-on-the-edge

Relève votre compteur d'eau, de gaz ou d'électricité dans Gladys avec
[AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device) : une ESP32-CAM
photographie le compteur et lit ses chiffres par réseau de neurones. L'intégration reçoit les
relevés par MQTT ou par l'API REST de l'appareil.

> Développée sans le matériel : les formats viennent des sources du firmware et de sa
> documentation. Vos retours sont les bienvenus sur le forum Gladys.

## Ce que vous obtenez

- Un appareil **compteur** par nombre lu par une ESP32-CAM : son index (m³, L ou kWh), le débit
  (L/h) ou la puissance (kW), une alerte **Fuite probable** (eau et gaz), un indicateur d'erreur
  de lecture, l'état de la lecture et l'heure de la dernière lecture valide.
- Un appareil **caméra** par ESP32-CAM : en ligne, signal Wi-Fi, température du processeur et,
  en REST, l'état du traitement.
- Un widget de tableau de bord **Compteurs**, une action de scène **Relevé d'un compteur** et un
  bouton **Vérifier la connexion**.

## Avant de commencer

- Une ESP32-CAM sous AI-on-the-edge-device (version 15 ou plus récente conseillée), réglée et
  lisant correctement votre compteur dans sa propre interface web.
- **MQTT** (conseillé) : dans la page MQTT de l'appareil, réglez le broker et notez le
  _MainTopic_ (`watermeter` par défaut). L'appareil publie après chaque cycle (toutes les 5
  minutes par défaut). Le broker installé par Gladys convient : ses identifiants sont sur la page
  MQTT de Gladys.
- **REST** : l'appareil doit être joignable en HTTP depuis Gladys. Rien à régler sur l'appareil.

## Configuration

- **Adresse du broker MQTT**, **Nom d'utilisateur**, **Mot de passe** : le broker où publie
  l'appareil. Laissez l'adresse vide pour n'utiliser que REST.
- **Sujets principaux** : le _MainTopic_ de chaque appareil, séparés par des virgules
  (`watermeter, gasmeter`). Un appareil par sujet.
- **Adresses des appareils** : pour REST, l'adresse IP ou le nom de chaque appareil, séparés par
  des virgules. **Utilisateur** et **mot de passe de l'interface web** seulement si elle est
  protégée.
- **Lire toutes les** : le rythme REST. Calquez-le sur l'intervalle des appareils : lire plus
  souvent n'apporte rien de neuf.
- **Type de compteur** : `water_m3` (eau, m³), `water_l` (eau, L), `gas_m3` (gaz, m³) ou
  `electricity_kwh` (électricité, kWh). **Type par nombre** donne un autre type à un nombre d'un
  appareil qui lit plusieurs compteurs : `main=water_m3, elec=electricity_kwh`.
- **Fuite probable après** : de 1 à 24 heures, ou jamais.
- **Langue des textes** : noms des fonctionnalités, état de la lecture, phrases des scènes.

## Appareils

Ouvrez l'onglet **Découverte** de l'intégration dès qu'un appareil a publié un cycle (ou a été
lu en REST), et ajoutez les appareils voulus. **Le type de compteur se choisit avant d'ajouter
le compteur** : il fixe la fonctionnalité et l'unité de l'index.

- **Index** : pour l'électricité, un _Index_ en kWh, la fonctionnalité de compteur d'énergie que
  Gladys connaît. Pour l'eau et le gaz, un capteur de volume en m³ ou en L : Gladys 5 n'a pas
  encore de tableau de bord d'énergie pour eux.
- **Débit (L/h)** ou **Puissance** : d'après le débit que le firmware calcule entre deux
  lectures valides.
- **Erreur de lecture** et **État de la lecture** : OK, un chiffre illisible, une baisse ou une
  hausse trop forte refusée par les contrôles de plausibilité du firmware. L'index garde sa
  dernière valeur valide.
- **En ligne** : le LWT de l'appareil en MQTT (ou trois cycles sans nouvelles), la réponse de
  l'appareil en REST.

## Fuite probable

Eau et gaz seulement. Quand l'index monte à chaque cycle pendant la durée choisie, la
fonctionnalité **Fuite probable** passe à 1 : un robinet resté ouvert, une chasse d'eau qui fuit,
une canalisation. Un cycle sans changement visible est toléré (un petit débit fait avancer le
dernier chiffre lentement) ; l'alerte cesse quand l'index n'a pas bougé pendant trois cycles.
Utilisez-la comme déclencheur de scène, comme tout détecteur de fuite.

## Scènes

- Déclencheur : n'importe quelle fonctionnalité, comme d'habitude, par exemple **Fuite probable**
  à 1 ou **Erreur de lecture** à 1.
- Action **Relevé d'un compteur** : le dernier index d'un compteur en une phrase prête pour un
  message (`watermeter compteur : 1 234,568 m³, 10 L/h.`) et en valeurs : `index`, `flow`,
  `reading_error`, `leak`.

## Tableau de bord

Le widget **Compteurs** liste les compteurs ajoutés à Gladys avec leur index, en rouge pour une
fuite probable et en orange quand la dernière lecture a échoué. **Afficher le débit ou la
puissance** masque la seconde valeur.

## Vérifier la connexion

Le bouton **Vérifier la connexion** indique si le broker répond, combien de sujets principaux
ont été entendus et combien d'appareils REST répondent.

## Limites

- Développée sans ESP32-CAM : testée avec les formats exacts des messages du firmware, un vrai
  broker Mosquitto et un faux appareil qui sert les réponses REST.
- Le firmware ne publie pas l'état du traitement en MQTT : la fonctionnalité **État du
  traitement** n'existe qu'en REST.
- La détection de fuite dépend de la résolution du compteur (le dernier chiffre lu) et de
  l'intervalle des cycles de l'appareil.
- Changer un sujet principal ou l'adresse d'un appareil crée de nouveaux appareils dans Gladys.
- Sans lien avec le projet AI-on-the-edge-device.

## Dépannage

- **Rien dans l'onglet Découverte** : attendez un cycle (5 minutes par défaut), vérifiez le
  _MainTopic_ et que l'appareil utilise le même broker ; en REST, que Gladys joint l'adresse de
  l'appareil.
- **Erreur de lecture souvent à 1** : corrigez l'alignement et les chiffres dans l'interface web
  de l'appareil ; l'intégration ne fait que rapporter ce que lit le firmware.
- **Le broker refuse le nom d'utilisateur ou le mot de passe** : vérifiez les identifiants de la
  page MQTT de Gladys ou de votre broker.

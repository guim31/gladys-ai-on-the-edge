# AI-on-the-edge

Lee su contador de agua, gas o electricidad en Gladys con
[AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device): una ESP32-CAM
fotografía el contador y lee sus cifras con una red neuronal. La integración recibe las
lecturas por MQTT o por la API REST del dispositivo.

> Desarrollada sin el hardware: los formatos proceden de las fuentes del firmware y de su
> documentación. Sus comentarios son bienvenidos en el foro de Gladys.

## Lo que obtiene

- Un dispositivo **contador** por número leído por una ESP32-CAM: su índice (m³, L o kWh), el
  caudal (L/h) o la potencia (kW), una alerta **Fuga probable** (agua y gas), un indicador de
  error de lectura, el estado de la lectura y la hora de la última lectura válida.
- Un dispositivo **cámara** por ESP32-CAM: en línea, señal Wi-Fi, temperatura del procesador y,
  por REST, el estado del proceso.
- Un widget de panel **Contadores**, una acción de escena **Lectura de un contador** y un botón
  **Comprobar la conexión**.

## Antes de empezar

- Una ESP32-CAM con AI-on-the-edge-device (versión 15 o posterior recomendada), configurada y
  leyendo bien su contador en su propia interfaz web.
- **MQTT** (recomendado): en la página MQTT del dispositivo, configure el broker y anote el
  _MainTopic_ (`watermeter` por defecto). El dispositivo publica tras cada ciclo (cada 5 minutos
  por defecto). El broker instalado por Gladys sirve: sus credenciales están en la página MQTT de
  Gladys.
- **REST**: el dispositivo debe ser accesible por HTTP desde Gladys. Nada que configurar en el
  dispositivo.

## Configuración

- **Dirección del broker MQTT**, **Nombre de usuario**, **Contraseña**: el broker donde publica
  el dispositivo. Deje la dirección vacía para usar solo REST.
- **Temas principales**: el _MainTopic_ de cada dispositivo, separados por comas (`watermeter,
gasmeter`). Un dispositivo por tema.
- **Direcciones de los dispositivos**: para REST, la dirección IP o el nombre de cada
  dispositivo, separados por comas. **Usuario** y **contraseña de la interfaz web** solo si está
  protegida.
- **Leer cada**: el ritmo REST. Ajústelo al intervalo de los dispositivos: leer más a menudo no
  aporta nada nuevo.
- **Tipo de contador**: `water_m3` (agua, m³), `water_l` (agua, L), `gas_m3` (gas, m³) o
  `electricity_kwh` (electricidad, kWh). **Tipo por número** da otro tipo a un número de un
  dispositivo que lee varios contadores: `main=water_m3, elec=electricity_kwh`.
- **Fuga probable tras**: de 1 a 24 horas, o nunca.
- **Idioma de los textos**: nombres de las funciones, estado de la lectura, frases de escenas.

## Dispositivos

Abra la pestaña **Descubrimiento** de la integración en cuanto un dispositivo haya publicado un
ciclo (o se haya leído por REST), y añada los dispositivos que desee. **El tipo de contador se
elige antes de añadir el contador**: fija la función y la unidad del índice.

- **Índice**: para la electricidad, un _Índice_ en kWh, la función de contador de energía que
  Gladys conoce. Para el agua y el gas, un sensor de volumen en m³ o L: Gladys 5 aún no tiene
  panel de energía para ellos.
- **Caudal (L/h)** o **Potencia**: a partir del ritmo que el firmware calcula entre dos lecturas
  válidas.
- **Error de lectura** y **Estado de la lectura**: OK, un dígito ilegible, un valor decreciente o
  un salto demasiado grande rechazado por los controles de plausibilidad del firmware. El índice
  conserva su último valor válido.
- **En línea**: el LWT del dispositivo por MQTT (o tres ciclos sin noticias), la respuesta del
  dispositivo por REST.

## Fuga probable

Solo agua y gas. Cuando el índice sube en cada ciclo durante el tiempo elegido, la función
**Fuga probable** pasa a 1: un grifo abierto, una cisterna que pierde, una tubería. Se tolera un
ciclo sin cambio visible (un caudal pequeño mueve la última cifra despacio); la alerta cesa
cuando el índice no se ha movido durante tres ciclos. Úsela como disparador de escena, como
cualquier sensor de fugas.

## Escenas

- Disparador: cualquier función, como de costumbre, por ejemplo **Fuga probable** a 1 o **Error
  de lectura** a 1.
- Acción **Lectura de un contador**: el último índice de un contador en una frase lista para un
  mensaje (`watermeter contador: 1234,568 m³, 10 L/h.`) y en valores: `index`, `flow`,
  `reading_error`, `leak`.

## Panel

El widget **Contadores** lista los contadores añadidos a Gladys con su índice, en rojo para una
fuga probable y en naranja cuando la última lectura falló. **Mostrar el caudal o la potencia**
oculta el segundo valor.

## Comprobar la conexión

El botón **Comprobar la conexión** indica si el broker responde, cuántos temas principales se
han oído y cuántos dispositivos REST responden.

## Límites

- Desarrollada sin ESP32-CAM: probada con los formatos exactos de los mensajes del firmware, un
  broker Mosquitto real y un dispositivo simulado que sirve las respuestas REST.
- El firmware no publica el estado del proceso por MQTT: la función **Estado del proceso** solo
  existe por REST.
- La detección de fugas depende de la resolución del contador (la última cifra leída) y del
  intervalo de los ciclos del dispositivo.
- Cambiar un tema principal o la dirección de un dispositivo crea nuevos dispositivos en Gladys.
- Sin relación con el proyecto AI-on-the-edge-device.

## Solución de problemas

- **Nada en la pestaña Descubrimiento**: espere un ciclo (5 minutos por defecto), compruebe el
  _MainTopic_ y que el dispositivo use el mismo broker; por REST, que Gladys alcance la dirección
  del dispositivo.
- **Error de lectura a menudo a 1**: corrija la alineación y las cifras en la interfaz web del
  dispositivo; la integración solo informa de lo que lee el firmware.
- **El broker rechaza el nombre de usuario o la contraseña**: compruebe las credenciales de la
  página MQTT de Gladys o de su broker.

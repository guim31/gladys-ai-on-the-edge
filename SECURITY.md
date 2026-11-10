# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration stores and sends:

- `/data/client-id`: a random MQTT client id, nothing else. The broker and web
  interface credentials stay in the Gladys configuration; they are never
  logged (addresses are logged without user name or password).
- Network: an MQTT connection to the configured broker (subscribe only, never
  publishes), and HTTP GET requests to the configured device addresses
  (`/json`, `/rssi`, `/cpu_temperature`, `/statusflow`), with HTTP basic
  authentication when set. The devices only offer plain HTTP: use it on a
  trusted network. No cloud service is contacted.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the MQTT broker, and the AI-on-the-edge-device firmware.

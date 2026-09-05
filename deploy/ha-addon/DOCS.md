# MyBabyNotes add-on

MyBabyNotes is a two-parent baby tracker: feeds, diapers, sleep, meds, shift
handoffs, and live sync between phones. This add-on puts it in your Home
Assistant sidebar via ingress — everyone in the household sees the panel, and
HA's own login protects it at the door.

## Modes

### `local` (default)

Runs a complete MyBabyNotes instance on this Home Assistant box. All state
(the SQLite database and generated secrets) lives in the add-on's private
`/data`, so it rides Home Assistant backups automatically.

- First visit: create the first account — that account claims the instance
  and becomes a parent. Invite your partner/caregivers from Settings.
- Pair it with the Mosquitto add-on for sensors and automations: in
  MyBabyNotes → Settings → Home Assistant, use host `core-mosquitto` and a
  broker user you created in Mosquitto. See the project's
  [Home Assistant guide](https://github.com/straplocked/mybabynotes/blob/main/docs/home-assistant.md).

### `remote`

The add-on becomes a thin proxy that shows an **existing** MyBabyNotes
instance (e.g. one on your NAS) in the sidebar. Set `remote_url` to that
instance's address, like `http://192.168.1.10:3500`.

- You'll log into MyBabyNotes once inside the panel — ingress authenticates
  your Home Assistant user at the perimeter, and MyBabyNotes still runs its
  own accounts behind it.
- The remote instance must run MyBabyNotes v1.1 or newer (the release that
  made the web app path-prefix safe). Older builds will render a blank page
  under ingress.

## The direct port

The optional port mapping (disabled by default) exposes the instance directly
on your LAN. Inside the ingress panel the installable-app features (add to
home screen, push notifications) are deliberately off; phones that want the
full PWA should use the direct port (or your existing instance's address in
remote mode).

## Options

| Option | Meaning |
| --- | --- |
| `mode` | `local` (run MyBabyNotes here) or `remote` (proxy an existing instance) |
| `remote_url` | Remote mode only: the instance's base URL, no trailing slash |

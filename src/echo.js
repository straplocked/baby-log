// Realtime layer: Laravel Echo over Reverb (Pusher protocol), same-origin
// through the nginx /app websocket proxy. The server broadcasts a lightweight
// HouseholdTouched poke; the client reacts by pulling /api/state — one sync
// path whether the trigger was a socket, a poll, or a reconnect.
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher

const REVERB_KEY = 'babylog-local-key'

let echo = null

export function startEcho(token, householdId, { onPoke, onConnect }) {
  stopEcho()
  const port = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80)
  echo = new Echo({
    broadcaster: 'reverb',
    key: REVERB_KEY,
    wsHost: window.location.hostname,
    wsPort: port,
    wssPort: port,
    forceTLS: window.location.protocol === 'https:',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: '/api/broadcasting/auth',
    auth: { headers: { Authorization: 'Bearer ' + token } },
  })
  echo.private('household.' + householdId).listen('HouseholdTouched', onPoke)
  // every (re)connect is a chance we missed pokes — resync
  echo.connector.pusher.connection.bind('connected', onConnect)
  return echo
}

export function stopEcho() {
  if (echo) { echo.disconnect(); echo = null }
}

export function socketId() {
  return echo ? echo.socketId() : undefined
}

export function isEchoConnected() {
  return echo?.connector?.pusher?.connection?.state === 'connected'
}

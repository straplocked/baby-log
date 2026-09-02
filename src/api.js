// Thin client for the Laravel API. Same-origin /api (nginx proxies to the api container).
import { socketId } from './echo'

const TOKEN_KEY = 'babylog:token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = t => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
      // lets the server broadcast toOthers() so we don't get poked by our own writes
      ...(socketId() ? { 'X-Socket-ID': socketId() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.message || res.statusText)
    err.status = res.status
    err.errors = data.errors
    throw err
  }
  return res.json()
}

export const api = {
  register: b => call('/register', { method: 'POST', body: b }), // {name, email, password, invite?}
  login: b => call('/login', { method: 'POST', body: b }),
  logout: () => call('/logout', { method: 'POST' }),
  state: since => call('/state?since=' + (since || 0)),
  setBaby: b => call('/baby', { method: 'POST', body: b }),
  invite: email => call('/invite', { method: 'POST', body: { email } }),
  saveSettings: settings => call('/settings', { method: 'POST', body: settings }),
  pushSubscribe: b => call('/push/subscribe', { method: 'POST', body: b }), // {endpoint, keys:{p256dh,auth}, tz}
  pushUnsubscribe: endpoint => call('/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  saveNotifyPrefs: prefs => call('/notify-prefs', { method: 'POST', body: prefs }),
  pushEntries: entries => call('/entries', { method: 'POST', body: { entries } }),
  shiftRequest: note => call('/shifts/request', { method: 'POST', body: { note } }),
  shiftAccept: (plan, until) => call('/shifts/accept', { method: 'POST', body: { plan, until } }),
  shiftPlan: plan => call('/shifts/plan', { method: 'POST', body: { plan } }),
  shiftHandback: note => call('/shifts/handback', { method: 'POST', body: { note } }),
}

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
  forgotPassword: email => call('/forgot-password', { method: 'POST', body: { email } }), // {sent, reason?}
  resetPassword: b => call('/reset-password', { method: 'POST', body: b }), // {token, email, password}
  logout: () => call('/logout', { method: 'POST' }),
  accountProfile: name => call('/account/profile', { method: 'POST', body: { name } }),
  accountEmail: b => call('/account/email', { method: 'POST', body: b }), // {email, password: current}
  accountPassword: b => call('/account/password', { method: 'POST', body: b }), // {current_password, password}
  state: since => call('/state?since=' + (since || 0)),
  setBaby: b => call('/baby', { method: 'POST', body: b }),
  // create ({name, birthdate?}) or update ({id, name, ...}) one child; archive via {archived}
  setChild: b => call('/children', { method: 'POST', body: b }),
  invite: (email, role) => call('/invite', { method: 'POST', body: { email, ...(role ? { role } : {}) } }), // role: 'parent' | 'caregiver'
  revokeInvite: email => call('/invite/revoke', { method: 'POST', body: { email } }),
  removeMember: userId => call('/household/remove-member', { method: 'POST', body: { user_id: userId } }),
  saveSettings: settings => call('/settings', { method: 'POST', body: settings }),
  pushSubscribe: b => call('/push/subscribe', { method: 'POST', body: b }), // {endpoint, keys:{p256dh,auth}, tz}
  pushUnsubscribe: endpoint => call('/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  saveNotifyPrefs: prefs => call('/notify-prefs', { method: 'POST', body: prefs }),
  pushEntries: entries => call('/entries', { method: 'POST', body: { entries } }),
  timerStart: (type, babyId) => call('/timer/start', { method: 'POST', body: { type, ...(babyId != null ? { baby_id: babyId } : {}) } }), // baby_id absent → primary child
  timerStop: () => call('/timer/stop', { method: 'POST' }),
  shiftRequest: note => call('/shifts/request', { method: 'POST', body: { note } }),
  shiftAccept: (plan, until, untilAt) => call('/shifts/accept', { method: 'POST', body: { plan, until, until_at: untilAt } }), // until_at: ms epoch or null
  shiftPlan: plan => call('/shifts/plan', { method: 'POST', body: { plan } }),
  shiftHandback: note => call('/shifts/handback', { method: 'POST', body: { note } }),
}

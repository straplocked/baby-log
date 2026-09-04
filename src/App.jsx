import React from 'react'
import { S } from './s'
import Duck from './Duck'
import { api, getToken, setToken } from './api'
import { startEcho, stopEcho, isEchoConnected } from './echo'
import { pushSupported, pushSubscription, subscribePush, deviceTz } from './push'
import { getFx, setFx, initFx, isDark, askTiltPermission, reduceMotion } from './fx'

// ── domain constants (from design/Baby Log.dc.html) ──────────────────────────
const TYPES = [
  { key: 'bottle', label: 'Bottle',  icon: 'local_drink',           color: 'oklch(0.60 0.075 250)', detail: 'amount' },
  { key: 'nurse',  label: 'Nursing', icon: 'child_care',            color: 'oklch(0.60 0.075 350)', detail: 'side' },
  { key: 'pump',   label: 'Pump',    icon: 'opacity',               color: 'oklch(0.60 0.075 300)', detail: 'amount' },
  { key: 'wet',    label: 'Wet',     icon: 'baby_changing_station', color: 'oklch(0.60 0.075 210)' },
  { key: 'dirty',  label: 'Dirty',   icon: 'baby_changing_station', color: 'oklch(0.60 0.075 60)' },
  { key: 'both',   label: 'Both',    icon: 'baby_changing_station', color: 'oklch(0.60 0.075 130)' },
  { key: 'sleep',  label: 'Sleep',   icon: 'bedtime',               color: 'oklch(0.60 0.075 25)', detail: 'dur' },
  { key: 'bath',   label: 'Bath',    icon: 'bathtub',               color: 'oklch(0.60 0.075 195)' },
  { key: 'meds',   label: 'Meds',    icon: 'medication',            color: 'oklch(0.60 0.075 150)' },
]
const T = k => TYPES.find(t => t.key === k) || TYPES[0]
const FEEDS = ['bottle', 'nurse']
const DIAPERS = ['wet', 'dirty', 'both']
// trackers a household can switch off — feeds are the app's spine and stay on
const TRACKS = [
  { key: 'pump',    label: 'Pump',    types: ['pump'] },
  { key: 'diapers', label: 'Diapers', types: DIAPERS },
  { key: 'sleep',   label: 'Sleep',   types: ['sleep'] },
  { key: 'bath',    label: 'Bath',    types: ['bath'] },
  { key: 'meds',    label: 'Meds',    types: ['meds'] },
]
// "since last …" cards for the Now screen. `track` gates a card on its tracker
// being on; feeds has none (always available). Order here is the display order.
const WIDGETS = [
  { key: 'feeds',   keys: FEEDS,     label: 'Fed',    icon: 'local_drink',           color: 'oklch(0.60 0.075 250)' },
  { key: 'pump',    keys: ['pump'],  label: 'Pumped', icon: 'opacity',               color: 'oklch(0.60 0.075 300)', track: 'pump' },
  { key: 'diapers', keys: DIAPERS,   label: 'Diaper', icon: 'baby_changing_station', color: 'oklch(0.60 0.075 210)', track: 'diapers' },
  { key: 'sleep',   keys: ['sleep'], label: 'Slept',  icon: 'bedtime',               color: 'oklch(0.60 0.075 25)',  track: 'sleep' },
  { key: 'bath',    keys: ['bath'],  label: 'Bath',   icon: 'bathtub',               color: 'oklch(0.60 0.075 195)', track: 'bath' },
  { key: 'meds',    keys: ['meds'],  label: 'Meds',   icon: 'medication',            color: 'oklch(0.60 0.075 150)', track: 'meds' },
]
// the Now grid before anyone customized it — matches the original fixed four
const DEFAULT_WIDGETS = ['feeds', 'diapers', 'sleep', 'bath']
// age-typical ranges, distilled from docs/feeding-patterns.md — [max age in weeks, range]
const WAKE_NORMS = [
  [4, '30–90m'], [13, '60–90m'], [17, '75m–2h'], [22, '1.5–2.5h'], [30, '2–3h'],
  [43, '2.5–3.5h'], [61, '3–4h'], [104, '4–6h'], [999, '5–6h'],
]
const FEED_NORMS = [
  [4, 'every 1–3h'], [13, 'every 2–4h'], [26, 'every 2.5–4h'],
  [39, 'every 3–4h plus starting solids'], [52, 'every 4–5h plus meals'],
  [999, '3 meals plus snacks, milk alongside'],
]
const normFor = (norms, weeks) => (norms.find(([max]) => weeks < max) || norms[norms.length - 1])[1]
// feeds closer together than this are one cluster-feeding session, not a new rhythm beat
const CLUSTER_GAP = 45 * 60000
const sessionStarts = ts => { // ts ascending → first feed of each session
  const out = []
  for (let i = 0; i < ts.length; i++) if (i === 0 || ts[i] - ts[i - 1] > CLUSTER_GAP) out.push(ts[i])
  return out
}
// duration quick-select: a few presets, and dragging a chip up/down scrubs a
// custom value along this ladder — fine steps for short naps, coarser as hours stack
const DUR_LADDER = (() => {
  const a = []
  for (let v = 5; v < 60; v += 5) a.push(v)
  for (let v = 60; v < 180; v += 15) a.push(v)
  for (let v = 180; v <= 720; v += 30) a.push(v)
  return a
})()
// ounces run in halves — the same 0.5 steps the old chip row offered, just scrubbable
const OZ_LADDER = Array.from({ length: 24 }, (_, i) => (i + 1) / 2)
// ml runs in 10s and spans the same range as the oz ladder (~⅓–12 oz)
const ML_LADDER = Array.from({ length: 36 }, (_, i) => (i + 1) * 10)
// ── units: amounts are STORED AND SYNCED IN OZ, always ──────────────────────
// The household 'unit' setting only changes what people see and type; ml
// exists at the edges (chips + display) and converts right back to oz.
const ML_PER_OZ = 29.5735
// display: nearest 5 ml reads like the nursery convention (4 oz → 120, not 118.294)
const ozToMl = oz => Math.round(oz * ML_PER_OZ / 5) * 5
// storage: back to oz at 2 decimals — 120 ml → 4.06 oz → 120 ml round-trips
const mlToOz = ml => Math.round(ml / ML_PER_OZ * 100) / 100
// every scrubbable chip kind: a few tap presets, and the ladder a drag walks along
const SCRUB = {
  dur:  { presets: [30, 45, 90],      ladder: DUR_LADDER },
  mins: { presets: [10, 20, 30],      ladder: DUR_LADDER },
  oz:   { presets: [3, 4, 5],         ladder: OZ_LADDER },
  ml:   { presets: [90, 120, 150],    ladder: ML_LADDER }, // the oz presets' conventional twins
}
const ladderIdx = (ladder, v) => {
  let best = 0
  for (let i = 1; i < ladder.length; i++) if (Math.abs(ladder[i] - v) < Math.abs(ladder[best] - v)) best = i
  return best
}
const OLIVE = 'var(--accent)'
const DAY = 86400000
const ME_COLOR = '#7A93B5'
const PARTNER_COLOR = 'var(--accent)'

// ── household theme (accent + background) ────────────────────────────────────
// Every accent keeps olive's exact oklch lightness/chroma ladder (main ≈0.61/0.073,
// deep ≈0.43/0.054, hover ≈0.56/0.069) so contrast holds at any hue; backgrounds
// stay at cream's ≈0.97 lightness so ink text always reads.
const THEME_ACCENTS = {
  olive: { label: 'Olive', accent: '#7C8C5A', rgb: '124,140,90', deep: '#4A5533', hover: '#6B7A4C' },
  clay: { label: 'Clay', accent: '#AB7663', rgb: '171,118,99', deep: '#6A4639', hover: '#966554' },
  rose: { label: 'Rose', accent: '#AB727E', rgb: '171,114,126', deep: '#6A434C', hover: '#96626D' },
  plum: { label: 'Plum', accent: '#9E759A', rgb: '158,117,154', deep: '#61455E', hover: '#8A6486' },
  sea: { label: 'Sea', accent: '#4A919D', rgb: '74,145,157', deep: '#275860', hover: '#3C7E89' },
  denim: { label: 'Denim', accent: '#6B85B1', rgb: '107,133,177', deep: '#3E506E', hover: '#5B749C' },
}
const THEME_BGS = {
  cream: { label: 'Cream', bg: '#FAF6EF', rgb: '250,246,239' },
  blush: { label: 'Blush', bg: '#FDF4F3', rgb: '253,244,243' },
  mist: { label: 'Mist', bg: '#F1F8FD', rgb: '241,248,253' },
  sage: { label: 'Sage', bg: '#F4F8F1', rgb: '244,248,241' },
  lilac: { label: 'Lilac', bg: '#F9F5FC', rgb: '249,245,252' },
}
// dark counterparts keep each background's hue at ≈0.23 lightness, so the
// household's tint survives the flip; neutrals flip in styles.css (html.dark)
const THEME_BGS_DARK = {
  cream: { bg: '#1E1B16', rgb: '30,27,22' },
  blush: { bg: '#211A1B', rgb: '33,26,27' },
  mist: { bg: '#171C20', rgb: '23,28,32' },
  sage: { bg: '#191D16', rgb: '25,29,22' },
  lilac: { bg: '#1D1A21', rgb: '29,26,33' },
}
let appliedThemeSig = null
function applyTheme(theme) {
  const a = THEME_ACCENTS[theme?.accent] || THEME_ACCENTS.olive
  const bKey = THEME_BGS[theme?.bg] ? theme.bg : 'cream'
  const dark = isDark()
  const b = dark ? THEME_BGS_DARK[bKey] : THEME_BGS[bKey]
  const sig = a.accent + b.bg
  if (appliedThemeSig === sig) return
  appliedThemeSig = sig
  const el = document.documentElement
  el.classList.toggle('dark', dark)
  el.style.colorScheme = dark ? 'dark' : 'light'
  const r = el.style
  r.setProperty('--accent', a.accent)
  r.setProperty('--accent-rgb', a.rgb)
  // accent text roles re-derive against the flipped neutrals: "deep" must be
  // the readable end, so in dark it mixes toward cream instead of black
  r.setProperty('--accent-deep', dark ? `color-mix(in oklab, ${a.accent} 58%, #F2EDE2)` : a.deep)
  r.setProperty('--accent-hover', dark ? `color-mix(in oklab, ${a.accent} 84%, #14120F)` : a.hover)
  r.setProperty('--accent-text', dark ? `color-mix(in oklab, ${a.accent} 68%, #F2EDE2)` : `color-mix(in oklab, ${a.accent} 74%, #26231D)`)
  r.setProperty('--bg', b.bg)
  r.setProperty('--bg-rgb', b.rgb)
  // there are light + dark media-split tags (index.html); the browser honors
  // whichever matches the OS, so write the household tint to all of them
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = b.bg })
}

// ── local-first persistence (per-device cache; server is the shared log) ─────
const STORE_KEY = 'babylog:v2'
const PERSIST = ['screen', 'authMode', 'entries', 'babyName', 'nameField', 'inviteField', 'age',
  'me', 'partner', 'invitePending', 'inviteCode', 'inviteMailed', 'onDutyUserId', 'serverShift', 'dismissedShiftId',
  'outbox', 'lastSync', 'plan', 'until', 'handbackNote', 'settings', 'settingsDirty', 'babyBirthdate',
  'notifyPrefs', 'notifyPrefsDirty', 'vapidKey', 'activeTimer', 'timerSide']

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null } catch { return null }
}
const numify = d => (typeof d === 'string' && /^\d+(\.\d+)?$/.test(d)) ? Number(d) : d
// detail strings can carry extras: bottle "4 breastmilk", nurse "Left · 30m", pump "3 · 15m"
const dSplit = d => {
  d = d == null ? '' : String(d)
  const lead = /^([\d.]+)\s*(m\b)?/.exec(d)
  const mm = /(\d+)\s*m\b/.exec(d)
  return {
    n: lead && lead[1] && !lead[2] ? Number(lead[1]) : null,
    mins: mm ? Number(mm[1]) : null,
    side: /left/i.test(d) ? 'Left' : /right/i.test(d) ? 'Right' : /both/i.test(d) ? 'Both' : null,
    milk: /breast/i.test(d) ? 'breastmilk' : /formula/i.test(d) ? 'formula' : null,
  }
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'e' + Date.now() + Math.random().toString(36).slice(2, 9))
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const csvEsc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }

const Sym = ({ style, children }) => (
  <span style={{ fontFamily: "'Material Symbols Rounded'", lineHeight: 1, ...style }}>{children}</span>
)

// queued-but-unsynced marker: a dimmed dot on a row's sub line, same register
// as the header's "· offline" — it clears the moment the outbox flushes
const PendingDot = () => (
  <span style={S('display:inline-block;width:5px;height:5px;border-radius:999px;background:rgba(38,35,29,0.30);margin-left:6px;vertical-align:1px')} />
)

export default class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      screen: 'splash', authMode: 'signup', tick: 0,
      authName: '', authEmail: '', authPassword: '', authInvite: '', authError: null, authBusy: false,
      inviteCode: null, inviteMailed: false,
      forgotOpen: false, forgotEmail: '', forgotBusy: false, forgotResult: null, // null | 'sent' | 'unconfigured' | 'error'
      resetToken: null, resetEmail: '', resetPw: '', resetBusy: false, resetError: null, // ?reset=<token>&email= flow
      entries: [], // includes tombstones ({deleted:true}); views filter them
      sheet: false, sel: null, offset: 0, pickedT: null, detail: null, detail2: null, editId: null, historyDay: null, scrubDrag: null,
      activeTimer: null, timerSide: null, manualDur: false,
      sheetDragY: 0, sheetDragging: false, sheetTall: false, sheetIn: false, sheetLeaving: false,
      toast: null, toastLeaving: false, undoAction: null,
      babyName: '', nameField: '', inviteField: '', age: '2–8 wks', babyBirthdate: null, dobField: '',
      me: null, partner: null, invitePending: null,
      onDutyUserId: null, serverShift: null, dismissedShiftId: null,
      outbox: [], lastSync: 0, offline: false,
      settings: { tracking: {}, dismissed: [] }, settingsDirty: false,
      exportRange: 'all', // ephemeral — resets to Everything each load on purpose
      // account editing (settings) — ephemeral, seeded from me/baby when the screen opens
      acctName: '', acctBabyName: '', acctOpen: null, // null | 'email' | 'password'
      acctEmail: '', acctEmailPw: '', acctPwCur: '', acctPwNew: '', acctBusy: false, acctError: null,
      notifyPrefs: null, notifyPrefsDirty: false, vapidKey: null, pushOn: false, pushBusy: false,
      shiftOpen: false, shiftIn: false, shiftLeaving: false, planDraft: null, planOff: [], until: 'Until she wakes', plan: [], handbackNote: '',
      fx: getFx(), // device-local (babylog:fx), not in PERSIST
    }
    const saved = loadSaved()
    if (saved) for (const k of PERSIST) if (k in saved) this.state[k] = saved[k]
    this.state.settings = { tracking: {}, dismissed: [], ...(this.state.settings || {}) }
    // no token → cached signed-in screens are stale
    if (!getToken() && !['splash', 'auth'].includes(this.state.screen)) this.state.screen = 'splash'
    // arriving from a password-reset email: ?reset=<token>&email=<addr> — the
    // token lives only in memory; a reload after replaceState falls through
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.get('reset') && q.get('email')) {
        this.state.resetToken = q.get('reset')
        this.state.resetEmail = q.get('email')
        this.state.screen = 'reset'
      } else if (this.state.screen === 'reset') this.state.screen = 'splash'
    } catch { if (this.state.screen === 'reset') this.state.screen = 'splash' }
  }

  componentDidMount() {
    this._iv = setInterval(() => {
      this.setState(s => ({ tick: s.tick + 1 }))
      // realtime pokes carry the load; poll only as fallback / slow heartbeat
      if (!isEchoConnected() || this.state.tick % 3 === 0) this.sync()
    }, 20000)
    // a running timer needs a live second hand; idle when none is going
    this._sec = setInterval(() => { if (this.state.activeTimer) this.setState(s => ({ tick: s.tick + 1 })) }, 1000)
    this._wake = () => this.sync()
    window.addEventListener('focus', this._wake)
    window.addEventListener('online', this._wake)
    document.addEventListener('visibilitychange', this._wake)
    if (getToken()) this.sync()
    this.refreshPush()
    initFx(() => applyTheme(this.state.settings.theme)) // OS scheme / light sensor changes re-resolve dark
    applyTheme(this.state.settings.theme)
    // Android back gesture closes overlays in stacking order: sheet first,
    // then the settings screen back to history — never straight out of the app.
    // A stale entry can survive a reload mid-overlay — drop it so back exits.
    this._pop = () => {
      if (this.state.sheet) return this.dismissSheet()
      if (this.state.shiftOpen) return this.dismissShift()
      if (this.state.screen === 'history' && this.state.historyDay) return this.setState({ historyDay: null })
      if (this.state.screen === 'settings') this.setState({ screen: 'history' })
    }
    window.addEventListener('popstate', this._pop)
    if (window.history.state?.blSheet || window.history.state?.blShift || window.history.state?.blSettings || window.history.state?.blDay) {
      try { window.history.replaceState(null, '') } catch { /* fine */ }
    }
    // the reset token was captured into state — scrub it out of the URL/history
    if (window.location.search) {
      try { window.history.replaceState(null, '', window.location.pathname) } catch { /* fine */ }
    }
  }
  componentWillUnmount() {
    clearInterval(this._iv); clearInterval(this._sec); if (this._to) clearTimeout(this._to); if (this._flushTo) clearTimeout(this._flushTo)
    window.removeEventListener('focus', this._wake)
    window.removeEventListener('online', this._wake)
    document.removeEventListener('visibilitychange', this._wake)
    window.removeEventListener('popstate', this._pop)
    if (this._sheetTo) clearTimeout(this._sheetTo)
    if (this._shiftTo) clearTimeout(this._shiftTo)
    if (this._toGone) clearTimeout(this._toGone)
    stopEcho()
  }

  ensureEcho() {
    const hh = this.state.me?.householdId
    const token = getToken()
    if (!hh || !token) return
    const sig = token + ':' + hh
    if (this._echoSig === sig) return
    this._echoSig = sig
    startEcho(token, hh, { onPoke: () => this.sync(), onConnect: () => this.sync() })
  }
  componentDidUpdate() {
    const out = {}
    for (const k of PERSIST) out[k] = this.state[k]
    try { localStorage.setItem(STORE_KEY, JSON.stringify(out)) } catch { /* storage full/blocked — stay in-memory */ }
    applyTheme(this.state.settings.theme)
  }

  // ── sync ───────────────────────────────────────────────────────────────────
  flushSoon() {
    if (this._flushTo) clearTimeout(this._flushTo)
    this._flushTo = setTimeout(() => this.sync(), 250)
  }

  sync = async () => {
    if (!getToken() || this._syncing) return
    this._syncing = true
    try {
      if (this.state.outbox.length) {
        const ids = new Set(this.state.outbox)
        const pushed = new Map(this.state.entries.filter(e => ids.has(e.id)).map(e => [e.id, e]))
        const payload = [...pushed.values()]
          .map(e => ({ id: e.id, type: e.type, t: e.t, detail: e.detail == null ? null : String(e.detail), deleted: !!e.deleted }))
        if (payload.length) await api.pushEntries(payload)
        // an undo/edit while the push was in flight makes a new entry object —
        // keep that id queued so the newer write still pushes (and wins) next flush
        this.setState(s => ({ outbox: s.outbox.filter(id => !ids.has(id) || s.entries.find(e => e.id === id) !== pushed.get(id)) }))
      }
      if (this.state.settingsDirty) {
        const pushed = this.state.settings
        // widgets is null until the household customizes it — don't send the null
        const { widgets, ...rest } = pushed
        await api.saveSettings(widgets == null ? rest : pushed)
        // a toggle mid-flight makes a new settings object — only clear if nothing changed
        if (this.state.settings === pushed) this.setState({ settingsDirty: false })
      }
      if (this.state.notifyPrefsDirty && this.state.notifyPrefs) {
        const pushed = this.state.notifyPrefs
        await api.saveNotifyPrefs(pushed)
        if (this.state.notifyPrefs === pushed) this.setState({ notifyPrefsDirty: false })
      }
      const st = await api.state(this.state.lastSync)
      this.applyState(st)
      if (this.state.offline) this.setState({ offline: false })
    } catch (e) {
      if (e.status === 401) this.doLogout(false)
      else this.setState({ offline: true }) // no signal — local writes are queued
    } finally {
      this._syncing = false
    }
  }

  applyState(st) {
    this.setState(s => {
      const outbox = new Set(s.outbox)
      const map = new Map(s.entries.map(e => [e.id, e]))
      for (const e of (st.entries || [])) {
        if (outbox.has(e.id)) continue // our unpushed write wins for now
        map.set(e.id, { id: e.id, type: e.type, t: e.t, detail: numify(e.detail), deleted: !!e.deleted, by: e.user_id })
      }
      const next = {
        entries: [...map.values()].sort((a, b) => b.t - a.t),
        me: st.user, partner: st.partner, invitePending: st.invitePending,
        onDutyUserId: st.onDutyUserId, serverShift: st.shift,
        lastSync: st.serverTime,
      }
      // server settings win unless a local toggle is still waiting to push
      if (!s.settingsDirty && st.settings && !Array.isArray(st.settings)) {
        next.settings = { tracking: st.settings.tracking || {}, dismissed: st.settings.dismissed || [], widgets: st.settings.widgets || null, ...(st.settings.theme ? { theme: st.settings.theme } : {}), ...(st.settings.unit ? { unit: st.settings.unit } : {}), ...(st.settings.medName ? { medName: st.settings.medName } : {}) }
      }
      if (!s.notifyPrefsDirty && st.user?.notifyPrefs) next.notifyPrefs = st.user.notifyPrefs
      if (st.vapidPublicKey) next.vapidKey = st.vapidPublicKey
      // server owns the running timer, except while our own start/stop is in flight
      if (!this._timerBusy) next.activeTimer = st.timer || null
      if (st.baby) {
        next.babyName = st.baby.name
        if (st.baby.age) next.age = st.baby.age
        if (st.baby.birthdate !== undefined) next.babyBirthdate = st.baby.birthdate
      }
      // my active shift plan lives on the server copy
      if (st.shift && st.shift.state === 'active' && st.user && st.shift.user_id === st.user.id) next.plan = st.shift.plan || []
      return next
    }, () => {
      this.ensureEcho()
      // partner just handed back to me → surface the shift report once
      const { serverShift: sh, me, shiftOpen, dismissedShiftId, screen } = this.state
      if (sh && sh.state === 'completed' && me && sh.user_id !== me.id && sh.id !== dismissedShiftId
        && !shiftOpen && this._autoOpened !== sh.id && screen === 'home') {
        this._autoOpened = sh.id
        this.mountShift()
      }
    })
  }

  // ── auth / onboarding ──────────────────────────────────────────────────────
  authSubmit = async () => {
    const s = this.state
    if (s.authBusy) return
    this.setState({ authBusy: true, authError: null })
    try {
      if (s.authMode === 'signup') {
        const r = await api.register({ name: s.authName.trim() || 'Parent', email: s.authEmail.trim(), password: s.authPassword, invite: s.authInvite.trim() || undefined })
        setToken(r.token)
      } else {
        const r = await api.login({ email: s.authEmail.trim(), password: s.authPassword })
        setToken(r.token)
      }
      const st = await api.state(0)
      this.setState({ entries: [], outbox: [], lastSync: 0, dismissedShiftId: null, authBusy: false, authPassword: '' })
      this.applyState(st)
      this.setState({ screen: st.baby ? 'home' : 'onboard', nameField: st.baby ? st.baby.name : '' })
    } catch (e) {
      const first = e.errors ? Object.values(e.errors)[0]?.[0] : null
      this.setState({ authBusy: false, authError: first || e.message || 'Something went wrong — try again.' })
    }
  }

  // ── forgot / reset password ────────────────────────────────────────────────
  sendForgot = async () => {
    const email = (this.state.forgotEmail || '').trim()
    if (!email || this.state.forgotBusy) return
    this.setState({ forgotBusy: true, forgotResult: null })
    try {
      const r = await api.forgotPassword(email)
      this.setState({ forgotBusy: false, forgotResult: r.sent ? 'sent' : 'unconfigured' })
    } catch {
      this.setState({ forgotBusy: false, forgotResult: 'error' })
    }
  }

  submitReset = async () => {
    const s = this.state
    if (s.resetBusy) return
    if ((s.resetPw || '').length < 8) return this.setState({ resetError: 'Pick a password with at least 8 characters.' })
    this.setState({ resetBusy: true, resetError: null })
    try {
      await api.resetPassword({ token: s.resetToken, email: s.resetEmail, password: s.resetPw })
      this.setState({
        screen: 'auth', authMode: 'login', authEmail: s.resetEmail, authError: null,
        resetToken: null, resetPw: '', resetBusy: false,
        toast: 'Password updated — log in with the new one', undoAction: null,
      })
      this.bumpToast()
    } catch (e) {
      const first = e.errors ? Object.values(e.errors)[0]?.[0] : null
      this.setState({ resetBusy: false, resetError: first || e.message || 'Something went wrong — try again.' })
    }
  }

  finishOnboard = async () => {
    const name = (this.state.nameField || '').trim() || 'Baby'
    const age = this.state.age
    const birthdate = this.state.dobField || undefined
    this.setState({ screen: 'home', babyName: name, babyBirthdate: birthdate || null })
    try {
      await api.setBaby({ name, age, birthdate })
      if (this.state.inviteField.trim()) await this.sendInvite()
    } catch { this.setState({ offline: true }) }
  }

  sendInvite = async () => {
    const email = this.state.inviteField.trim()
    if (!email) return
    try {
      const r = await api.invite(email)
      this.setState({
        invitePending: email, inviteCode: r.code, inviteMailed: !!r.mailed,
        toast: r.mailed ? 'Emailed ' + email + ' — their code is ' + r.code : 'Invited ' + email + ' — their code is ' + r.code,
        undoAction: null,
      })
      this.bumpToast()
    } catch (e) {
      this.setState({ toast: e.status ? 'Invite failed — check the email' : 'No signal — try again later', undoAction: null })
      this.bumpToast()
    }
  }

  doLogout = async (callApi = true) => {
    if (callApi) {
      // stop the server pushing at this device; the browser permission stays for next login
      try { const sub = await pushSubscription(); if (sub) await api.pushUnsubscribe(sub.endpoint) } catch { /* best-effort */ }
      try { await api.logout() } catch { /* token dies anyway */ }
    }
    setToken(null)
    stopEcho()
    this._echoSig = null
    try { localStorage.removeItem(STORE_KEY) } catch { /* ignore */ }
    this._autoOpened = null
    this.setState({
      screen: 'splash', authMode: 'signup', authName: '', authEmail: '', authPassword: '', authError: null,
      forgotOpen: false, forgotEmail: '', forgotResult: null,
      entries: [], outbox: [], lastSync: 0, me: null, partner: null, invitePending: null, inviteCode: null, inviteMailed: false,
      onDutyUserId: null, serverShift: null, dismissedShiftId: null,
      babyName: '', nameField: '', inviteField: '', sheet: false, sheetIn: false, sheetLeaving: false,
      shiftOpen: false, shiftIn: false, shiftLeaving: false, toast: null, toastLeaving: false,
      plan: [], planDraft: null, planOff: [], handbackNote: '',
      settings: { tracking: {}, dismissed: [] }, settingsDirty: false,
      notifyPrefs: null, notifyPrefsDirty: false, pushOn: false,
      activeTimer: null, timerSide: null, manualDur: false,
      acctName: '', acctBabyName: '', acctOpen: null, acctError: null, acctBusy: false,
      acctEmail: '', acctEmailPw: '', acctPwCur: '', acctPwNew: '',
    })
  }

  // ── notifications (per-user prefs; the push subscription is per-device) ────
  nPrefs() {
    return {
      handoff: true, partner: false, feed: false, feedEvery: null, onDutyOnly: true,
      wake: false, meds: false, medsTime: '09:00',
      quiet: false, quietStart: '22:00', quietEnd: '07:00', tz: null,
      ...(this.state.notifyPrefs || {}),
    }
  }
  setNotify = patch => this.setState({
    // always ride the device's timezone along so quiet hours + meds time are local
    notifyPrefs: { ...this.nPrefs(), ...patch, tz: deviceTz() || this.nPrefs().tz },
    notifyPrefsDirty: true,
  }, () => this.flushSoon())
  // a subscription surviving in the browser re-attaches to whoever is logged in now
  refreshPush = async () => {
    try {
      const sub = await pushSubscription()
      if (sub && getToken()) {
        await api.pushSubscribe({ endpoint: sub.endpoint, keys: sub.toJSON().keys, tz: deviceTz() })
        this.setState({ pushOn: true })
      } else this.setState({ pushOn: false })
    } catch { /* offline — the toggle still reflects the browser's side */ }
  }
  togglePush = async () => {
    if (this.state.pushBusy) return
    this.setState({ pushBusy: true })
    try {
      if (this.state.pushOn) {
        const sub = await pushSubscription()
        if (sub) {
          try { await api.pushUnsubscribe(sub.endpoint) } catch { /* row prunes itself on next push */ }
          await sub.unsubscribe()
        }
        this.setState({ pushOn: false, toast: 'Notifications off for this phone', undoAction: null })
      } else {
        const sub = await subscribePush(this.state.vapidKey)
        await api.pushSubscribe({ endpoint: sub.endpoint, keys: sub.toJSON().keys, tz: deviceTz() })
        this.setState({ pushOn: true, toast: 'This phone will get pings', undoAction: null })
        this.setNotify({}) // stamp the device tz into prefs right away
      }
    } catch (e) {
      this.setState({
        toast: e && e.message === 'denied'
          ? 'Notifications are blocked — allow them in your browser settings'
          : 'Couldn’t turn notifications on — try again',
        undoAction: null,
      })
    }
    this.setState({ pushBusy: false })
    this.bumpToast()
  }

  // ── entry helpers (views always work on live = non-deleted entries) ────────
  live() { return this.state.entries.filter(e => !e.deleted) }

  clock(t) {
    const d = new Date(t)
    let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap
  }
  elapsed(t) {
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
    if (mins < 60) return mins + 'm'
    const h = Math.floor(mins / 60), r = mins % 60
    if (h < 24) return h + 'h ' + String(r).padStart(2, '0') + 'm'
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
  }
  dur(m) { m = m || 0; return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') }
  dayOf(t) {
    const d = new Date(t), n = new Date()
    const diff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / DAY)
    return diff === 0 ? '' : diff === 1 ? 'Yesterday' : diff + ' days ago'
  }
  unit() { return this.state.settings.unit ?? this.props.unit ?? 'oz' }
  // household-level like unit — what the daily meds dose is called everywhere it renders.
  // Read-side default: households that never saved the key still say Vitamin D.
  medName() { return (this.state.settings.medName || '').trim() || 'Vitamin D' }
  // stored oz → the display unit's number; oz passes through untouched so the
  // current formatting survives. Every place an amount RENDERS goes through here.
  amt(oz) { return oz == null ? oz : this.unit() === 'ml' ? ozToMl(oz) : oz }
  // sheet amount state lives in the display unit; the wire string stays oz
  amountKey() { return this.unit() === 'ml' ? 'ml' : 'oz' }
  fmtDetail(d) {
    const { n, mins, side, milk } = dSplit(d), p = []
    if (n != null) p.push(this.amt(n) + ' ' + this.unit())
    if (milk) p.push(milk)
    if (side) p.push(side)
    if (mins != null) p.push(this.dur(mins))
    return p.join(' · ')
  }
  subFor(e, noDay) {
    const day = noDay ? '' : this.dayOf(e.t), p = []
    if ((e.type === 'bottle' || e.type === 'pump') && e.detail != null) p.push(this.fmtDetail(e.detail) || String(e.detail))
    if (e.type === 'nurse') p.push(e.detail ? this.fmtDetail(e.detail) || String(e.detail) : 'either side')
    if (e.type === 'sleep') p.push(this.dur(e.detail))
    if (DIAPERS.includes(e.type)) p.push(e.type === 'both' ? 'wet + dirty' : e.type)
    if (e.type === 'meds') p.push(this.medName())
    if (day) p.push(day)
    return p.filter(Boolean).join(' · ') || 'logged'
  }
  // real DOB wins over the onboarding age bucket; weeks first, then months, then years
  ageInfo() {
    const bd = this.state.babyBirthdate
    if (!bd) return { label: this.state.age, weeks: null }
    const days = Math.max(0, Math.floor((Date.now() - new Date(bd + 'T00:00:00').getTime()) / DAY))
    const weeks = Math.floor(days / 7), mo = Math.floor(days / 30.4375)
    const label = days < 183 ? weeks + (weeks === 1 ? ' wk' : ' wks')
      : mo < 24 ? mo + ' mo'
      : Math.floor(mo / 12) + 'y' + (mo % 12 ? ' ' + (mo % 12) + 'm' : '')
    return { label, weeks }
  }
  setBirthdate = e => {
    const bd = e.target.value
    if (!bd) return
    this.setState({ babyBirthdate: bd })
    api.setBaby({ name: this.state.babyName || 'Baby', birthdate: bd }).catch(() => this.setState({ offline: true }))
  }
  // ── account (settings) ─────────────────────────────────────────────────────
  saveMyName = () => {
    const name = (this.state.acctName || '').trim()
    if (!name || !this.state.me || name === this.state.me.name) return
    // local-first like everything else: the header updates now, the partner on the next poke
    this.setState(s => ({ me: s.me ? { ...s.me, name } : s.me }))
    api.accountProfile(name).catch(() => this.setState({ offline: true }))
  }
  saveBabyName = () => {
    const name = (this.state.acctBabyName || '').trim()
    if (!name || name === this.state.babyName) return
    this.setState({ babyName: name })
    // setBaby only touches the fields it's sent — birthdate survives a rename
    api.setBaby({ name }).catch(() => this.setState({ offline: true }))
  }
  toggleAcct = which => this.setState(s => ({
    acctOpen: s.acctOpen === which ? null : which,
    acctError: null, acctEmail: '', acctEmailPw: '', acctPwCur: '', acctPwNew: '',
  }))
  acctFail = e => {
    const first = e.errors ? Object.values(e.errors)[0]?.[0] : null
    this.setState({
      acctBusy: false,
      acctError: e.status ? (first || e.message || 'That didn’t go through — try again.') : 'No signal — try again in a moment.',
    })
  }
  submitAcctEmail = async () => {
    const s = this.state
    const email = s.acctEmail.trim()
    if (!email || !s.acctEmailPw || s.acctBusy) return
    this.setState({ acctBusy: true, acctError: null })
    try {
      const r = await api.accountEmail({ email, password: s.acctEmailPw })
      this.setState(st => ({
        acctBusy: false, acctOpen: null, acctEmail: '', acctEmailPw: '',
        me: st.me ? { ...st.me, email: r.email } : st.me,
        toast: 'Email updated — log in with ' + r.email + ' next time', undoAction: null,
      }))
      this.bumpToast()
    } catch (e) { this.acctFail(e) }
  }
  submitAcctPassword = async () => {
    const s = this.state
    if (!s.acctPwCur || !s.acctPwNew || s.acctBusy) return
    if (s.acctPwNew.length < 8) return this.setState({ acctError: 'Pick a password with at least 8 characters.' })
    this.setState({ acctBusy: true, acctError: null })
    try {
      await api.accountPassword({ current_password: s.acctPwCur, password: s.acctPwNew })
      this.setState({
        acctBusy: false, acctOpen: null, acctPwCur: '', acctPwNew: '',
        toast: 'Password updated — other phones will need to log in again', undoAction: null,
      })
      this.bumpToast()
    } catch (e) { this.acctFail(e) }
  }

  trackOn(key) { return this.state.settings.tracking[key] !== false }
  typeOn(typeKey) {
    const tr = TRACKS.find(t => t.types.includes(typeKey))
    return !tr || this.trackOn(tr.key)
  }
  setTracking = (key, on) => this.setState(s => ({
    settings: { ...s.settings, tracking: { ...s.settings.tracking, [key]: on } },
    settingsDirty: true,
  }), () => this.flushSoon())
  // widgets shown on Now: the household's chosen set (or the default), then
  // filtered so a card can't outlive the tracker it depends on
  widgetKeys() {
    const w = this.state.settings.widgets
    const chosen = Array.isArray(w) && w.length ? w : DEFAULT_WIDGETS
    return chosen.filter(k => { const wid = WIDGETS.find(x => x.key === k); return wid && (!wid.track || this.trackOn(wid.track)) })
  }
  setWidget = (key, on) => this.setState(s => {
    const cur = Array.isArray(s.settings.widgets) && s.settings.widgets.length ? s.settings.widgets : this.widgetKeys()
    const set = new Set(on ? [...cur, key] : cur.filter(k => k !== key))
    const widgets = WIDGETS.map(w => w.key).filter(k => set.has(k)) // normalize to catalog order
    return { settings: { ...s.settings, widgets }, settingsDirty: true }
  }, () => this.flushSoon())
  dismissRec = key => this.setState(s => ({
    settings: { ...s.settings, dismissed: [...new Set([...s.settings.dismissed, key])] },
    settingsDirty: true,
  }), () => this.flushSoon())
  setTheme = patch => this.setState(s => ({
    settings: { ...s.settings, theme: { ...(s.settings.theme || {}), ...patch } },
    settingsDirty: true,
  }), () => this.flushSoon())
  // household-level like tracking/theme — both parents should read the same numbers
  setUnit = unit => this.setState(s => ({
    settings: { ...s.settings, unit },
    settingsDirty: true,
  }), () => this.flushSoon())
  setMedName = e => this.setState(s => ({
    settings: { ...s.settings, medName: e.target.value },
    settingsDirty: true,
  }), () => this.flushSoon())
  // theme mode & tilt are per-phone (fx.js), not household settings — the
  // night-shift parent going dark shouldn't flip their partner's screen
  // note: Android's installed-app status bar follows the OS scheme only
  // (ColorUtils.inNightMode) — no page-side action can recolor it, so don't
  // bother reloading or rewriting metas beyond what applyTheme already does
  setFxMode = mode => this.setState({ fx: setFx({ mode }) })
  toggleTilt = async () => {
    const on = !this.state.fx.tilt
    if (on) await askTiltPermission() // iOS wants the request inside this tap
    this.setState({ fx: setFx({ tilt: on }) })
  }
  feedGap() {
    // rhythm runs between session starts — cluster feeds don't count as new beats
    const t = this.live().filter(e => FEEDS.includes(e.type)).map(e => e.t).sort((a, b) => a - b)
    const starts = sessionStarts(t).slice(-14)
    const gaps = []; for (let i = 1; i < starts.length; i++) gaps.push(starts[i] - starts[i - 1])
    // whole ms: plan timestamps built from this go to the server as integers
    return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 3 * 3600000
  }
  draftPlan() {
    const gap = this.feedGap(), feed = this.lastOf(FEEDS), now = Date.now()
    let t1 = (feed ? feed.t : now) + gap; while (t1 < now + 20 * 60000) t1 += gap
    const out = [{ id: 'p1', type: 'bottle', at: t1 }, { id: 'p2', type: 'bottle', at: t1 + gap }]
    const meds = new Date(); meds.setHours(9, 0, 0, 0); if (meds.getTime() < now) meds.setDate(meds.getDate() + 1)
    if (this.trackOn('meds') && meds.getTime() - now < 11 * 3600000) out.push({ id: 'p3', type: 'meds', at: meds.getTime() })
    return out
  }
  // "Until 6 AM" → the next matching clock time as ms epoch, resolved here in
  // the accepter's own timezone; wake-dependent / open-ended labels have no
  // alarm time, so they return null and the server's until-ping never fires
  untilAt(label) {
    const m = /until\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(label || '')
    if (!m) return null
    let h = Number(m[1])
    if (m[3]) h = h % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0)
    const d = new Date(); d.setHours(h, Number(m[2] || 0), 0, 0)
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  lastOf(keys) { return this.live().filter(e => keys.includes(e.type)).sort((a, b) => b.t - a.t)[0] }

  // ── nursing / pump / sleep timers (server-backed, live) ────────────────────
  stopwatch(ms) {
    const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
    const pad = n => String(n).padStart(2, '0')
    return (h ? h + ':' + pad(m) : m) + ':' + pad(ss)
  }
  startTimer = type => {
    // pre-picked nurse side (if any) is remembered locally for the stop log
    const side = type === 'nurse' ? (this.state.detail || this.defaultDetail('nurse')) : null
    this._timerBusy = true
    this.closeSheet() // animated close that also consumes the {blSheet} history entry
    this.setState({
      manualDur: false,
      activeTimer: { id: 'local', type, started_at: Date.now(), user_id: this.state.me?.id },
      timerSide: side,
    })
    api.timerStart(type)
      .then(r => this.setState({ activeTimer: r.timer }))
      .catch(() => this.setState({ offline: true }))
      .finally(() => { this._timerBusy = false })
  }
  stopTimer = () => {
    const t = this.state.activeTimer
    if (!t || t.user_id !== this.state.me?.id) return // only the parent who started can stop + log
    const mins = Math.max(1, Math.round((Date.now() - t.started_at) / 60000))
    this._timerBusy = true
    this.setState({ activeTimer: null })
    api.timerStop().catch(() => this.setState({ offline: true })).finally(() => { this._timerBusy = false })
    if (t.type === 'nurse') {
      // nursing: measured side + duration log straight away, undo available
      const side = this.state.timerSide || this.defaultDetail('nurse')
      const detail = [side, mins + 'm'].filter(Boolean).join(' · ')
      const entry = { id: uuid(), type: 'nurse', t: t.started_at, detail, by: this.state.me?.id }
      this.setState(s => ({
        entries: [entry, ...s.entries], outbox: [...s.outbox, entry.id],
        toast: 'Nursing logged · ' + this.dur(mins), undoAction: { kind: 'add', id: entry.id }, timerSide: null,
      }), () => this.flushSoon())
      this.bumpToast()
    } else if (t.type === 'sleep') {
      // sleep: the entry stamps the wake-up moment, and the duration leads the
      // detail as bare minutes (the sleep format — the wake-window insight
      // subtracts it from t to find when the nap started)
      const entry = { id: uuid(), type: 'sleep', t: Date.now(), detail: mins, by: this.state.me?.id }
      this.setState(s => ({
        entries: [entry, ...s.entries], outbox: [...s.outbox, entry.id],
        toast: 'Sleep logged · ' + this.dur(mins), undoAction: { kind: 'add', id: entry.id },
      }), () => this.flushSoon())
      this.bumpToast()
    } else {
      // pumping needs the amount — open the sheet (manual mode) with the timed duration filled in
      this._base = t.started_at
      const last = this.lastOf(['pump'])
      this.mountSheet({
        editId: null, sel: 'pump', offset: 0, pickedT: null, manualDur: true,
        detail: this.amt(last ? (dSplit(last.detail).n ?? 4) : 4), detail2: mins, timerSide: null,
      })
    }
  }

  // ── shifts (server-backed) ─────────────────────────────────────────────────
  // a server rejection is not "offline": say why, and fall back to server truth
  // instead of leaving optimistic duty state that quietly reverts on the next pull
  shiftFail = e => {
    if (e && e.status) {
      const first = e.errors ? Object.values(e.errors)[0]?.[0] : null
      this.setState({ toast: first || e.message || 'That didn’t go through — try again', undoAction: null })
      this.bumpToast()
      this.sync()
    } else this.setState({ offline: true })
  }
  // every shift-sheet opening routes through here — same lifecycle as mountSheet:
  // slide-up entrance (mount off-screen, translate home two frames later) plus a
  // {blShift} history entry so the Android back gesture closes it
  mountShift = fields => {
    if (this._shiftTo) { clearTimeout(this._shiftTo); this._shiftTo = null }
    if (!this.state.shiftOpen && !window.history.state?.blShift) {
      try { window.history.pushState({ blShift: true }, '') } catch { /* history blocked — back just exits */ }
    }
    this.setState(s => ({ shiftOpen: true, shiftLeaving: false, shiftIn: reduceMotion(), ...(typeof fields === 'function' ? fields(s) : fields) }))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (this.state.shiftOpen) this.setState({ shiftIn: true })
    }))
  }
  openShift = () => {
    if (!this.state.partner) return // no one to hand to yet
    this.mountShift(s => ({ planDraft: s.planDraft || this.draftPlan() }))
  }
  closeShift = () => {
    // consume our history entry when it's on top; the popstate runs the
    // animated close, same as a native back gesture would
    if (this.state.shiftOpen && window.history.state?.blShift) return window.history.back()
    this.dismissShift()
  }
  dismissShift = () => {
    if (!this.state.shiftOpen) return
    this.setState({ shiftOpen: false, shiftIn: false, shiftLeaving: true })
    this._shiftTo = setTimeout(() => {
      this._shiftTo = null
      // marking the report dismissed waits for the exit — flipping it earlier
      // would swap the report to the take-over view mid-slide
      this.setState(s => ({
        shiftLeaving: false,
        dismissedShiftId: (s.serverShift && s.serverShift.state === 'completed') ? s.serverShift.id : s.dismissedShiftId,
      }))
    }, reduceMotion() ? 0 : 340)
  }
  acceptShift = () => {
    const s = this.state
    const plan = (s.planDraft || this.draftPlan()).filter(p => !s.planOff.includes(p.id))
    const until = s.until
    const untilAt = this.untilAt(until)
    this.closeShift()
    this.setState(st => ({
      shift: undefined, handbackNote: '', plan, planDraft: null, planOff: [],
      onDutyUserId: st.me?.id ?? st.onDutyUserId,
      serverShift: { id: st.serverShift?.id ?? -1, state: 'active', user_id: st.me?.id, plan, until, until_at: untilAt, started_at: Date.now() },
      toast: 'You’re on duty · ' + (st.partner?.name || 'your partner') + ' notified', undoAction: null,
    }), () => this.bumpToast())
    api.shiftAccept(plan, until, untilAt).then(r => this.setState({ serverShift: r.shift })).catch(this.shiftFail)
  }
  addPlanFeed = () => this.setState(s => {
    const last = s.plan.filter(p => FEEDS.includes(p.type)).sort((a, b) => b.at - a.at)[0]
    const plan = [...s.plan, { id: 'p' + Date.now(), type: 'bottle', at: (last ? last.at : Date.now()) + this.feedGap() }]
    return { plan, serverShift: s.serverShift ? { ...s.serverShift, plan } : s.serverShift }
  }, () => api.shiftPlan(this.state.plan).catch(this.shiftFail))
  handBack = () => {
    const note = this.state.handbackNote
    this.setState(s => ({
      plan: [],
      serverShift: s.serverShift && s.serverShift.state === 'active'
        ? { ...s.serverShift, state: 'completed', ended_at: Date.now(), handback_note: note }
        : { id: -2, state: 'completed', user_id: s.me?.id, started_at: s.serverShift?.started_at ?? Date.now(), ended_at: Date.now(), handback_note: note },
      onDutyUserId: s.partner?.id ?? s.onDutyUserId,
    }))
    api.shiftHandback(note).then(r => { if (r.shift) this.setState({ serverShift: r.shift }) }).catch(this.shiftFail)
  }
  requestHandoff = () => {
    const note = this.state.handbackNote
    const partner = this.state.partner
    this.closeShift()
    this.setState(s => ({
      serverShift: { id: -3, state: 'requested', requester_id: s.me?.id, note, requested_at: Date.now() },
      toast: (partner?.name || 'Your partner') + ' will get your handoff ask', undoAction: null,
    }), () => this.bumpToast())
    api.shiftRequest(note).catch(this.shiftFail)
  }

  // ── quick-log sheet ────────────────────────────────────────────────────────
  predict() {
    if ((this.props.smartPrefill ?? true) === false) return null
    const feed = this.lastOf(FEEDS), dia = this.lastOf(DIAPERS)
    if (!feed && !dia) return 'bottle'
    if (!this.trackOn('diapers')) return feed && feed.type === 'nurse' ? 'nurse' : 'bottle'
    const fMin = feed ? (Date.now() - feed.t) / 60000 : 999
    const dMin = dia ? (Date.now() - dia.t) / 60000 : 999
    if (fMin / 165 >= dMin / 150) return feed && feed.type === 'nurse' ? 'nurse' : 'bottle'
    return 'wet'
  }
  stamp() { return this.state.pickedT ?? this._base + this.state.offset * 60000 }

  openSheet = () => {
    this._base = Date.now()
    const k = this.predict()
    this.mountSheet({ editId: null, sel: k, offset: 0, pickedT: null, detail: k ? this.defaultDetail(k) : null, detail2: k ? this.defaultDetail2(k) : null, manualDur: false })
  }
  defaultDetail(k) {
    const d = T(k).detail
    if (d === 'amount') { const l = this.lastOf([k]); return this.amt(l ? (dSplit(l.detail).n ?? 4) : 4) } // seeds in the display unit
    if (d === 'side') { const l = this.lastOf(['nurse']); return l && dSplit(l.detail).side === 'Left' ? 'Right' : 'Left' }
    if (d === 'dur') return 45
    return null
  }
  defaultDetail2(k) {
    if (k === 'bottle') { const l = this.lastOf(['bottle']); return l ? dSplit(l.detail).milk : null }
    return null
  }
  // ── provider export: CSV through the native share sheet (download fallback) ─
  exportRows() {
    const who = {}
    for (const u of [this.state.me, this.state.partner]) if (u) who[u.id] = u.name || ''
    const pad = n => String(n).padStart(2, '0')
    // range chips: 7/30 count back from local midnight so "7 days" means the
    // bars' window (today + 6 before), 'all' is everything on the device
    const r = this.state.exportRange
    let from = 0
    if (r !== 'all') { const d = new Date(); d.setHours(0, 0, 0, 0); from = d.getTime() - (r - 1) * DAY }
    return this.live().filter(e => e.t >= from).sort((a, b) => a.t - b.t).map(e => {
      const d = dSplit(e.detail), dt = new Date(e.t)
      return {
        key: e.type,
        date: dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()),
        time: pad(dt.getHours()) + ':' + pad(dt.getMinutes()),
        type: T(e.type).label,
        oz: ['bottle', 'pump'].includes(e.type) ? d.n : null,
        mins: e.type === 'sleep' ? d.n : d.mins, // sleep stores its minutes as the leading number
        note: [d.side, d.milk].filter(Boolean).join(' · '),
        by: who[e.by] || '',
      }
    })
  }
  shareCsv = async (name, lines) => {
    const file = new File([lines.join('\r\n') + '\r\n'], name, { type: 'text/csv' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return } catch { /* declined or unsupported — fall back */ }
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  exportName(kind) {
    const day = new Date().toISOString().slice(0, 10)
    return ['baby-log', (this.state.babyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'), kind, day].filter(Boolean).join('-') + '.csv'
  }
  exportLog = () => {
    this.shareCsv(this.exportName('full'), [
      'Date,Time,Type,Amount (' + this.unit() + '),Duration (min),Detail,Logged by',
      ...this.exportRows().map(r => [r.date, r.time, r.type, this.amt(r.oz) ?? '', r.mins ?? '', csvEsc(r.note), csvEsc(r.by)].join(',')),
    ])
  }
  exportSummary = () => {
    const days = new Map()
    for (const r of this.exportRows()) {
      let d = days.get(r.date)
      if (!d) days.set(r.date, d = { feeds: 0, oz: 0, nurseMin: 0, pumpOz: 0, wet: 0, dirty: 0, sleepMin: 0, baths: 0, meds: 0 })
      if (r.key === 'bottle') { d.feeds++; d.oz += r.oz || 0 }
      if (r.key === 'nurse') { d.feeds++; d.nurseMin += r.mins || 0 }
      if (r.key === 'pump') d.pumpOz += r.oz || 0
      if (r.key === 'wet' || r.key === 'both') d.wet++
      if (r.key === 'dirty' || r.key === 'both') d.dirty++
      if (r.key === 'sleep') d.sleepMin += r.mins || 0
      if (r.key === 'bath') d.baths++
      if (r.key === 'meds') d.meds++
    }
    // day totals sum in oz and convert once at the end — no per-row rounding drift
    this.shareCsv(this.exportName('daily'), [
      'Date,Feeds,Bottle (' + this.unit() + '),Nursing (min),Pumped (' + this.unit() + '),Wet diapers,Dirty diapers,Sleep (min),Baths,Meds',
      ...[...days.entries()].map(([date, d]) =>
        [date, d.feeds, d.oz ? this.amt(d.oz) : '', d.nurseMin || '', d.pumpOz ? this.amt(d.pumpOz) : '', d.wet, d.dirty, d.sleepMin || '', d.baths || '', d.meds || ''].join(',')),
    ])
  }

  // detail state ↔ wire string: primary (amount/side/duration) in `detail`, extra (milk/minutes) in `detail2`
  // Amounts sit in the display unit while the sheet is open; the wire string is ALWAYS oz.
  composeDetail(k) {
    let a = this.state.detail
    const b = this.state.detail2
    if ((k === 'bottle' || k === 'pump') && a != null && a !== '' && this.unit() === 'ml') a = mlToOz(Number(a) || 0)
    if (k === 'bottle') return [a, b].filter(x => x != null && x !== '').join(' ') || null
    if (k === 'nurse' || k === 'pump') return [a, b != null ? b + 'm' : null].filter(x => x != null && x !== '').join(' · ') || null
    return a
  }
  decompose(type, d) {
    const { n, mins, side, milk } = dSplit(d)
    if (type === 'bottle') return { detail: this.amt(n), detail2: milk }
    if (type === 'nurse') return { detail: side, detail2: mins }
    if (type === 'pump') return { detail: this.amt(n), detail2: mins }
    return { detail: d, detail2: null }
  }
  // every sheet opening routes through here: slide-up entrance (mount off-screen,
  // then translate home two frames later) plus a history entry so the Android
  // back gesture dismisses the sheet instead of exiting the app
  mountSheet = fields => {
    if (this._sheetTo) { clearTimeout(this._sheetTo); this._sheetTo = null }
    if (!this.state.sheet && !window.history.state?.blSheet) {
      try { window.history.pushState({ blSheet: true }, '') } catch { /* history blocked — back just exits */ }
    }
    this.setState({ sheet: true, sheetLeaving: false, sheetIn: reduceMotion(), sheetTall: false, sheetDragY: 0, sheetDragging: false, ...fields })
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (this.state.sheet) this.setState({ sheetIn: true })
    }))
  }
  closeSheet = () => {
    // consume our history entry when it's on top; the popstate runs the
    // animated close, same as a native back gesture would
    if (this.state.sheet && window.history.state?.blSheet) return window.history.back()
    this.dismissSheet()
  }
  dismissSheet = () => {
    if (!this.state.sheet) return
    this.setState({ sheet: false, sheetLeaving: true, sheetIn: false, sheetDragY: 0, sheetDragging: false })
    this._sheetTo = setTimeout(() => {
      this._sheetTo = null
      this.setState({ sheetLeaving: false, sheetTall: false })
    }, reduceMotion() ? 0 : 340)
  }
  // handle gestures: drag down dismisses, drag up expands, from tall a short down-drag collapses
  sheetDragStart = e => {
    this._sheetDrag = { y0: e.clientY, lastY: e.clientY, lastT: Date.now(), vel: 0 }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* best-effort; drag still tracks */ }
    this.setState({ sheetDragging: true })
  }
  sheetDragMove = e => {
    const d = this._sheetDrag; if (!d) return
    const now = Date.now()
    d.vel = (e.clientY - d.lastY) / Math.max(1, now - d.lastT)
    d.lastY = e.clientY; d.lastT = now
    this.setState({ sheetDragY: e.clientY - d.y0 })
  }
  sheetDragEnd = () => {
    const d = this._sheetDrag; if (!d) return
    this._sheetDrag = null
    const dy = this.state.sheetDragY, vel = d.vel
    const reset = { sheetDragY: 0, sheetDragging: false }
    // leave the drag state alone on dismiss — the sheet holds its dragged spot
    // until the (async) animated close carries it the rest of the way down
    if (dy > 110 || (dy > 30 && vel > 0.55)) return this.closeSheet()
    if (dy < -40 || vel < -0.55) return this.setState({ ...reset, sheetTall: true })
    if (this.state.sheetTall && dy > 40) return this.setState({ ...reset, sheetTall: false })
    this.setState(reset)
  }
  // native-sheet gesture: a touch pull-down on the content works like the
  // handle, but only when the content is scrolled to the top and the touch
  // didn't start on a control (buttons scrub/tap; native scroll keeps pan-y)
  sheetBodyDown = e => {
    if (e.pointerType === 'mouse' || e.target.closest?.('button, input, label')) { this._bodyDrag = null; return }
    this._bodyDrag = { y0: e.clientY, el: e.currentTarget, active: false }
  }
  sheetBodyMove = e => {
    const b = this._bodyDrag; if (!b) return
    if (!b.active) {
      const dy = e.clientY - b.y0
      if (b.el.scrollTop > 0 || dy < -6) { this._bodyDrag = null; return }
      if (dy < 10) return
      b.active = true
      try { b.el.setPointerCapture(e.pointerId) } catch { /* drag still tracks */ }
      // re-base at the activation point so the sheet doesn't jump by the slop
      this._sheetDrag = { y0: e.clientY, lastY: e.clientY, lastT: Date.now(), vel: 0 }
      this.setState({ sheetDragging: true })
    }
    this.sheetDragMove(e)
  }
  sheetBodyUp = () => {
    if (this._bodyDrag?.active) this.sheetDragEnd()
    this._bodyDrag = null
  }
  pick = k => () => this.setState(s => ({ sel: k, detail: s.sel === k ? s.detail : this.defaultDetail(k), detail2: s.sel === k ? s.detail2 : this.defaultDetail2(k) }))
  // ── chip scrub: tap picks the preset, drag up/down dials a custom value ────
  // shared by durations and ounces — `key` picks the ladder the drag walks
  scrubStart = (field, key, base) => e => {
    const ladder = SCRUB[key].ladder
    this._scrub = { field, key, base, y0: e.clientY, moved: false, idx0: ladderIdx(ladder, base) }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* drag still tracks */ }
  }
  scrubMove = e => {
    const d = this._scrub
    if (!d) return
    const dy = d.y0 - e.clientY // up = more, like pulling a value out of the chip
    if (!d.moved && Math.abs(dy) < 7) return
    d.moved = true
    const ladder = SCRUB[d.key].ladder
    const i = Math.max(0, Math.min(ladder.length - 1, d.idx0 + Math.round(dy / 14)))
    const val = ladder[i]
    if (this.state.scrubDrag?.val !== val) this.setState({ scrubDrag: { field: d.field, base: d.base, val } })
  }
  scrubEnd = () => {
    const d = this._scrub
    this._scrub = null
    if (!d) return
    const val = d.moved ? this.state.scrubDrag?.val : null
    if (val != null) this.setState({ [d.field]: val, scrubDrag: null })
    else if (d.field === 'detail2') this.setState(s => ({ detail2: s.detail2 === d.base ? null : d.base, scrubDrag: null })) // tap toggles, as before
    else this.setState({ detail: d.base, scrubDrag: null })
  }
  nudge = n => () => this.setState({ offset: n, pickedT: null })
  pickTime = e => {
    const [h, m] = e.target.value.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return
    const d = new Date(this.stamp()); d.setHours(h, m, 0, 0)
    let t = d.getTime()
    // picking 11:50 PM shortly after midnight means last night, not later today
    if (t > Date.now() + 60000) t -= DAY
    this.setState({ pickedT: t, offset: 0 })
  }

  save = () => {
    const key = this.state.sel || this.predict() || 'bottle'
    const t = this.stamp(), detail = this.composeDetail(key)
    this.closeSheet()
    if (this.state.editId) {
      const id = this.state.editId
      this.setState(s => {
        // remember the pre-edit values so the toast's Undo can put them back
        const prev = s.entries.find(e => e.id === id)
        return {
          entries: s.entries.map(e => e.id === id ? { ...e, type: key, t, detail } : e),
          outbox: [...new Set([...s.outbox, id])],
          toast: 'Entry updated',
          undoAction: prev ? { kind: 'edit', id, prev: { type: prev.type, t: prev.t, detail: prev.detail } } : null,
        }
      }, () => this.flushSoon())
    } else {
      const entry = { id: uuid(), type: key, t, detail, by: this.state.me?.id }
      this.setState(s => ({
        screen: 'home',
        entries: [entry, ...s.entries],
        outbox: [...s.outbox, entry.id],
        toast: T(key).label + ' logged · ' + this.clock(t), undoAction: { kind: 'add', id: entry.id },
      }), () => this.flushSoon())
    }
    this.bumpToast()
  }
  bumpToast() {
    if (this._to) clearTimeout(this._to)
    if (this._toGone) { clearTimeout(this._toGone); this._toGone = null }
    this.setState({ toastLeaving: false })
    // fade out before unmounting; the text stays in state until the fade ends
    this._to = setTimeout(() => {
      this.setState({ toastLeaving: true })
      this._toGone = setTimeout(() => {
        this._toGone = null
        this.setState({ toast: null, undoAction: null, toastLeaving: false })
      }, reduceMotion() ? 0 : 220)
    }, 6000)
  }
  markDeleted(id) {
    this.setState(s => ({
      entries: s.entries.map(e => e.id === id ? { ...e, deleted: true } : e),
      outbox: [...new Set([...s.outbox, id])],
    }), () => this.flushSoon())
  }
  // one-shot undo of the last action only (add → delete it, edit → restore the
  // old values, delete → clear the tombstone). Each path re-queues the id, so
  // the undone write pushes after the original and wins last-write-wins —
  // including a restore against its own already-synced tombstone.
  undo = () => {
    const a = this.state.undoAction
    this.setState({ toast: null, toastLeaving: false, undoAction: null })
    if (!a) return
    if (a.kind === 'add') return this.markDeleted(a.id)
    this.setState(s => ({
      entries: s.entries.map(e => e.id === a.id
        ? (a.kind === 'edit' ? { ...e, type: a.prev.type, t: a.prev.t, detail: a.prev.detail } : { ...e, deleted: false })
        : e),
      outbox: [...new Set([...s.outbox, a.id])],
    }), () => this.flushSoon())
  }
  edit = id => () => {
    const e = this.state.entries.find(x => x.id === id)
    this._base = e.t
    this.mountSheet({ editId: id, sel: e.type, offset: 0, pickedT: null, ...this.decompose(e.type, e.detail) })
  }
  remove = () => {
    const id = this.state.editId
    this.closeSheet()
    this.setState({ toast: 'Entry deleted', undoAction: id ? { kind: 'delete', id } : null })
    if (id) this.markDeleted(id)
    this.bumpToast()
  }

  // History day drill-down: one history entry per dive (paging days doesn't
  // stack more) so the Android back gesture returns to the 7-day overview
  openDay = k => {
    if (!this.state.historyDay && !window.history.state?.blDay) {
      try { window.history.pushState({ blDay: true }, '') } catch { /* history blocked — back just exits */ }
    }
    this.setState({ historyDay: k })
  }
  closeDay = () => {
    // consume our entry so the button and the back gesture stay in step
    if (this.state.historyDay && window.history.state?.blDay) return window.history.back()
    this.setState({ historyDay: null })
  }

  chip(on, tone) {
    return on ? { bg: tone || 'var(--ink)', border: tone || 'var(--ink)', fg: 'var(--bg)' }
              : { bg: 'var(--surface)', border: 'rgba(var(--ink-rgb),0.12)', fg: 'var(--muted)' }
  }
  bars(keys, color) {
    const out = []
    const live = this.live()
    const base = new Date(); base.setHours(0, 0, 0, 0)
    for (let d = 6; d >= 0; d--) {
      const from = base.getTime() - d * DAY
      const n = live.filter(e => keys.includes(e.type) && e.t >= from && e.t < from + DAY).length
      out.push({ n, key: dayKey(from), day: d === 0 ? 'Today' : new Date(from).toLocaleDateString(undefined, { weekday: 'short' }) })
    }
    const max = Math.max(...out.map(o => o.n), 1)
    return out.map((o, i) => ({
      value: o.n, day: o.day, onTap: () => this.openDay(o.key),
      h: Math.max(6, Math.round((o.n / max) * 100)) + '%',
      fill: i === 6 ? color : color.replace('0.075', '0.045'),
    }))
  }

  renderVals() {
    const s = this.state
    const live = this.live()
    const st = T(s.sel || 'bottle')
    const step = Number(this.props.timeStep ?? 5) || 5
    const stampT = s.sheet ? this.stamp() : Date.now()
    const backMin = s.sheet ? Math.max(0, Math.round((this._base - stampT) / 60000)) : 0

    const me = s.me, partner = s.partner, sh = s.serverShift
    const myName = me?.name || 'You'
    const partnerName = partner?.name || 'your partner'
    const initial = n => (n || '?').trim()[0]?.toUpperCase() || '?'
    const iAmOnDuty = !me || !s.onDutyUserId || s.onDutyUserId === me.id

    const cards = this.widgetKeys().map(k => {
      const c = WIDGETS.find(w => w.key === k)
      const e = this.lastOf(c.keys)
      const day = e ? this.dayOf(e.t) : ''
      return { label: c.label, icon: c.icon, color: c.color, elapsed: e ? this.elapsed(e.t) : '—',
        at: e ? this.clock(e.t) + (day ? ', ' + day.toLowerCase() : '') + ' · ' + T(e.type).label : 'nothing logged yet' }
    })

    const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
    const td = live.filter(e => e.t >= midnight.getTime())
    const oz = td.filter(e => e.type === 'bottle').reduce((a, e) => a + (dSplit(e.detail).n || 0), 0)
    const todaySummary = [
      td.filter(e => FEEDS.includes(e.type)).length + ' feeds',
      this.amt(oz) + this.unit(),
      this.trackOn('diapers') ? td.filter(e => DIAPERS.includes(e.type)).length + ' diapers' : null,
    ].filter(Boolean).join(' · ')

    // queued-but-unsynced rows get a dimmed dot until the outbox flushes
    const pendingIds = new Set(s.outbox)
    const timeline = [...live].sort((a, b) => b.t - a.t).slice(0, 12).map(e => ({
      time: this.clock(e.t), label: T(e.type).label, sub: this.subFor(e),
      icon: T(e.type).icon, color: T(e.type).color, onEdit: this.edit(e.id),
      pending: pendingIds.has(e.id),
    }))

    // every day on the device, grouped for the History drill-down
    const fmtDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) }
    const byDay = new Map()
    for (const e of live) { const k = dayKey(e.t); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e) }
    const daySummary = evs => {
      const feeds = evs.filter(e => FEEDS.includes(e.type))
      const dOz = feeds.reduce((a, e) => a + (e.type === 'bottle' ? dSplit(e.detail).n || 0 : 0), 0)
      const p = [feeds.length + ' feeds']
      if (dOz) p.push(this.amt(dOz) + ' ' + this.unit())
      const dSl = evs.filter(e => e.type === 'sleep').reduce((a, e) => a + (Number(e.detail) || 0), 0)
      if (this.trackOn('sleep') && dSl) p.push(this.dur(dSl) + ' sleep')
      const dDia = evs.filter(e => DIAPERS.includes(e.type)).length
      if (this.trackOn('diapers') && dDia) p.push(dDia + ' diapers')
      return p.join(' · ')
    }
    const historyDays = [...byDay.keys()].sort().reverse().map(k => ({
      key: k, label: fmtDay(k), sub: daySummary(byDay.get(k)), onTap: () => this.openDay(k),
    }))
    // day-by-day paging: back to the oldest logged day (gaps included), never
    // past today — paging swaps the day in place, it doesn't stack history
    const dayShift = (k, delta) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + delta).getTime()) }
    const todayKey = dayKey(Date.now())
    const oldestKey = byDay.size ? [...byDay.keys()].sort()[0] : todayKey
    const dayEvs = s.historyDay ? byDay.get(s.historyDay) || [] : []
    const dayView = s.historyDay ? {
      label: fmtDay(s.historyDay), sub: dayEvs.length ? daySummary(dayEvs) : 'nothing logged',
      rows: [...dayEvs].sort((a, b) => a.t - b.t).map(e => ({
        time: this.clock(e.t), label: T(e.type).label, sub: this.subFor(e, true),
        icon: T(e.type).icon, color: T(e.type).color, onEdit: this.edit(e.id),
        pending: pendingIds.has(e.id),
      })),
      prev: s.historyDay > oldestKey ? () => this.setState({ historyDay: dayShift(s.historyDay, -1) }) : null,
      next: s.historyDay < todayKey ? () => this.setState({ historyDay: dayShift(s.historyDay, 1) }) : null,
      back: this.closeDay,
    } : null

    // hidden trackers drop out of the sheet, except while editing an old entry of that type
    const types = TYPES.filter(t => this.typeOn(t.key) || t.key === s.sel).map(t => {
      const on = t.key === s.sel
      return { label: t.label, icon: t.icon, color: t.color, on, tint: on ? 0.13 : 0.045, onTap: this.pick(t.key) }
    })

    const nudges = [{ n: 0, label: 'now' }, { n: -step, label: '−' + step }, { n: -step * 3, label: '−' + step * 3 }, { n: -60, label: '−1h' }]
      .map(d => ({ label: d.label, onTap: this.nudge(d.n), ...this.chip(s.pickedT == null && s.offset === d.n, OLIVE) }))

    const kind = st.detail
    // scrubbable chips: few presets, the current custom value sorted in as its
    // own chip, and the chip under a drag showing the live scrubbed value
    const scrubChips = (field, key) => {
      const cur = s[field] != null && !Number.isNaN(Number(s[field])) ? Number(s[field]) : null
      const vals = [...SCRUB[key].presets]
      if (cur != null && !vals.includes(cur)) vals.push(cur)
      vals.sort((a, b) => a - b)
      const drag = s.scrubDrag && s.scrubDrag.field === field ? s.scrubDrag : null
      const fmt = v => key === 'oz' || key === 'ml' ? v + ' ' + this.unit() : this.dur(v)
      return vals.map(dv => {
        const dragging = !!drag && drag.base === dv
        const on = dragging || (!drag && cur === dv)
        return { label: fmt(dragging ? drag.val : dv), scrub: true, on,
          onDown: this.scrubStart(field, key, dv), ...this.chip(on, st.color) }
      })
    }
    const opts = kind === 'side' ? ['Left', 'Right', 'Both'].map(v => ({ v, label: v })) : []
    const detailOptions = kind === 'dur' ? scrubChips('detail', 'dur')
      : kind === 'amount' ? scrubChips('detail', this.amountKey())
      : opts.map(o => ({ label: o.label, onTap: () => this.setState({ detail: o.v }), ...this.chip(s.detail === o.v, st.color) }))
    const kind2 = st.key === 'bottle' ? 'milk' : st.key === 'nurse' || st.key === 'pump' ? 'mins' : null
    const opts2 = kind2 === 'milk' ? [{ v: 'breastmilk', label: 'Breast milk' }, { v: 'formula', label: 'Formula' }] : []
    const detail2Options = kind2 === 'mins' ? scrubChips('detail2', 'mins')
      : opts2.map(o => ({ label: o.label, onTap: () => this.setState(x => ({ detail2: x.detail2 === o.v ? null : o.v })), ...this.chip(s.detail2 === o.v, st.color) }))
    const detailStr = (kind === 'amount' ? (s.detail != null ? ' ' + s.detail + ' ' + this.unit() : '') : kind === 'side' ? ' ' + (s.detail || '') : kind === 'dur' ? ' ' + this.dur(s.detail) : '')
      + (s.detail2 != null ? (kind2 === 'milk' ? ' · ' + (s.detail2 === 'formula' ? 'formula' : 'breast milk') : ' · ' + this.dur(s.detail2)) : '')

    // nursing/pump/sleep default to the live timer; a manual toggle logs a past session
    const timerType = (st.key === 'nurse' || st.key === 'pump' || st.key === 'sleep') && !s.editId
    const timerFirst = timerType && !s.manualDur
    const at = s.activeTimer
    const atType = at ? T(at.type) : null

    const feed = this.lastOf(FEEDS), dia = this.lastOf(DIAPERS), sleep = this.lastOf(['sleep'])
    const handoffRows = [
      { label: 'Last fed', value: feed ? this.elapsed(feed.t) + ' ago' : '—' },
      { label: 'That feed was', value: feed ? (feed.type === 'bottle' ? (this.fmtDetail(feed.detail) || feed.detail + ' ' + this.unit()) + ' bottle' : 'nursed, ' + (feed.detail ? this.fmtDetail(feed.detail) || feed.detail : 'either')) : '—' },
      ...(this.trackOn('diapers') ? [{ label: 'Last diaper', value: dia ? this.elapsed(dia.t) + ' ago · ' + (dia.type === 'both' ? 'wet + dirty' : dia.type) : '—' }] : []),
      ...(this.trackOn('sleep') ? [{ label: 'Last nap ended', value: sleep ? this.elapsed(sleep.t) + ' ago · ' + this.dur(sleep.detail) : '—' }] : []),
      { label: 'Today so far', value: td.filter(e => FEEDS.includes(e.type)).length + ' feeds' + (this.trackOn('diapers') ? ' / ' + td.filter(e => DIAPERS.includes(e.type)).length + ' diapers' : '') },
    ]

    const week = live.filter(e => e.t >= midnight.getTime() - 6 * DAY)
    const feedsWk = week.filter(e => FEEDS.includes(e.type))
    const ozWk = week.filter(e => e.type === 'bottle').reduce((a, e) => a + (dSplit(e.detail).n || 0), 0)
    const naps = week.filter(e => e.type === 'sleep')
    // wake window: one sleep's end (t) to the next sleep's start (t − duration)
    const sleepsAsc = [...naps].sort((a, b) => a.t - b.t)
    const wakes = []
    for (let i = 1; i < sleepsAsc.length; i++) {
      const w = (sleepsAsc[i].t - (Number(sleepsAsc[i].detail) || 0) * 60000) - sleepsAsc[i - 1].t
      if (w > 0 && w < 8 * 3600000) wakes.push(w) // longer gaps are overnight or unlogged sleep
    }
    const avgWake = wakes.length ? Math.round(wakes.reduce((a, b) => a + b, 0) / wakes.length / 60000) : 0
    const ageI = this.ageInfo()
    const sorted = feedsWk.map(e => e.t).sort((a, b) => a - b)
    const starts = sessionStarts(sorted)
    const clustered = sorted.length - starts.length // feeds folded into a cluster session
    let gaps = []
    for (let i = 1; i < starts.length; i++) gaps.push((starts[i] - starts[i - 1]) / 60000)
    const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0
    const longest = gaps.length ? Math.max(...gaps) : 0
    const stats = [
      { label: 'Feeds / day', value: (feedsWk.length / 7).toFixed(1), unit: 'avg' },
      { label: this.unit() + ' / day', value: Math.round(this.amt(ozWk / 7)), unit: 'bottles only' },
      ...(this.trackOn('diapers') ? [{ label: 'Diapers / day', value: (week.filter(e => DIAPERS.includes(e.type)).length / 7).toFixed(1), unit: 'avg' }] : []),
      ...(this.trackOn('sleep') ? [
        { label: 'Sleep logged', value: this.dur(Math.round(naps.reduce((a, e) => a + (Number(e.detail) || 0), 0) / 7)), unit: '/ day' },
        { label: 'Wake window', value: avgWake ? this.dur(avgWake) : '—', unit: 'avg' },
      ] : []),
    ]

    // nudge to switch off a daily-expected tracker that clearly isn't being used
    let trackRec = null
    if (week.length >= 20) {
      for (const tr of TRACKS) {
        if (!['diapers', 'sleep', 'meds'].includes(tr.key)) continue // baths/pumping are legitimately occasional
        if (!this.trackOn(tr.key) || s.settings.dismissed.includes(tr.key)) continue
        const n = week.filter(e => tr.types.includes(e.type)).length
        if (n / 7 < 0.5) { trackRec = { key: tr.key, label: tr.label, n }; break }
      }
    }

    // shift window + plan progress
    const activeMine = sh && sh.state === 'active' && me && sh.user_id === me.id
    const activeTheirs = !!(partner && sh && sh.state === 'active' && sh.user_id === partner.id)
    const completed = sh && sh.state === 'completed'
    const incomingReq = !!(partner && sh && sh.state === 'requested' && sh.requester_id === partner.id)
    const shiftStart = (activeMine || activeTheirs || completed ? sh.started_at : null) || Date.now()
    const shiftEnd = completed ? sh.ended_at : null
    const shiftEntries = live.filter(e => e.t >= shiftStart && (!shiftEnd || e.t <= shiftEnd)).sort((a, b) => a.t - b.t)
    const matched = new Set()
    // my plan lives in s.plan (editable, pushed via /shifts/plan); the partner's
    // is read straight off the synced server shift — same rows, just read-only,
    // and every poke-to-pull refresh moves the done states along
    const plan = [...(activeTheirs ? sh.plan || [] : s.plan)].sort((a, b) => a.at - b.at).map(p => {
      const keys = FEEDS.includes(p.type) ? FEEDS : [p.type]
      const hit = shiftEntries.find(e => keys.includes(e.type) && !matched.has(e.id))
      if (hit) matched.add(hit.id)
      return { ...p, hit }
    })
    let nextSeen = false
    const planRows = plan.map(p => {
      const t = T(p.type), done = !!p.hit, isNext = !done && !nextSeen; if (isNext) nextSeen = true
      const late = !done && p.at < Date.now()
      const mins = Math.round(Math.abs(p.at - Date.now()) / 60000)
      const rel = mins < 60 ? mins + 'm' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
      return {
        label: (t.key === 'bottle' ? 'Feed' : t.label) + ' · ' + this.clock(p.at).replace(':00', ''),
        icon: t.icon, color: t.color,
        sub: done ? 'logged ' + this.clock(p.hit.t) + (p.hit.detail && FEEDS.includes(p.hit.type) ? ' · ' + (this.fmtDetail(p.hit.detail) || p.hit.detail) : '') : isNext ? (late ? 'running ' + rel + ' late' : 'next up') : 'later',
        when: done ? 'done' : late ? 'now' : 'in ' + rel,
        stateIcon: done ? 'check_circle' : isNext ? 'schedule' : 'radio_button_unchecked',
        stateColor: done ? 'var(--accent)' : isNext ? (late ? 'var(--warn)' : 'var(--accent-deep)') : 'var(--dim)',
        textColor: done ? 'var(--soft)' : 'var(--ink)', whenColor: done ? 'var(--soft)' : late ? 'var(--warn)' : 'var(--accent-deep)',
      }
    })
    const nextRow = planRows.find(r => r.stateIcon === 'schedule')
    const fmtPlanLabel = p => (p.type === 'bottle' ? 'Feed' : T(p.type).label)
    const rhythm = this.draftPlan()
    // one source for the incoming card's predicted chips and the accept sheet's
    // toggle rows — the card must preview exactly the plan the sheet opens with
    // (and acceptShift submits): the seeded draft when one exists, else the rhythm
    const draftSrc = s.planDraft || rhythm
    const requestPlan = draftSrc.filter(p => !s.planOff.includes(p.id)).map(p => ({ icon: T(p.type).icon, color: T(p.type).color, label: fmtPlanLabel(p) + ' ~' + this.clock(p.at) }))
    const requestPlanRows = draftSrc.map(p => {
      const off = s.planOff.includes(p.id)
      return { icon: T(p.type).icon, color: T(p.type).color, label: fmtPlanLabel(p), time: '~' + this.clock(p.at),
        toggleIcon: off ? 'toggle_off' : 'toggle_on', toggleColor: off ? 'var(--dim)' : 'var(--accent)',
        onToggle: () => this.setState(st2 => ({ planOff: off ? st2.planOff.filter(x => x !== p.id) : [...st2.planOff, p.id] })) }
    })
    const t1 = this.clock(rhythm[0].at), t2 = rhythm[1] ? this.clock(rhythm[1].at) : ''
    const sf = shiftEntries.filter(e => FEEDS.includes(e.type)), sd = shiftEntries.filter(e => DIAPERS.includes(e.type)), ss = shiftEntries.filter(e => e.type === 'sleep')
    const sOz = sf.filter(e => e.type === 'bottle').reduce((a, e) => a + (dSplit(e.detail).n || 0), 0)
    const reportRows = [
      { label: 'Feeds', value: sf.length ? sf.length + ' · ' + sf.map(e => this.clock(e.t)).join(', ') : 'none yet' },
      { label: 'Total from bottles', value: this.amt(sOz) + ' ' + this.unit() },
      ...(this.trackOn('diapers') ? [{ label: 'Diapers', value: sd.length ? sd.length + ' · ' + sd.map(e => e.type).join(', ') : 'none yet' }] : []),
      ...(this.trackOn('sleep') ? [{ label: 'Sleep logged', value: ss.length ? this.dur(ss.reduce((a, e) => a + (Number(e.detail) || 0), 0)) : 'none yet' }] : []),
      { label: 'Last thing', value: shiftEntries.length ? T(shiftEntries[shiftEntries.length - 1].type).label + ' · ' + this.clock(shiftEntries[shiftEntries.length - 1].t) : '—' },
    ]
    const reqMins = sh?.requested_at ? Math.round((Date.now() - sh.requested_at) / 60000) : 0

    // shiftUp keeps the sheet's content stable while it slides away
    const shiftUp = s.shiftOpen || s.shiftLeaving
    const showReport = shiftUp && completed && sh.id !== s.dismissedShiftId
    const iHandedBack = completed && me && sh.user_id === me.id
    const noteShown = completed ? (sh.handback_note || s.handbackNote) : s.handbackNote

    return {
      onboarding: s.screen === 'onboard', isHome: s.screen === 'home', isHistory: s.screen === 'history',
      isSettings: s.screen === 'settings',
      goSettings: () => {
        try { window.history.pushState({ blSettings: true }, '') } catch { /* back just exits */ }
        this.setState({
          screen: 'settings',
          // seed the editable account fields fresh each visit; abandoned edits don't linger
          acctName: me?.name || '', acctBabyName: s.babyName || '',
          acctOpen: null, acctError: null, acctEmail: '', acctEmailPw: '', acctPwCur: '', acctPwNew: '',
        })
      },
      settingsBack: () => {
        // consume our entry so the button and the back gesture stay in step
        if (window.history.state?.blSettings) return window.history.back()
        this.setState({ screen: 'history' })
      },
      showTabs: ['home', 'history', 'settings'].includes(s.screen),
      isSplash: s.screen === 'splash', isAuth: s.screen === 'auth', isLogin: s.authMode === 'login', isSignup: s.authMode === 'signup',
      goSplash: () => this.setState({ screen: 'splash', authError: null }),
      goLogin: () => this.setState({ screen: 'auth', authMode: 'login', authError: null }),
      goSignup: () => this.setState({ screen: 'auth', authMode: 'signup', authError: null }),
      authSubmit: this.authSubmit,
      authTitle: s.authMode === 'login' ? 'Welcome back' : 'Let’s set up your log',
      authBody: s.authMode === 'login' ? 'Your log is right where you left it — and whatever your partner added since.' : 'One account per grown-up. You’ll invite the other one in a second.',
      authCta: s.authBusy ? 'One sec…' : (s.authMode === 'login' ? 'Log in' : 'Create account'),
      authError: s.authError,
      authName: s.authName, setAuthName: e => this.setState({ authName: e.target.value }),
      authInvite: s.authInvite, setAuthInvite: e => this.setState({ authInvite: e.target.value }),
      authEmail: s.authEmail, setAuthEmail: e => this.setState({ authEmail: e.target.value }),
      authPassword: s.authPassword, setAuthPassword: e => this.setState({ authPassword: e.target.value }),
      socialTap: () => { this.setState({ toast: 'Email sign-in only for now', undoAction: null }); this.bumpToast() },
      forgotOpen: s.forgotOpen,
      toggleForgot: () => this.setState(x => ({ forgotOpen: !x.forgotOpen, forgotResult: null, forgotEmail: x.forgotEmail || x.authEmail })),
      forgotEmail: s.forgotEmail, setForgotEmail: e => this.setState({ forgotEmail: e.target.value, forgotResult: null }),
      sendForgot: this.sendForgot, forgotBusy: s.forgotBusy, forgotResult: s.forgotResult,
      forgotCopy: s.forgotResult === 'sent' ? 'If that email has a log here, a reset link is on its way — check spam too.'
        : s.forgotResult === 'unconfigured' ? 'This home server can’t send email yet — ask whoever runs it, or reset from the server.'
          : 'No signal — try again in a moment.',
      isReset: s.screen === 'reset',
      resetEmail: s.resetEmail,
      resetPw: s.resetPw, setResetPw: e => this.setState({ resetPw: e.target.value, resetError: null }),
      submitReset: this.submitReset, resetBusy: s.resetBusy, resetError: s.resetError,
      resetToLogin: () => this.setState({ screen: 'auth', authMode: 'login', authEmail: s.resetEmail, resetToken: null, resetPw: '', authError: null }),
      loginTabBg: s.authMode === 'login' ? 'var(--surface)' : 'transparent', loginTabFg: s.authMode === 'login' ? 'var(--ink)' : 'var(--soft)', loginTabShadow: s.authMode === 'login' ? '0 2px 8px rgba(38,35,29,0.08)' : 'none',
      signupTabBg: s.authMode === 'signup' ? 'var(--surface)' : 'transparent', signupTabFg: s.authMode === 'signup' ? 'var(--ink)' : 'var(--soft)', signupTabShadow: s.authMode === 'signup' ? '0 2px 8px rgba(38,35,29,0.08)' : 'none',
      goHome: () => this.setState({ screen: 'home' }), goHistory: () => this.setState({ screen: 'history', historyDay: null }),
      homeTabBg: s.screen === 'home' ? 'rgba(var(--accent-rgb),0.14)' : 'var(--surface)',
      homeTabFg: s.screen === 'home' ? 'var(--accent-deep)' : 'var(--soft)',
      histTabBg: s.screen === 'history' ? 'rgba(var(--accent-rgb),0.14)' : 'var(--surface)',
      histTabFg: s.screen === 'history' ? 'var(--accent-deep)' : 'var(--soft)',

      nameField: s.nameField, setName: e => this.setState({ nameField: e.target.value }),
      inviteField: s.inviteField, setInvite: e => this.setState({ inviteField: e.target.value }),
      sendInvite: this.sendInvite,
      dobField: s.dobField, setDob: e => this.setState({ dobField: e.target.value }),
      today: new Date().toISOString().slice(0, 10),
      finishOnboard: this.finishOnboard,

      babyName: s.babyName || 'Baby', ageLabel: this.ageInfo().label,
      dateLabel: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      sinceCards: cards, todaySummary, timeline,
      offline: s.offline,

      sheetOpen: s.sheet,
      sheetMounted: s.sheet || s.sheetLeaving, sheetShown: s.sheet && s.sheetIn,
      sheetBodyDown: this.sheetBodyDown, sheetBodyMove: this.sheetBodyMove, sheetBodyUp: this.sheetBodyUp,
      sheetTranslate: s.sheetDragY > 0 ? s.sheetDragY : (s.sheetTall ? Math.max(s.sheetDragY / 4, -18) : Math.max(s.sheetDragY / 2, -46)),
      sheetDragging: s.sheetDragging, sheetTall: s.sheetTall,
      sheetDragStart: this.sheetDragStart, sheetDragMove: this.sheetDragMove, sheetDragEnd: this.sheetDragEnd,
      sheetKicker: s.editId ? 'Editing entry'
        : (backMin < 1 ? 'stamped now' : this.dur(backMin) + ' earlier'),
      stampTime: this.clock(stampT),
      stampHM: String(new Date(stampT).getHours()).padStart(2, '0') + ':' + String(new Date(stampT).getMinutes()).padStart(2, '0'),
      pickTime: this.pickTime,
      showTimePicker: e => { try { e.currentTarget.showPicker() } catch { /* older browsers fall back to focus */ } },
      nudges, types,
      hasDetail: !!kind && !timerFirst, detailLabel: kind === 'amount' ? 'Amount' : kind === 'side' ? 'Side' : 'Duration', detailOptions,
      hasDetail2: !!kind2 && !timerFirst, detail2Label: kind2 === 'milk' ? 'Milk' : 'Duration', detail2Options,
      scrubMove: this.scrubMove, scrubEnd: this.scrubEnd,
      showStamp: !timerFirst,
      timerFirst,
      startTimerLabel: 'Start ' + (st.key === 'nurse' ? 'nursing' : st.key === 'sleep' ? 'sleep timer' : 'pumping'),
      startTimer: () => this.startTimer(st.key),
      canManual: timerType,
      toManual: () => this.setState({ manualDur: true }),
      toTimer: () => this.setState({ manualDur: false }),
      manualHint: st.key === 'nurse' ? 'Log a past feed' : st.key === 'sleep' ? 'Log a past sleep' : 'Log a past session',
      // running-timer banner on Now
      timerActive: !!at,
      timerLabel: at ? (at.type === 'nurse' ? 'Nursing' : at.type === 'sleep' ? 'Sleep' : 'Pumping') : '',
      timerIcon: atType ? atType.icon : 'timer',
      timerColor: atType ? atType.color : OLIVE,
      timerElapsed: at ? this.stopwatch(Date.now() - at.started_at) : '',
      timerMine: !!(at && me && at.user_id === me.id),
      timerWho: at ? (at.user_id === me?.id ? 'You' : partnerName) : '',
      stopTimer: this.stopTimer,
      saveLabel: (s.editId ? 'Update ' : 'Save ') + st.label.toLowerCase() + detailStr,
      editing: !!s.editId, toast: !!s.toast, toastText: s.toast || '', toastLeaving: s.toastLeaving, canUndo: !!s.undoAction,
      openSheet: this.openSheet, closeSheet: this.closeSheet, save: this.save, undo: this.undo, remove: this.remove,

      handoffRows,
      hasPartner: !!partner,
      partnerName, myName,
      partnerInitial: initial(partner?.name), myInitial: initial(me?.name),
      incoming: incomingReq && s.screen === 'home',
      mine: iAmOnDuty && !!partner && activeMine,
      theirs: activeTheirs && !iAmOnDuty,
      theirShiftSub: activeTheirs ? 'since ' + this.clock(shiftStart) + (sh.until ? ' · ' + sh.until.charAt(0).toLowerCase() + sh.until.slice(1) : '') : '',
      dutyInitial: iAmOnDuty ? initial(me?.name) : initial(partner?.name),
      dutyColor: iAmOnDuty ? ME_COLOR : PARTNER_COLOR,
      dutyLabel: partner ? (iAmOnDuty ? 'You · on duty' : partnerName + ' · on duty') : 'Just you so far',
      footerShiftLabel: iAmOnDuty ? 'Hand off' : 'Take over',
      requestAgo: 'asked ' + (reqMins < 1 ? 'just now' : reqMins + ' min ago'),
      requestNote: (sh && sh.note) || ('Can you take ' + (s.babyName || 'the baby') + '? Next feeds look like ' + t1 + ' and ' + t2 + ' — that’s the usual rhythm.'),
      requestPlan, requestPlanRows,
      untilOptions: ['Until she wakes', 'Until 6 AM', 'Open-ended'].map(u => {
        const on = s.until === u
        return { label: u, onTap: () => this.setState({ until: u }), ...(on ? { bg: 'rgba(var(--accent-rgb),0.16)', border: OLIVE, fg: 'var(--accent-deep)' } : { bg: 'var(--surface)', border: 'rgba(var(--ink-rgb),0.12)', fg: 'var(--muted)' }) }
      }),
      theirShiftLine: completed ? (partnerName + ' has been on since ' + this.clock(sh.ended_at)) : (partnerName + ' has ' + (s.babyName || 'the baby') + ' right now'),
      shiftMounted: shiftUp, shiftShown: s.shiftOpen && s.shiftIn,
      sheetTheirs: shiftUp && !iAmOnDuty && !showReport,
      sheetMine: shiftUp && iAmOnDuty && !showReport,
      sheetReport: showReport,
      reportTitle: iHandedBack ? partnerName + '’s back on' : (partnerName + ' handed back'),
      openShift: this.openShift, closeShift: this.closeShift, acceptShift: this.acceptShift, handBack: this.handBack, addPlanFeed: this.addPlanFeed,
      requestHandoff: this.requestHandoff,
      canRequest: iAmOnDuty && !!partner && !(sh && sh.state === 'requested'),
      shiftSince: 'since ' + this.clock(shiftStart), shiftElapsed: this.elapsed(shiftStart),
      nextUp: nextRow ? 'Next: ' + nextRow.label.split(' · ')[0].toLowerCase() + ' ' + nextRow.when : 'Plan done',
      plan: planRows, reportRows,
      reportRange: this.clock(shiftStart) + ' – ' + this.clock(shiftEnd || Date.now()) + ' · ' + this.elapsed(shiftStart) + ' on duty',
      handbackNote: s.handbackNote, reportNote: noteShown, hasHandbackNote: !!noteShown,
      setHandbackNote: e => this.setState({ handbackNote: e.target.value }),

      historySubtitle: feedsWk.length + ' feeds' + (this.trackOn('diapers') ? ' · ' + week.filter(e => DIAPERS.includes(e.type)).length + ' diapers' : '') + ' logged',
      historyDays, dayView,
      stats, feedBars: this.bars(FEEDS, 'oklch(0.60 0.075 130)'), diaperBars: this.bars(DIAPERS, 'oklch(0.60 0.075 210)'),
      feedUnitLabel: 'feeds',
      showDiaperChart: this.trackOn('diapers'),
      patternTitle: avgGap ? 'Roughly every ' + this.dur(avgGap) + ' between feeds' : 'Patterns show up after a few feeds',
      patternBody: avgGap
        ? 'Longest stretch this week was ' + this.dur(Math.round(longest)) + '.'
          + (clustered ? ' Cluster feeds (' + clustered + ' within 45m of the one before) count as one feed here, so they don’t drag the average down.' : '')
          + (ageI.weeks != null ? ' Typical at ' + ageI.label + ': ' + normFor(FEED_NORMS, ageI.weeks) + '.' : '')
        : 'Keep logging — once there’s a rhythm, it shows up here.',
      wakeInsight: this.trackOn('sleep') && avgWake ? {
        title: 'Awake about ' + this.dur(avgWake) + ' between naps',
        body: ageI.weeks != null
          ? 'Typical at ' + ageI.label + ' is ' + normFor(WAKE_NORMS, ageI.weeks) + '. Watching this stretch out over the weeks is the rhythm maturing — not something to fight.'
          : 'Add ' + (s.babyName || 'the baby') + '’s birthday below and this compares against what’s typical for their age.',
      } : null,
      trackRec: trackRec ? {
        title: 'Not tracking ' + trackRec.label.toLowerCase() + '?',
        body: (trackRec.n ? 'Only ' + trackRec.n + ' logged' : 'Nothing logged') + ' in the last 7 days. Turning it off hides its cards and charts — nothing is deleted, and it comes back if you switch it on again.',
        offLabel: 'Turn off ' + trackRec.label.toLowerCase(),
        turnOff: () => this.setTracking(trackRec.key, false),
        keep: () => this.dismissRec(trackRec.key),
      } : null,
      birthdate: s.babyBirthdate || '', setBirthdate: this.setBirthdate,
      ageLine: s.babyBirthdate ? ageI.label + ' old' : 'Set it and the log thinks in their weeks — insights compare against their age.',
      notify: (() => {
        const np = this.nPrefs()
        const row = (key, label, icon, color) => ({
          key, label, icon, color, on: !!np[key],
          toggleIcon: np[key] ? 'toggle_on' : 'toggle_off', toggleColor: np[key] ? 'var(--accent)' : 'var(--dim)',
          onToggle: () => this.setNotify({ [key]: !np[key] }),
        })
        return {
          supported: pushSupported(),
          pushOn: s.pushOn,
          togglePush: this.togglePush,
          pushHint: !pushSupported()
            ? 'This browser can’t do push — on iPhone, add Baby Log to the Home Screen first, then look here again.'
            : s.pushOn ? 'This phone gets pings. Pick what’s worth one below — each grown-up sets their own.'
            : 'Flip it on and allow the permission — then pick what’s worth a ping.',
          rows: [
            row('handoff', 'Handoff asks & handbacks', 'swap_horiz', 'var(--accent)'),
            ...(partner ? [row('timer', partnerName + ' starts a timer', 'timer', 'oklch(0.60 0.075 350)')] : []),
            ...(partner ? [row('partner', partnerName + ' logs something', 'edit_note', 'oklch(0.60 0.075 300)')] : []),
            row('feed', 'Feed reminder', 'local_drink', 'oklch(0.60 0.075 250)'),
            ...(this.trackOn('sleep') ? [row('wake', 'Wake window watch', 'wb_twilight', 'oklch(0.60 0.075 25)')] : []),
            ...(this.trackOn('meds') ? [row('meds', 'Daily meds nudge', 'medication', 'oklch(0.60 0.075 150)')] : []),
            row('quiet', 'Quiet hours', 'do_not_disturb_on', 'oklch(0.60 0.075 210)'),
          ],
          feedOn: np.feed,
          feedChips: [[null, 'Rhythm'], [120, '2h'], [150, '2½h'], [180, '3h'], [210, '3½h'], [240, '4h']
          ].map(([v2, label]) => ({ label, onTap: () => this.setNotify({ feedEvery: v2 }), ...this.chip(np.feedEvery === v2, OLIVE) })),
          onDutyOnly: np.onDutyOnly,
          onDutyToggleIcon: np.onDutyOnly ? 'toggle_on' : 'toggle_off',
          onDutyToggleColor: np.onDutyOnly ? 'var(--accent)' : 'var(--dim)',
          toggleOnDuty: () => this.setNotify({ onDutyOnly: !np.onDutyOnly }),
          medsOn: np.meds, medsTime: np.medsTime,
          setMedsTime: e => e.target.value && this.setNotify({ medsTime: e.target.value }),
          quietOn: np.quiet, quietStart: np.quietStart, quietEnd: np.quietEnd,
          setQuietStart: e => e.target.value && this.setNotify({ quietStart: e.target.value }),
          setQuietEnd: e => e.target.value && this.setNotify({ quietEnd: e.target.value }),
        }
      })(),
      unitChips: ['oz', 'ml'].map(u => ({
        key: u, label: u, on: this.unit() === u, onTap: () => this.setUnit(u),
      })),
      unitWord: this.unit() === 'ml' ? 'millilitres' : 'ounces',
      trackRows: TRACKS.map(tr => {
        const on = this.trackOn(tr.key), tt = T(tr.types[0])
        return { key: tr.key, on, label: tr.label, icon: tt.icon, color: tt.color,
          toggleIcon: on ? 'toggle_on' : 'toggle_off', toggleColor: on ? 'var(--accent)' : 'var(--dim)',
          onToggle: () => this.setTracking(tr.key, !on) }
      }),
      medNameField: s.settings.medName ?? '', setMedName: this.setMedName,
      widgetRows: (() => {
        const shown = this.widgetKeys()
        return WIDGETS.filter(w => !w.track || this.trackOn(w.track)).map(w => {
          const on = shown.includes(w.key)
          return { label: w.label, icon: w.icon, color: w.color,
            toggleIcon: on ? 'toggle_on' : 'toggle_off', toggleColor: on ? 'var(--accent)' : 'var(--dim)',
            onToggle: () => this.setWidget(w.key, !on) }
        })
      })(),
      appearance: {
        accents: Object.entries(THEME_ACCENTS).map(([key, a]) => ({
          key, label: a.label, color: a.accent,
          on: (s.settings.theme?.accent || 'olive') === key,
          onTap: () => this.setTheme({ accent: key }),
        })),
        bgs: Object.entries(THEME_BGS).map(([key, b]) => ({
          key, label: b.label, color: b.bg,
          on: (s.settings.theme?.bg || 'cream') === key,
          onTap: () => this.setTheme({ bg: key }),
        })),
        modes: [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([key, label]) => ({
          key, label, on: (s.fx.mode || 'auto') === key, onTap: () => this.setFxMode(key),
        })),
        tilt: { on: !!s.fx.tilt, onToggle: this.toggleTilt },
      },
      exportLog: this.exportLog, exportSummary: this.exportSummary,
      exportRanges: [[7, '7 days'], [30, '30 days'], ['all', 'Everything']].map(([val, label]) => {
        const on = s.exportRange === val
        return { label, onTap: () => this.setState({ exportRange: val }), ...(on ? { bg: 'rgba(var(--accent-rgb),0.16)', border: OLIVE, fg: 'var(--accent-deep)' } : { bg: 'var(--surface)', border: 'rgba(var(--ink-rgb),0.12)', fg: 'var(--muted)' }) }
      }),
      account: {
        babyName: s.acctBabyName, setBabyName: e => this.setState({ acctBabyName: e.target.value }),
        saveBabyName: this.saveBabyName,
        name: s.acctName, setName: e => this.setState({ acctName: e.target.value }),
        saveName: this.saveMyName,
        email: me?.email || '',
        open: s.acctOpen, toggle: this.toggleAcct,
        emailField: s.acctEmail, setEmailField: e => this.setState({ acctEmail: e.target.value, acctError: null }),
        emailPw: s.acctEmailPw, setEmailPw: e => this.setState({ acctEmailPw: e.target.value, acctError: null }),
        submitEmail: this.submitAcctEmail,
        pwCur: s.acctPwCur, setPwCur: e => this.setState({ acctPwCur: e.target.value, acctError: null }),
        pwNew: s.acctPwNew, setPwNew: e => this.setState({ acctPwNew: e.target.value, acctError: null }),
        submitPassword: this.submitAcctPassword,
        busy: s.acctBusy, error: s.acctError,
      },
      logout: () => this.doLogout(true),
      invitePending: s.invitePending, inviteCode: s.inviteCode, inviteMailed: s.inviteMailed,
    }
  }

  render() {
    const v = this.renderVals()
    return (
      <div className="app">
        {/* background illustration + wash; .fx-* layers drift on --par-x/--par-y
            from fx.js — each layer's negative inset covers its travel distance */}
        <div style={S('position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden')}>
          <div className="fx-layer fx-far" style={S('position:absolute;inset:-14px')}>
            <img className="bg-art" src="/art/app-bg.png" alt="" style={S('width:100%;height:100%;object-fit:cover;display:block')} />
          </div>
          <div className="fx-layer fx-mid" style={S('position:absolute;inset:-24px')}>
            <div style={S('position:absolute;top:-8%;right:-16%;width:66%;aspect-ratio:1;border-radius:999px;background:radial-gradient(circle, rgba(var(--accent-rgb),0.16), rgba(var(--accent-rgb),0) 70%)')} />
            <div style={S('position:absolute;bottom:14%;left:-18%;width:58%;aspect-ratio:1;border-radius:999px;background:radial-gradient(circle, rgba(var(--accent-rgb),0.12), rgba(var(--accent-rgb),0) 70%)')} />
          </div>
          <div style={S('position:absolute;inset:0;background:linear-gradient(to bottom, rgba(250,246,239,0.25), rgba(250,246,239,0.6) 45%, rgba(250,246,239,0.85))')} />
          <div className="fx-layer fx-near" style={S('position:absolute;inset:-36px')}>
            <div style={S('position:absolute;top:22%;left:-12%;width:40%;aspect-ratio:1;border-radius:999px;background:radial-gradient(circle, rgba(var(--accent-rgb),0.10), rgba(var(--accent-rgb),0) 70%)')} />
          </div>
        </div>

        {v.isSplash && (
          <div style={S('flex:1;display:flex;flex-direction:column;align-items:center;padding:0 24px 22px;position:relative;z-index:1;min-height:0')}>
            <div style={S('flex:1')} />
            <div style={S('width:168px;height:168px;border-radius:999px;background:#FFFDF8;box-shadow:0 14px 40px rgba(38,35,29,0.12);display:flex;align-items:center;justify-content:center')}>
              <Duck size={116} />
            </div>
            <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:40px;letter-spacing:-0.03em;color:var(--accent-deep);padding-top:26px")}>Baby Log</div>
            <div style={S('font-size:16.5px;line-height:1.45;color:#6E6659;text-align:center;padding-top:8px;text-wrap:pretty;max-width:260px')}>Three taps, then back to the baby.<br />Both of you, one log.</div>
            <div style={S('flex:1.2')} />
            <button type="button" onClick={v.goSignup} className="hov-olive" style={S('width:100%;height:60px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit;box-shadow:0 8px 20px rgba(var(--accent-rgb),0.3)')}>
              <div style={S('font-size:17px;font-weight:700;color:#FCFBF6')}>Create an account</div>
            </button>
            <button type="button" onClick={v.goLogin} className="hov-cream" style={S('margin-top:10px;width:100%;height:56px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit')}>
              <div style={S('font-size:16px;font-weight:600;color:#4E4A3F')}>I already have one</div>
            </button>
            <div style={S('font-size:12px;color:#B5AC98;padding-top:16px')}>Works on iPhone and Android · add to home screen</div>
          </div>
        )}

        {v.isAuth && (
          <div style={S('flex:1;display:flex;flex-direction:column;padding:8px 24px 20px;overflow:auto;position:relative;z-index:1;min-height:0')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between')}>
              <button type="button" onClick={v.goSplash} className="hov-cream" style={S('width:38px;height:38px;border-radius:999px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.10);display:flex;align-items:center;justify-content:center;cursor:pointer')}>
                <Sym style={{ fontSize: 20, color: 'var(--muted)' }}>arrow_back</Sym>
              </button>
              <div style={S('display:flex;align-items:center;gap:6px')}>
                <Duck size={30} />
                <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:17px;letter-spacing:-0.02em;color:var(--accent-deep)")}>Baby Log</div>
              </div>
              <div style={S('width:38px')} />
            </div>
            <div style={S('display:flex;background:rgba(38,35,29,0.06);border-radius:999px;padding:4px;margin-top:26px')}>
              <button type="button" onClick={v.goLogin} style={S(`flex:1;height:40px;border:none;border-radius:999px;background:${v.loginTabBg};color:${v.loginTabFg};font-family:inherit;font-size:14.5px;font-weight:700;cursor:pointer;box-shadow:${v.loginTabShadow}`)}>Log in</button>
              <button type="button" onClick={v.goSignup} style={S(`flex:1;height:40px;border:none;border-radius:999px;background:${v.signupTabBg};color:${v.signupTabFg};font-family:inherit;font-size:14.5px;font-weight:700;cursor:pointer;box-shadow:${v.signupTabShadow}`)}>Sign up</button>
            </div>
            <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:28px;line-height:1.12;letter-spacing:-0.02em;padding-top:26px;text-wrap:pretty")}>{v.authTitle}</div>
            <div style={S('font-size:14.5px;line-height:1.5;color:#6E6659;padding-top:6px;text-wrap:pretty')}>{v.authBody}</div>
            <div style={S('display:flex;flex-direction:column;gap:10px;padding-top:22px')}>
              {v.isSignup && (
                <input placeholder="Your name" value={v.authName} onChange={v.setAuthName} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:18px;padding:15px 18px;font-size:16.5px;color:#26231D;outline:none')} />
              )}
              <input placeholder="Email" type="email" value={v.authEmail} onChange={v.setAuthEmail} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:18px;padding:15px 18px;font-size:16.5px;color:#26231D;outline:none')} />
              <input placeholder="Password" type="password" value={v.authPassword} onChange={v.setAuthPassword} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:18px;padding:15px 18px;font-size:16.5px;color:#26231D;outline:none')} />
              {v.isSignup && (
                <input placeholder="Invite code — only if a partner invited you" value={v.authInvite} onChange={v.setAuthInvite} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:18px;padding:15px 18px;font-size:16.5px;color:#26231D;outline:none')} />
              )}
            </div>
            {v.isLogin && (
              <div style={S('display:flex;justify-content:flex-end;padding-top:10px')}><a href="#" onClick={e => { e.preventDefault(); v.toggleForgot() }} style={S('font-size:13.5px;font-weight:600;color:#5F6E42')}>Forgot password?</a></div>
            )}
            {v.isLogin && v.forgotOpen && (
              <div style={S('margin-top:10px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.10);border-radius:24px;padding:16px 18px')}>
                <div style={S('font-size:13.5px;font-weight:700;color:#26231D')}>Reset your password</div>
                <div style={S('font-size:12.5px;line-height:1.5;color:#8C8474;padding-top:4px;text-wrap:pretty')}>We’ll email you a link to set a new one.</div>
                <div style={S('display:flex;gap:8px;padding-top:10px')}>
                  <input placeholder="Email" type="email" value={v.forgotEmail} onChange={v.setForgotEmail} style={S('flex:1;min-width:0;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;padding:11px 16px;font-size:14.5px;color:#26231D;outline:none')} />
                  <button type="button" onClick={v.sendForgot} className="hov-olive" style={S('height:42px;padding:0 18px;background:var(--accent);border:none;border-radius:999px;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;color:#FCFBF6;flex-shrink:0')}>{v.forgotBusy ? 'One sec…' : 'Send'}</button>
                </div>
                {v.forgotResult && (
                  <div style={S(`font-size:12.5px;line-height:1.5;padding-top:10px;text-wrap:pretty;color:${v.forgotResult === 'error' ? '#A85A45' : '#6E6659'}`)}>{v.forgotCopy}</div>
                )}
              </div>
            )}
            {v.authError && (
              <div style={S('font-size:13px;line-height:1.4;color:#A85A45;padding-top:12px;text-wrap:pretty')}>{v.authError}</div>
            )}
            <button type="button" onClick={v.authSubmit} className="hov-olive" style={S('margin-top:18px;width:100%;height:60px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit;box-shadow:0 8px 20px rgba(var(--accent-rgb),0.3)')}>
              <div style={S('font-size:17px;font-weight:700;color:#FCFBF6')}>{v.authCta}</div>
              <Sym style={{ fontSize: 21, color: 'var(--on-accent)' }}>arrow_forward</Sym>
            </button>
            <div style={S('display:flex;align-items:center;gap:12px;padding:20px 0 14px')}>
              <div style={S('flex:1;height:1px;background:rgba(38,35,29,0.10)')} />
              <div style={S('font-size:12.5px;color:#B5AC98')}>or</div>
              <div style={S('flex:1;height:1px;background:rgba(38,35,29,0.10)')} />
            </div>
            <div style={S('display:flex;flex-direction:column;gap:8px')}>
              <button type="button" onClick={v.socialTap} className="hov-cream" style={S('width:100%;height:52px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;color:#26231D')}>Continue with Apple</button>
              <button type="button" onClick={v.socialTap} className="hov-cream" style={S('width:100%;height:52px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;color:#26231D')}>Continue with Google</button>
            </div>
            <div style={S('flex:1')} />
            <div style={S('font-size:12px;line-height:1.5;color:#B5AC98;text-align:center;padding-top:16px;text-wrap:pretty')}>Invited by a partner? Use the same email they sent it to and you’ll land in their log.</div>
          </div>
        )}

        {v.isReset && (
          <div style={S('flex:1;display:flex;flex-direction:column;padding:8px 24px 20px;overflow:auto;position:relative;z-index:1;min-height:0')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between')}>
              <button type="button" onClick={v.resetToLogin} className="hov-cream" style={S('width:38px;height:38px;border-radius:999px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.10);display:flex;align-items:center;justify-content:center;cursor:pointer')}>
                <Sym style={{ fontSize: 20, color: 'var(--muted)' }}>arrow_back</Sym>
              </button>
              <div style={S('display:flex;align-items:center;gap:6px')}>
                <Duck size={30} />
                <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:17px;letter-spacing:-0.02em;color:var(--accent-deep)")}>Baby Log</div>
              </div>
              <div style={S('width:38px')} />
            </div>
            <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:28px;line-height:1.12;letter-spacing:-0.02em;padding-top:26px;text-wrap:pretty")}>Set a new password</div>
            <div style={S('font-size:14.5px;line-height:1.5;color:#6E6659;padding-top:6px;text-wrap:pretty')}>For {v.resetEmail} — pick something with at least 8 characters. Your log is untouched.</div>
            <div style={S('display:flex;flex-direction:column;gap:10px;padding-top:22px')}>
              <input placeholder="New password" type="password" value={v.resetPw} onChange={v.setResetPw} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:18px;padding:15px 18px;font-size:16.5px;color:#26231D;outline:none')} />
            </div>
            {v.resetError && (
              <div style={S('font-size:13px;line-height:1.4;color:#A85A45;padding-top:12px;text-wrap:pretty')}>{v.resetError}</div>
            )}
            <button type="button" onClick={v.submitReset} className="hov-olive" style={S('margin-top:18px;width:100%;height:60px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit;box-shadow:0 8px 20px rgba(var(--accent-rgb),0.3)')}>
              <div style={S('font-size:17px;font-weight:700;color:#FCFBF6')}>{v.resetBusy ? 'One sec…' : 'Save new password'}</div>
              <Sym style={{ fontSize: 21, color: 'var(--on-accent)' }}>arrow_forward</Sym>
            </button>
            <div style={S('flex:1')} />
            <div style={S('font-size:12px;line-height:1.5;color:#B5AC98;text-align:center;padding-top:16px;text-wrap:pretty')}>Reset links work once and expire after about an hour — ask for a fresh one from “Forgot password?” if this one is stale.</div>
          </div>
        )}

        {v.onboarding && (
          <div style={S('flex:1;display:flex;flex-direction:column;padding:24px 24px 20px;overflow:auto;position:relative;z-index:1;min-height:0')}>
            <div style={S('padding:6px 0 34px')}>
              <div style={S('display:flex;align-items:center;gap:6.4px')}>
                <Duck size={32} />
                <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:19px;letter-spacing:-0.02em;color:var(--accent-deep)")}>Baby Log</div>
              </div>
            </div>
            <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:32px;line-height:1.1;letter-spacing:-0.025em;text-wrap:pretty")}>Who are we keeping track of?</div>
            <div style={S('font-size:15px;line-height:1.5;color:#6E6659;padding-top:10px;text-wrap:pretty')}>Two answers and you’re logging. Everything else can wait.</div>

            <div style={S('display:flex;flex-direction:column;gap:14px;padding-top:26px')}>
              <div style={S('display:flex;flex-direction:column;gap:7px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Baby’s name</div>
                <input value={v.nameField} onChange={v.setName} placeholder="Wren" style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:16px;padding:15px 16px;font-size:17px;color:#26231D;outline:none')} />
              </div>

              <div style={S('display:flex;flex-direction:column;gap:7px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Born on</div>
                <input type="date" value={v.dobField} onChange={v.setDob} max={v.today} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:16px;padding:15px 16px;font-size:17px;color:#26231D;outline:none;font-family:inherit')} />
                <div style={S('font-size:12.5px;color:#8C8474;padding-left:2px')}>So the log can think in their weeks — feeds, naps, and wake windows all change with age.</div>
              </div>

              <div style={S('display:flex;flex-direction:column;gap:7px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Who else logs?</div>
                <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:16px;padding:4px 4px 4px 16px;display:flex;align-items:center;gap:8px')}>
                  <input value={v.inviteField} onChange={v.setInvite} placeholder="katrina@email.com" type="email" style={S('flex:1;min-width:0;background:none;border:none;padding:13px 0;font-size:16px;color:#26231D;outline:none')} />
                  <button type="button" onClick={v.sendInvite} style={S('background:rgba(var(--accent-rgb),0.14);border:none;border-radius:12px;padding:11px 14px;font-family:inherit;font-size:13.5px;font-weight:600;color:#5F6E42;cursor:pointer')}>Invite</button>
                </div>
                <div style={S('font-size:12.5px;color:#8C8474;padding-left:2px')}>They see the same log live. No “when did you…” texts.</div>
              </div>
            </div>

            <div style={S('flex:1')} />
            <button type="button" onClick={v.finishOnboard} className="hov-olive" style={S('margin-top:24px;width:100%;height:60px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(var(--accent-rgb),0.3)')}>
              <div style={S('font-size:17px;font-weight:600;color:#FCFBF6;letter-spacing:-0.01em')}>Start logging</div>
              <Sym style={{ fontSize: 21, color: 'var(--on-accent)' }}>arrow_forward</Sym>
            </button>
          </div>
        )}

        {v.isHome && (
          <div style={S('flex:1;display:flex;flex-direction:column;min-height:0;position:relative;z-index:1')}>
            <div style={S('padding:10px 20px 14px;display:flex;align-items:center;justify-content:space-between')}>
              <div style={S('display:flex;align-items:center;gap:10px')}>
                <Duck size={38} />
                <div style={S('display:flex;flex-direction:column;gap:1px')}>
                  <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:23px;letter-spacing:-0.02em")}>{v.babyName}</div>
                  <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;letter-spacing:0.06em")}>{v.ageLabel} · {v.dateLabel}{v.offline ? ' · offline' : ''}</div>
                </div>
              </div>
              <button type="button" onClick={v.openShift} className="hov-bd" style={S('display:flex;align-items:center;gap:8px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.08);border-radius:999px;padding:5px 13px 5px 6px;cursor:pointer;font-family:inherit')}>
                <div style={S(`width:24px;height:24px;border-radius:999px;background:${v.dutyColor};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#FCFBF6`)}>{v.dutyInitial}</div>
                <div style={S('font-size:12.5px;color:#6E6659;font-weight:500')}>{v.dutyLabel}</div>
              </button>
            </div>

            <div style={S('flex:1;overflow:auto;padding:0 16px 20px;min-height:0')}>

              {v.timerActive && (
                <div style={S(`background:#FFFDF8;border:1px solid ${v.timerColor};border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:14px 16px;margin-bottom:12px;display:flex;align-items:center;gap:13px;position:relative;overflow:hidden`)}>
                  <div style={S(`position:absolute;inset:0;opacity:0.06;background:${v.timerColor}`)} />
                  <div style={S('position:relative;width:42px;height:42px;border-radius:999px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0')}>
                    <div style={S(`position:absolute;inset:0;background:${v.timerColor};opacity:0.18`)} />
                    <Sym style={{ position: 'relative', fontSize: 22, color: v.timerColor }}>{v.timerIcon}</Sym>
                  </div>
                  <div style={S('position:relative;flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                    <div style={S('font-size:15px;font-weight:700;letter-spacing:-0.01em')}>{v.timerLabel} · {v.timerWho}</div>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:700;font-size:24px;letter-spacing:-0.03em;color:#3D392F;font-variant-numeric:tabular-nums")}>{v.timerElapsed}</div>
                  </div>
                  {v.timerMine ? (
                    <button type="button" onClick={v.stopTimer} className="hov-dark" style={S('position:relative;height:44px;padding:0 20px;background:#26231D;border:none;border-radius:999px;display:flex;align-items:center;gap:7px;cursor:pointer;font-family:inherit;flex-shrink:0')}>
                      <Sym style={{ fontSize: 18, color: 'var(--bg)' }}>stop</Sym>
                      <div style={S('font-size:14px;font-weight:700;color:#FAF6EF')}>Stop</div>
                    </button>
                  ) : (
                    <div style={S("position:relative;font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;flex-shrink:0")}>in progress</div>
                  )}
                </div>
              )}

              {v.incoming && (
                <div style={S('background:#FFFDF8;border:1px solid rgba(var(--accent-rgb),0.35);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:16px 16px 14px;margin-bottom:12px;display:flex;flex-direction:column;gap:12px')}>
                  <div style={S('display:flex;align-items:center;gap:10px')}>
                    <div style={S(`width:34px;height:34px;border-radius:999px;background:${PARTNER_COLOR};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#FCFBF6`)}>{v.partnerInitial}</div>
                    <div style={S('flex:1;display:flex;flex-direction:column;gap:1px')}>
                      <div style={S('font-size:15px;font-weight:700;letter-spacing:-0.01em')}>{v.partnerName} is handing off</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>{v.requestAgo}</div>
                    </div>
                    <Sym style={{ fontSize: 22, color: 'var(--accent)' }}>swap_horiz</Sym>
                  </div>
                  <div style={S('font-size:15px;line-height:1.45;color:#4E4A3F;background:rgba(var(--accent-rgb),0.09);border-radius:16px;padding:12px 14px;text-wrap:pretty')}>“{v.requestNote}”</div>
                  <div style={S('display:flex;flex-direction:column;gap:6px')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>The plan for your shift</div>
                    <div style={S('display:flex;flex-wrap:wrap;gap:6px')}>
                      {v.requestPlan.map((p, i) => (
                        <div key={i} style={S('display:flex;align-items:center;gap:6px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;padding:6px 11px 6px 8px')}>
                          <Sym style={{ fontSize: 16, color: p.color }}>{p.icon}</Sym>
                          <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#4E4A3F")}>{p.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={S('display:flex;gap:8px;padding-top:2px')}>
                    <button type="button" onClick={v.acceptShift} className="hov-olive" style={S('flex:1;height:50px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit;box-shadow:0 6px 16px rgba(var(--accent-rgb),0.28)')}>
                      <Sym style={{ fontSize: 20, color: 'var(--on-accent)' }}>check</Sym>
                      <div style={S('font-size:15px;font-weight:700;color:#FCFBF6')}>I’ve got him</div>
                    </button>
                    <button type="button" onClick={v.openShift} className="hov-cream" style={S('height:50px;padding:0 18px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;color:#6E6659')}>Details</button>
                  </div>
                </div>
              )}

              {v.mine && (
                <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:14px 16px 8px;margin-bottom:12px;display:flex;flex-direction:column;gap:4px')}>
                  <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:6px')}>
                    <div style={S('display:flex;align-items:center;gap:9px')}>
                      <div style={S(`width:28px;height:28px;border-radius:999px;background:${ME_COLOR};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#FCFBF6`)}>{v.myInitial}</div>
                      <div style={S('display:flex;flex-direction:column')}>
                        <div style={S('font-size:15px;font-weight:700;letter-spacing:-0.01em')}>Your shift</div>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>{v.shiftSince}</div>
                      </div>
                    </div>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:var(--accent-deep);background:rgba(var(--accent-rgb),0.14);border-radius:999px;padding:5px 11px")}>{v.nextUp}</div>
                  </div>
                  {v.plan.map((p, i) => (
                    <div key={i} style={S('display:flex;align-items:center;gap:11px;padding:10px 0;border-top:1px solid rgba(38,35,29,0.06)')}>
                      <Sym style={{ fontSize: 21, color: p.stateColor }}>{p.stateIcon}</Sym>
                      <Sym style={{ fontSize: 18, color: p.color }}>{p.icon}</Sym>
                      <div style={S('flex:1;display:flex;flex-direction:column;gap:1px')}>
                        <div style={S(`font-size:14.5px;font-weight:600;color:${p.textColor}`)}>{p.label}</div>
                        <div style={S('font-size:12px;color:#8C8474')}>{p.sub}</div>
                      </div>
                      <div style={S(`font-family:'Nunito',sans-serif;font-weight:600;font-size:13px;color:${p.whenColor}`)}>{p.when}</div>
                    </div>
                  ))}
                  <div style={S('display:flex;align-items:center;justify-content:space-between;padding:8px 0 4px;border-top:1px solid rgba(38,35,29,0.06)')}>
                    <button type="button" onClick={v.addPlanFeed} className="hov-dim" style={S('background:none;border:none;display:flex;align-items:center;gap:5px;cursor:pointer;font-family:inherit;padding:4px 0')}>
                      <Sym style={{ fontSize: 17, color: 'var(--soft)' }}>add</Sym>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#8C8474")}>Add to plan</div>
                    </button>
                    <button type="button" onClick={v.openShift} className="hov-dim" style={S('background:none;border:none;display:flex;align-items:center;gap:5px;cursor:pointer;font-family:inherit;padding:4px 0')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#5F6E42")}>Hand back</div>
                      <Sym style={{ fontSize: 17, color: 'var(--accent-text)' }}>arrow_forward</Sym>
                    </button>
                  </div>
                </div>
              )}

              {v.theirs && (
                <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:14px 16px 8px;margin-bottom:12px;display:flex;flex-direction:column;gap:4px')}>
                  <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:6px')}>
                    <div style={S('display:flex;align-items:center;gap:9px')}>
                      <div style={S(`width:28px;height:28px;border-radius:999px;background:${PARTNER_COLOR};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#FCFBF6`)}>{v.partnerInitial}</div>
                      <div style={S('display:flex;flex-direction:column')}>
                        <div style={S('font-size:15px;font-weight:700;letter-spacing:-0.01em')}>{v.partnerName}’s shift</div>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>{v.theirShiftSub}</div>
                      </div>
                    </div>
                    {v.plan.length > 0 && (
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:var(--accent-deep);background:rgba(var(--accent-rgb),0.14);border-radius:999px;padding:5px 11px")}>{v.nextUp}</div>
                    )}
                  </div>
                  {v.plan.map((p, i) => (
                    <div key={i} style={S('display:flex;align-items:center;gap:11px;padding:10px 0;border-top:1px solid rgba(38,35,29,0.06)')}>
                      <Sym style={{ fontSize: 21, color: p.stateColor }}>{p.stateIcon}</Sym>
                      <Sym style={{ fontSize: 18, color: p.color }}>{p.icon}</Sym>
                      <div style={S('flex:1;display:flex;flex-direction:column;gap:1px')}>
                        <div style={S(`font-size:14.5px;font-weight:600;color:${p.textColor}`)}>{p.label}</div>
                        <div style={S('font-size:12px;color:#8C8474')}>{p.sub}</div>
                      </div>
                      <div style={S(`font-family:'Nunito',sans-serif;font-weight:600;font-size:13px;color:${p.whenColor}`)}>{p.when}</div>
                    </div>
                  ))}
                  <div style={S('display:flex;align-items:center;justify-content:center;padding:8px 0 4px;border-top:1px solid rgba(38,35,29,0.06)')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>{v.plan.length ? 'Their plan, live from the log — no need to ask' : 'No plan set — the log below updates live'}</div>
                  </div>
                </div>
              )}

              <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
                {v.sinceCards.map((c, i) => (
                  <div key={i} style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:14px 15px 13px;display:flex;flex-direction:column;gap:7px;position:relative;overflow:hidden')}>
                    <div style={S(`position:absolute;inset:0;opacity:0.06;background:${c.color}`)} />
                    <div style={S('display:flex;align-items:center;gap:7px;position:relative')}>
                      <div style={S('position:relative;width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;overflow:hidden')}>
                        <div style={S(`position:absolute;inset:0;background:${c.color};opacity:0.18`)} />
                        <Sym style={{ position: 'relative', fontSize: 15, color: c.color }}>{c.icon}</Sym>
                      </div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474")}>{c.label}</div>
                    </div>
                    <div style={S('position:relative;display:flex;align-items:baseline;gap:4px')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.04em")}>{c.elapsed}</div>
                      <div style={S('font-size:11px;color:#8C8474')}>ago</div>
                    </div>
                    <div style={S('position:relative;font-size:11.5px;color:#6E6659')}>{c.at}</div>
                  </div>
                ))}
              </div>

              <div style={S('display:flex;align-items:center;justify-content:space-between;padding:22px 4px 9px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#8C8474")}>Today</div>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;letter-spacing:0.04em")}>{v.todaySummary}</div>
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);overflow:hidden')}>
                {v.timeline.length === 0 && (
                  <div style={S('padding:22px 16px;text-align:center;font-size:13.5px;color:#B5AC98;text-wrap:pretty')}>Nothing logged yet — tap + and you’re three taps from done.</div>
                )}
                {v.timeline.map((e, i) => (
                  <button key={i} type="button" onClick={e.onEdit} className="hov-row" style={S('width:100%;background:none;border:none;border-top:1px solid rgba(38,35,29,0.06);padding:13px 15px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;font-family:inherit')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#6E6659;width:62px;flex-shrink:0;letter-spacing:-0.02em")}>{e.time}</div>
                    <div style={S('position:relative;width:36px;height:36px;border-radius:999px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0')}>
                      <div style={S(`position:absolute;inset:0;background:${e.color};opacity:0.16`)} />
                      <Sym style={{ position: 'relative', fontSize: 19, color: e.color }}>{e.icon}</Sym>
                    </div>
                    <div style={S('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                      <div style={S('font-size:15px;font-weight:600;letter-spacing:-0.01em')}>{e.label}</div>
                      <div style={S('font-size:11.5px;color:#8C8474')}>{e.sub}{e.pending && <PendingDot />}</div>
                    </div>
                    <Sym style={{ fontSize: 18, color: 'var(--dim)', flexShrink: 0 }}>chevron_right</Sym>
                  </button>
                ))}
              </div>
              <div style={S('text-align:center;padding:14px 0 0;font-size:12.5px;color:#B5AC98')}>Older days live in History</div>
            </div>
          </div>
        )}

        {v.isHistory && (
          <div style={S('flex:1;display:flex;flex-direction:column;min-height:0;position:relative;z-index:1')}>
            <div style={S('padding:10px 20px 12px;display:flex;align-items:center;gap:10px')}>
              {v.dayView ? (
                <>
                  <button type="button" onClick={v.dayView.back} className="hov-cream" style={S('width:38px;height:38px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.10);border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0')}>
                    <Sym style={{ fontSize: 20, color: 'var(--muted)' }}>arrow_back</Sym>
                  </button>
                  <div style={S('display:flex;flex-direction:column;gap:1px;min-width:0')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:23px;letter-spacing:-0.02em;white-space:nowrap")}>{v.dayView.label}</div>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;letter-spacing:0.06em")}>{v.dayView.sub}</div>
                  </div>
                  <div style={S('flex:1')} />
                  <button type="button" disabled={!v.dayView.prev} onClick={v.dayView.prev || undefined} className="hov-cream" style={S(`width:38px;height:38px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.10);border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:${v.dayView.prev ? 'pointer' : 'default'};flex-shrink:0`)}>
                    <Sym style={{ fontSize: 20, color: v.dayView.prev ? 'var(--muted)' : 'var(--faint)' }}>chevron_left</Sym>
                  </button>
                  <button type="button" disabled={!v.dayView.next} onClick={v.dayView.next || undefined} className="hov-cream" style={S(`width:38px;height:38px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.10);border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:${v.dayView.next ? 'pointer' : 'default'};flex-shrink:0`)}>
                    <Sym style={{ fontSize: 20, color: v.dayView.next ? 'var(--muted)' : 'var(--faint)' }}>chevron_right</Sym>
                  </button>
                </>
              ) : (
                <>
                  <Duck size={38} />
                  <div style={S('display:flex;flex-direction:column;gap:1px')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:23px;letter-spacing:-0.02em")}>Last 7 days</div>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;letter-spacing:0.06em")}>{v.historySubtitle}</div>
                  </div>
                  <div style={S('flex:1')} />
                  <button type="button" onClick={v.goSettings} className="hov-cream" style={S('width:38px;height:38px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.10);border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0')}>
                    <Sym style={{ fontSize: 20, color: 'var(--muted)' }}>settings</Sym>
                  </button>
                </>
              )}
            </div>

            <div style={S('flex:1;overflow:auto;padding:0 16px 20px;min-height:0')}>
              {v.dayView ? (
                <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);overflow:hidden')}>
                  {v.dayView.rows.length === 0 && (
                    <div style={S('padding:22px 16px;text-align:center;font-size:13.5px;color:#B5AC98;text-wrap:pretty')}>Nothing logged this day.</div>
                  )}
                  {v.dayView.rows.map((e, i) => (
                    <button key={i} type="button" onClick={e.onEdit} className="hov-row" style={S('width:100%;background:none;border:none;border-top:1px solid rgba(38,35,29,0.06);padding:13px 15px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;font-family:inherit')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#6E6659;width:62px;flex-shrink:0;letter-spacing:-0.02em")}>{e.time}</div>
                      <div style={S('position:relative;width:36px;height:36px;border-radius:999px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0')}>
                        <div style={S(`position:absolute;inset:0;background:${e.color};opacity:0.16`)} />
                        <Sym style={{ position: 'relative', fontSize: 19, color: e.color }}>{e.icon}</Sym>
                      </div>
                      <div style={S('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                        <div style={S('font-size:15px;font-weight:600;letter-spacing:-0.01em')}>{e.label}</div>
                        <div style={S('font-size:11.5px;color:#8C8474')}>{e.sub}{e.pending && <PendingDot />}</div>
                      </div>
                      <Sym style={{ fontSize: 18, color: 'var(--dim)', flexShrink: 0 }}>chevron_right</Sym>
                    </button>
                  ))}
                </div>
              ) : (
              <>
              <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
                {v.stats.map((st, i) => (
                  <div key={i} style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:24px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:13px 15px;display:flex;flex-direction:column;gap:4px')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474")}>{st.label}</div>
                    <div style={S('display:flex;align-items:baseline;gap:4px')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.04em")}>{st.value}</div>
                      <div style={S('font-size:11px;color:#8C8474')}>{st.unit}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:16px 16px 12px;margin-top:12px')}>
                <div style={S('display:flex;align-items:center;justify-content:space-between;padding-bottom:14px')}>
                  <div style={S('font-size:15px;font-weight:600;letter-spacing:-0.01em')}>Feeds per day</div>
                  <div style={S('display:flex;align-items:center;gap:6px')}>
                    <div style={S('width:9px;height:9px;border-radius:3px;background:var(--accent)')} />
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474;letter-spacing:0.06em")}>{v.feedUnitLabel}</div>
                  </div>
                </div>
                <div style={S('display:flex;align-items:flex-end;gap:8px;height:118px')}>
                  {v.feedBars.map((b, i) => (
                    <button key={i} type="button" onClick={b.onTap} style={S('flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;height:100%;justify-content:flex-end;background:none;border:none;padding:0;cursor:pointer;font-family:inherit')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#6E6659")}>{b.value}</div>
                      <div style={S(`width:100%;border-radius:8px 8px 3px 3px;background:${b.fill};height:${b.h}`)} />
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;letter-spacing:0.08em;color:#A79E8B")}>{b.day}</div>
                    </button>
                  ))}
                </div>
              </div>

              {v.showDiaperChart && (
              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:16px 16px 12px;margin-top:12px')}>
                <div style={S('display:flex;align-items:center;justify-content:space-between;padding-bottom:14px')}>
                  <div style={S('font-size:15px;font-weight:600;letter-spacing:-0.01em')}>Diapers per day</div>
                  <div style={S('display:flex;align-items:center;gap:6px')}>
                    <div style={S('width:9px;height:9px;border-radius:3px;background:oklch(0.60 0.075 210)')} />
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474;letter-spacing:0.06em")}>changes</div>
                  </div>
                </div>
                <div style={S('display:flex;align-items:flex-end;gap:8px;height:104px')}>
                  {v.diaperBars.map((b, i) => (
                    <button key={i} type="button" onClick={b.onTap} style={S('flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;height:100%;justify-content:flex-end;background:none;border:none;padding:0;cursor:pointer;font-family:inherit')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#6E6659")}>{b.value}</div>
                      <div style={S(`width:100%;border-radius:8px 8px 3px 3px;background:${b.fill};height:${b.h}`)} />
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;letter-spacing:0.08em;color:#A79E8B")}>{b.day}</div>
                    </button>
                  ))}
                </div>
              </div>
              )}

              <div style={S('background:rgba(var(--accent-rgb),0.10);border:1px solid rgba(var(--accent-rgb),0.22);border-radius:22px;padding:16px;margin-top:12px;display:flex;gap:12px;align-items:flex-start')}>
                <Sym style={{ fontSize: 20, color: 'var(--accent-text)', flexShrink: 0 }}>insights</Sym>
                <div style={S('display:flex;flex-direction:column;gap:3px')}>
                  <div style={S('font-size:14.5px;font-weight:600;color:var(--accent-deep)')}>{v.patternTitle}</div>
                  <div style={S('font-size:13px;line-height:1.5;color:#5F6E42;text-wrap:pretty')}>{v.patternBody}</div>
                </div>
              </div>

              {v.wakeInsight && (
                <div style={S('background:rgba(var(--accent-rgb),0.10);border:1px solid rgba(var(--accent-rgb),0.22);border-radius:22px;padding:16px;margin-top:12px;display:flex;gap:12px;align-items:flex-start')}>
                  <Sym style={{ fontSize: 20, color: 'var(--accent-text)', flexShrink: 0 }}>wb_twilight</Sym>
                  <div style={S('display:flex;flex-direction:column;gap:3px')}>
                    <div style={S('font-size:14.5px;font-weight:600;color:var(--accent-deep)')}>{v.wakeInsight.title}</div>
                    <div style={S('font-size:13px;line-height:1.5;color:#5F6E42;text-wrap:pretty')}>{v.wakeInsight.body}</div>
                  </div>
                </div>
              )}

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 0 4px;margin-top:12px;overflow:hidden')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 16px 6px")}>All days</div>
                {v.historyDays.map((d, i) => (
                  <button key={d.key} type="button" onClick={d.onTap} className="hov-row" style={S('width:100%;background:none;border:none;border-top:1px solid rgba(38,35,29,0.06);padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;font-family:inherit')}>
                    <div style={S('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                      <div style={S('font-size:14.5px;font-weight:600;letter-spacing:-0.01em')}>{d.label}</div>
                      <div style={S('font-size:11.5px;color:#8C8474')}>{d.sub}</div>
                    </div>
                    <Sym style={{ fontSize: 18, color: 'var(--dim)', flexShrink: 0 }}>chevron_right</Sym>
                  </button>
                ))}
              </div>

              {v.trackRec && (
                <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:22px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:16px;margin-top:12px;display:flex;flex-direction:column;gap:12px')}>
                  <div style={S('display:flex;gap:12px;align-items:flex-start')}>
                    <Sym style={{ fontSize: 20, color: 'var(--soft)', flexShrink: 0 }}>visibility_off</Sym>
                    <div style={S('display:flex;flex-direction:column;gap:3px')}>
                      <div style={S('font-size:14.5px;font-weight:600')}>{v.trackRec.title}</div>
                      <div style={S('font-size:13px;line-height:1.5;color:#6E6659;text-wrap:pretty')}>{v.trackRec.body}</div>
                    </div>
                  </div>
                  <div style={S('display:flex;gap:8px')}>
                    <button type="button" onClick={v.trackRec.turnOff} style={S('flex:1;background:rgba(var(--accent-rgb),0.16);border:1px solid var(--accent);border-radius:999px;padding:10px 6px;font-family:inherit;font-size:13px;font-weight:600;color:var(--accent-deep);cursor:pointer')}>{v.trackRec.offLabel}</button>
                    <button type="button" onClick={v.trackRec.keep} className="hov-cream" style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;padding:10px 18px;font-family:inherit;font-size:13px;font-weight:600;color:#6E6659;cursor:pointer')}>Keep</button>
                  </div>
                </div>
              )}

              </>
              )}
            </div>
          </div>
        )}

        {v.isSettings && (
          <div style={S('flex:1;display:flex;flex-direction:column;min-height:0;position:relative;z-index:1')}>
            <div style={S('padding:10px 20px 12px;display:flex;align-items:center;gap:10px')}>
              <button type="button" onClick={v.settingsBack} className="hov-cream" style={S('width:38px;height:38px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.10);border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0')}>
                <Sym style={{ fontSize: 20, color: 'var(--muted)' }}>arrow_back</Sym>
              </button>
              <div style={S('display:flex;flex-direction:column;gap:1px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:23px;letter-spacing:-0.02em")}>Settings</div>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;letter-spacing:0.06em")}>{v.babyName}’s log</div>
              </div>
            </div>

            <div style={S('flex:1;overflow:auto;padding:0 16px 20px;min-height:0')}>
              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>About {v.babyName}</div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 80)' }}>child_care</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Name</div>
                  <input value={v.account.babyName} onChange={v.account.setBabyName} onBlur={v.account.saveBabyName} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} placeholder="Baby" style={S("width:140px;box-sizing:border-box;text-align:right;background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:8px 10px;font-size:13.5px;color:#26231D;outline:none;font-family:'Nunito',sans-serif;font-weight:600")} />
                </div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 350)' }}>cake</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Born on</div>
                  <input type="date" value={v.birthdate} onChange={v.setBirthdate} max={v.today} style={S("background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:8px 10px;font-size:13.5px;color:#26231D;outline:none;font-family:'Nunito',sans-serif;font-weight:600")} />
                </div>
                <div style={S('font-size:12px;color:#B5AC98;padding-top:6px;text-wrap:pretty')}>{v.ageLine}</div>
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px;margin-top:12px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>Appearance</div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0 4px;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'var(--accent)' }}>palette</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Accent</div>
                </div>
                <div style={S('display:flex;gap:10px;padding:2px 0 8px 29px;overflow:auto')}>
                  {v.appearance.accents.map(a => (
                    <button key={a.key} type="button" onClick={a.onTap} title={a.label} aria-label={a.label} style={S(`flex-shrink:0;width:34px;height:34px;border-radius:999px;background:${a.color};border:2px solid ${a.on ? 'var(--ink)' : 'rgba(var(--ink-rgb),0.10)'};padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center`)}>
                      {a.on && <Sym style={{ fontSize: 16, color: 'var(--on-accent)' }}>check</Sym>}
                    </button>
                  ))}
                </div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0 4px;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 80)' }}>wallpaper</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Background</div>
                </div>
                <div style={S('display:flex;gap:10px;padding:2px 0 8px 29px;overflow:auto')}>
                  {v.appearance.bgs.map(b => (
                    // background lives outside S() so the cream swatch keeps its literal color in dark mode
                    <button key={b.key} type="button" onClick={b.onTap} title={b.label} aria-label={b.label} style={{ ...S(`flex-shrink:0;width:34px;height:34px;border-radius:999px;border:2px solid ${b.on ? 'var(--ink)' : 'rgba(var(--ink-rgb),0.14)'};padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center`), background: b.color }}>
                      {b.on && <Sym style={{ fontSize: 16, color: '#26231D' /* swatch itself is always light */ }}>check</Sym>}
                    </button>
                  ))}
                </div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0 4px;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 300)' }}>dark_mode</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Theme</div>
                </div>
                <div style={S('display:flex;gap:8px;padding:2px 0 8px 29px')}>
                  {v.appearance.modes.map(m => (
                    <button key={m.key} type="button" onClick={m.onTap} className={m.on ? undefined : 'hov-bd'} style={S(`flex:1;height:34px;border-radius:999px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;background:${m.on ? 'rgba(var(--accent-rgb),0.16)' : 'var(--surface)'};border:1px solid ${m.on ? 'var(--accent)' : 'rgba(var(--ink-rgb),0.12)'};color:${m.on ? 'var(--accent-deep)' : 'var(--muted)'}`)}>{m.label}</button>
                  ))}
                </div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 210)' }}>screen_rotation</Sym>
                  <div style={S('flex:1')}>
                    <div style={S('font-size:14px;font-weight:600;color:#4E4A3F')}>Tilt parallax</div>
                    <div style={S('font-size:11.5px;color:#B5AC98;padding-top:1px')}>The background drifts as the phone tilts</div>
                  </div>
                  <button type="button" onClick={v.appearance.tilt.onToggle} style={S('background:none;border:none;padding:0;cursor:pointer;display:flex')}>
                    <Sym style={{ fontSize: 22, color: v.appearance.tilt.on ? 'var(--accent)' : 'var(--dim)' }}>{v.appearance.tilt.on ? 'toggle_on' : 'toggle_off'}</Sym>
                  </button>
                </div>
                <div style={S('font-size:12px;color:#B5AC98;padding-top:6px;text-wrap:pretty')}>Colors are shared with your partner. Theme and tilt stay on this phone.</div>
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px;margin-top:12px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>Now screen cards</div>
                {v.widgetRows.map((r, i) => (
                  <div key={i} style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                    <Sym style={{ fontSize: 18, color: r.color }}>{r.icon}</Sym>
                    <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>{r.label}</div>
                    <button type="button" onClick={r.onToggle} style={S('background:none;border:none;padding:0;cursor:pointer;display:flex')}>
                      <Sym style={{ fontSize: 22, color: r.toggleColor }}>{r.toggleIcon}</Sym>
                    </button>
                  </div>
                ))}
                <div style={S('font-size:12px;color:#B5AC98;padding-top:8px;text-wrap:pretty')}>These are the “time since last …” cards at the top of Now. Only things you track can appear here.</div>
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px;margin-top:12px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>What you track</div>
                {v.trackRows.map(r => (
                  <React.Fragment key={r.key}>
                    <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                      <Sym style={{ fontSize: 18, color: r.color }}>{r.icon}</Sym>
                      <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>{r.label}</div>
                      <button type="button" onClick={r.onToggle} style={S('background:none;border:none;padding:0;cursor:pointer;display:flex')}>
                        <Sym style={{ fontSize: 22, color: r.toggleColor }}>{r.toggleIcon}</Sym>
                      </button>
                    </div>
                    {r.key === 'meds' && r.on && (
                      <div style={S('display:flex;align-items:center;gap:8px;padding:2px 0 8px 29px')}>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474;flex-shrink:0")}>Name</div>
                        <input type="text" value={v.medNameField} onChange={v.setMedName} placeholder="Vitamin D" maxLength={40} style={S("flex:1;min-width:0;background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:7px 9px;font-size:13px;color:#26231D;outline:none;font-family:'Nunito',sans-serif;font-weight:600")} />
                      </div>
                    )}
                  </React.Fragment>
                ))}
                <div style={S('font-size:12px;color:#B5AC98;padding-top:8px;text-wrap:pretty')}>Feeds are always on. Turning something off hides it for both of you — old entries stay, and it all comes back if you switch it on again.</div>
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px;margin-top:12px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>Units</div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0 4px;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 250)' }}>local_drink</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Bottle & pump amounts</div>
                </div>
                <div style={S('display:flex;gap:8px;padding:2px 0 8px 29px')}>
                  {v.unitChips.map(u => (
                    <button key={u.key} type="button" onClick={u.onTap} className={u.on ? undefined : 'hov-bd'} style={S(`flex:1;height:34px;border-radius:999px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;background:${u.on ? 'rgba(var(--accent-rgb),0.16)' : 'var(--surface)'};border:1px solid ${u.on ? 'var(--accent)' : 'rgba(var(--ink-rgb),0.12)'};color:${u.on ? 'var(--accent-deep)' : 'var(--muted)'}`)}>{u.label}</button>
                  ))}
                </div>
                <div style={S('font-size:12px;color:#B5AC98;padding-top:6px;text-wrap:pretty')}>Shared with your partner. The whole log converts either way — nothing to re-enter.</div>
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px;margin-top:12px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>Notifications</div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'var(--accent)' }}>notifications_active</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Push to this phone</div>
                  {v.notify.supported && (
                    <button type="button" onClick={v.notify.togglePush} style={S('background:none;border:none;padding:0;cursor:pointer;display:flex')}>
                      <Sym style={{ fontSize: 22, color: v.notify.pushOn ? 'var(--accent)' : 'var(--dim)' }}>{v.notify.pushOn ? 'toggle_on' : 'toggle_off'}</Sym>
                    </button>
                  )}
                </div>
                <div style={S('font-size:12px;color:#B5AC98;padding:2px 0 4px;text-wrap:pretty')}>{v.notify.pushHint}</div>
                {v.notify.rows.map(r => (
                  <React.Fragment key={r.key}>
                    <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                      <Sym style={{ fontSize: 18, color: r.color }}>{r.icon}</Sym>
                      <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>{r.label}</div>
                      {r.key === 'meds' && v.notify.medsOn && (
                        <input type="time" value={v.notify.medsTime} onChange={v.notify.setMedsTime} style={S("background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:7px 9px;font-size:13px;color:#26231D;outline:none;font-family:'Nunito',sans-serif;font-weight:600")} />
                      )}
                      <button type="button" onClick={r.onToggle} style={S('background:none;border:none;padding:0;cursor:pointer;display:flex')}>
                        <Sym style={{ fontSize: 22, color: r.toggleColor }}>{r.toggleIcon}</Sym>
                      </button>
                    </div>
                    {r.key === 'feed' && v.notify.feedOn && (
                      <>
                        <div style={S('display:flex;align-items:center;gap:7px;padding:2px 0 8px 29px;overflow:auto')}>
                          <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474;flex-shrink:0")}>Every</div>
                          {v.notify.feedChips.map((c, i) => (
                            <button key={i} type="button" onClick={c.onTap} style={S(`flex-shrink:0;background:${c.bg};border:1px solid ${c.border};border-radius:999px;padding:6px 11px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:${c.fg};cursor:pointer`)}>{c.label}</button>
                          ))}
                        </div>
                        <div style={S('display:flex;align-items:center;gap:11px;padding:0 0 8px 29px')}>
                          <div style={S('flex:1;font-size:13px;color:#6E6659')}>Only while I’m on duty</div>
                          <button type="button" onClick={v.notify.toggleOnDuty} style={S('background:none;border:none;padding:0;cursor:pointer;display:flex')}>
                            <Sym style={{ fontSize: 20, color: v.notify.onDutyToggleColor }}>{v.notify.onDutyToggleIcon}</Sym>
                          </button>
                        </div>
                      </>
                    )}
                    {r.key === 'quiet' && v.notify.quietOn && (
                      <div style={S('display:flex;align-items:center;gap:8px;padding:2px 0 8px 29px')}>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474")}>From</div>
                        <input type="time" value={v.notify.quietStart} onChange={v.notify.setQuietStart} style={S("background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:7px 9px;font-size:13px;color:#26231D;outline:none;font-family:'Nunito',sans-serif;font-weight:600")} />
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474")}>to</div>
                        <input type="time" value={v.notify.quietEnd} onChange={v.notify.setQuietEnd} style={S("background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:7px 9px;font-size:13px;color:#26231D;outline:none;font-family:'Nunito',sans-serif;font-weight:600")} />
                      </div>
                    )}
                  </React.Fragment>
                ))}
                <div style={S('font-size:12px;color:#B5AC98;padding-top:8px;text-wrap:pretty')}>Quiet hours pause reminders and activity pings — handoff asks always come through. Reminders reach every phone you’ve switched on.</div>
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px;margin-top:12px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>Share with your pediatrician</div>
                <div style={S('display:flex;gap:6px;padding:4px 0 10px')}>
                  {v.exportRanges.map((u, i) => (
                    <button key={i} type="button" onClick={u.onTap} style={S(`flex:1;background:${u.bg};border:1px solid ${u.border};border-radius:999px;padding:8px 6px;font-family:inherit;font-size:12.5px;font-weight:600;color:${u.fg};cursor:pointer`)}>{u.label}</button>
                  ))}
                </div>
                <button type="button" onClick={v.exportSummary} className="hov-row" style={S('width:100%;background:none;border:none;display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07);cursor:pointer;font-family:inherit;text-align:left;border-radius:10px')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 130)' }}>calendar_month</Sym>
                  <div style={S('flex:1;min-width:0')}>
                    <div style={S('font-size:14px;font-weight:600;color:#4E4A3F')}>Daily summary</div>
                    <div style={S('font-size:11.5px;color:#B5AC98;padding-top:1px')}>Feeds, {v.unitWord}, diapers & sleep per day</div>
                  </div>
                  <Sym style={{ fontSize: 18, color: 'var(--dim)' }}>ios_share</Sym>
                </button>
                <button type="button" onClick={v.exportLog} className="hov-row" style={S('width:100%;background:none;border:none;display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07);cursor:pointer;font-family:inherit;text-align:left;border-radius:10px')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 250)' }}>table_view</Sym>
                  <div style={S('flex:1;min-width:0')}>
                    <div style={S('font-size:14px;font-weight:600;color:#4E4A3F')}>Full log</div>
                    <div style={S('font-size:11.5px;color:#B5AC98;padding-top:1px')}>Every entry, spreadsheet-ready</div>
                  </div>
                  <Sym style={{ fontSize: 18, color: 'var(--dim)' }}>ios_share</Sym>
                </button>
                <div style={S('font-size:12px;color:#B5AC98;padding-top:6px;text-wrap:pretty')}>Opens your phone’s share sheet as a CSV — send it by email or message.</div>
              </div>

              <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px;margin-top:12px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>Your account</div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'var(--accent)' }}>badge</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Your name</div>
                  <input value={v.account.name} onChange={v.account.setName} onBlur={v.account.saveName} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} placeholder="Parent" style={S("width:140px;box-sizing:border-box;text-align:right;background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:8px 10px;font-size:13.5px;color:#26231D;outline:none;font-family:'Nunito',sans-serif;font-weight:600")} />
                </div>
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 250)' }}>alternate_email</Sym>
                  <div style={S('flex:1;min-width:0')}>
                    <div style={S('font-size:14px;font-weight:600;color:#4E4A3F')}>Email</div>
                    <div style={S('font-size:11.5px;color:#B5AC98;padding-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{v.account.email || '—'}</div>
                  </div>
                  <button type="button" onClick={() => v.account.toggle('email')} className="hov-bd" style={S("flex-shrink:0;background:none;border:1px solid rgba(38,35,29,0.14);border-radius:999px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#8C8474;cursor:pointer")}>{v.account.open === 'email' ? 'Cancel' : 'Change'}</button>
                </div>
                {v.account.open === 'email' && (
                  <div style={S('display:flex;flex-direction:column;gap:8px;padding:2px 0 10px 29px')}>
                    <input placeholder="New email" type="email" value={v.account.emailField} onChange={v.account.setEmailField} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;padding:11px 16px;font-size:14.5px;color:#26231D;outline:none')} />
                    <input placeholder="Current password" type="password" value={v.account.emailPw} onChange={v.account.setEmailPw} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;padding:11px 16px;font-size:14.5px;color:#26231D;outline:none')} />
                    {v.account.error && (
                      <div style={S('font-size:12.5px;line-height:1.4;color:#A85A45;text-wrap:pretty')}>{v.account.error}</div>
                    )}
                    <button type="button" onClick={v.account.submitEmail} className="hov-olive" style={S('align-self:flex-start;height:42px;padding:0 18px;background:var(--accent);border:none;border-radius:999px;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;color:#FCFBF6')}>{v.account.busy ? 'One sec…' : 'Save email'}</button>
                    <div style={S('font-size:11.5px;color:#B5AC98;text-wrap:pretty')}>You’ll log in with the new address from now on — this phone stays signed in.</div>
                  </div>
                )}
                <div style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                  <Sym style={{ fontSize: 18, color: 'oklch(0.60 0.075 300)' }}>key</Sym>
                  <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>Password</div>
                  <button type="button" onClick={() => v.account.toggle('password')} className="hov-bd" style={S("flex-shrink:0;background:none;border:1px solid rgba(38,35,29,0.14);border-radius:999px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#8C8474;cursor:pointer")}>{v.account.open === 'password' ? 'Cancel' : 'Change'}</button>
                </div>
                {v.account.open === 'password' && (
                  <div style={S('display:flex;flex-direction:column;gap:8px;padding:2px 0 10px 29px')}>
                    <input placeholder="Current password" type="password" value={v.account.pwCur} onChange={v.account.setPwCur} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;padding:11px 16px;font-size:14.5px;color:#26231D;outline:none')} />
                    <input placeholder="New password — 8+ characters" type="password" value={v.account.pwNew} onChange={v.account.setPwNew} style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;padding:11px 16px;font-size:14.5px;color:#26231D;outline:none')} />
                    {v.account.error && (
                      <div style={S('font-size:12.5px;line-height:1.4;color:#A85A45;text-wrap:pretty')}>{v.account.error}</div>
                    )}
                    <button type="button" onClick={v.account.submitPassword} className="hov-olive" style={S('align-self:flex-start;height:42px;padding:0 18px;background:var(--accent);border:none;border-radius:999px;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;color:#FCFBF6')}>{v.account.busy ? 'One sec…' : 'Save password'}</button>
                    <div style={S('font-size:11.5px;color:#B5AC98;text-wrap:pretty')}>Every other phone gets logged out — this one stays signed in.</div>
                  </div>
                )}
                <div style={S('font-size:12px;color:#B5AC98;padding-top:6px;text-wrap:pretty')}>Your name is what your partner sees on duty and handoffs.</div>
              </div>

              {v.invitePending && (
                <div style={S('text-align:center;padding:14px 0 0;font-size:12.5px;color:#B5AC98;text-wrap:pretty')}>{v.inviteMailed ? 'Invite emailed to ' + v.invitePending : 'Invite waiting for ' + v.invitePending} — they sign up with that email{v.inviteCode ? ' and code ' + v.inviteCode : ''} and land here.</div>
              )}
              <div style={S('text-align:center;padding:16px 0 0')}>
                <button type="button" onClick={v.logout} className="hov-bd" style={S("background:none;border:1px solid rgba(38,35,29,0.14);border-radius:999px;padding:8px 15px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#8C8474;cursor:pointer")}>Log out</button>
              </div>
            </div>
          </div>
        )}

        {v.showTabs && (
          <>
            <div style={S('padding:6px 18px 0;display:flex;align-items:center;gap:10px;position:relative;z-index:1')}>
              <button type="button" onClick={v.goHome} className="hov-cream" style={S(`height:56px;flex:1;background:${v.homeTabBg};border:1px solid rgba(38,35,29,0.10);border-radius:999px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-family:inherit`)}>
                <Sym style={{ fontSize: 20, color: v.homeTabFg }}>schedule</Sym>
                <div style={S(`font-size:11px;font-weight:600;color:${v.homeTabFg};letter-spacing:0.01em`)}>Now</div>
              </button>
              <button type="button" onClick={v.openSheet} className="hov-olive" style={S('width:68px;height:68px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 20px rgba(var(--accent-rgb),0.34);margin-bottom:6px')}>
                <Sym style={{ fontSize: 32, color: 'var(--on-accent)' }}>add</Sym>
              </button>
              <button type="button" onClick={v.goHistory} className="hov-cream" style={S(`height:56px;flex:1;background:${v.histTabBg};border:1px solid rgba(38,35,29,0.10);border-radius:999px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-family:inherit`)}>
                <Sym style={{ fontSize: 20, color: v.histTabFg }}>bar_chart</Sym>
                <div style={S(`font-size:11px;font-weight:600;color:${v.histTabFg};letter-spacing:0.01em`)}>History</div>
              </button>
            </div>
            {v.hasPartner && (
              <div style={S('display:flex;justify-content:center;padding-top:6px;position:relative;z-index:1')}>
                <button type="button" onClick={v.openShift} className="hov-dim" style={S('background:none;border:none;display:flex;align-items:center;gap:6px;cursor:pointer;font-family:inherit;padding:4px 10px')}>
                  <Sym style={{ fontSize: 16, color: 'var(--soft)' }}>swap_horiz</Sym>
                  <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>{v.footerShiftLabel}</div>
                </button>
              </div>
            )}
          </>
        )}

        {v.toast && (
          <div className="toast-in" style={{
            ...S('position:absolute;left:16px;right:16px;bottom:126px;background:#26231D;border-radius:999px;padding:11px 10px 11px 18px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,0.25);z-index:30;transition:opacity 0.22s ease'),
            opacity: v.toastLeaving ? 0 : 1,
            pointerEvents: v.toastLeaving ? 'none' : 'auto',
          }}>
            <div style={S('flex:1;min-width:0;font-size:14px;color:#FAF6EF')}>{v.toastText}</div>
            {v.canUndo && <button type="button" onClick={v.undo} style={S("background:rgba(250,246,239,0.16);border:none;border-radius:999px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#FAF6EF;cursor:pointer")}>Undo</button>}
          </div>
        )}

        {v.sheetMounted && (
          <div style={{ ...S('position:absolute;inset:0;z-index:40'), pointerEvents: v.sheetShown ? 'auto' : 'none' }}>
            <div onClick={v.closeSheet} style={{ ...S('position:absolute;inset:0;background:rgba(30,27,20,0.42);backdrop-filter:blur(2px);transition:opacity 0.3s ease'), opacity: v.sheetShown ? 1 : 0 }} />
            <div style={{
              ...S('position:absolute;left:0;right:0;bottom:0;background:#FAF6EF;border-radius:34px 34px 0 0;padding:10px 16px 22px;box-shadow:0 -12px 40px rgba(0,0,0,0.18);overflow:hidden;max-height:92vh;display:flex;flex-direction:column'),
              height: v.sheetTall ? '86vh' : 'auto',
              transform: v.sheetShown ? `translateY(${v.sheetTranslate}px)` : 'translateY(105%)',
              transition: v.sheetDragging ? 'none' : 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
            }}>
              <div style={S('position:absolute;inset:0;z-index:0')}>
                <img className="bg-art" src="/art/sheet-bg.png" alt="" style={S('width:100%;height:100%;object-fit:cover;display:block')} />
                <div style={S('position:absolute;inset:0;background:rgba(250,246,239,0.7);pointer-events:none')} />
              </div>
              <div onPointerDown={v.sheetDragStart} onPointerMove={v.sheetDragMove} onPointerUp={v.sheetDragEnd} onPointerCancel={v.sheetDragEnd}
                style={S('position:relative;z-index:1;flex-shrink:0;padding:13px 0 13px;margin:-10px -16px 0;cursor:grab;touch-action:none')}>
                <div style={S('width:38px;height:4px;border-radius:99px;background:rgba(38,35,29,0.16);margin:0 auto')} />
              </div>
              <div onPointerDown={v.sheetBodyDown} onPointerMove={v.sheetBodyMove} onPointerUp={v.sheetBodyUp} onPointerCancel={v.sheetBodyUp}
                style={S('position:relative;z-index:1;flex:1;min-height:0;overflow:auto;touch-action:pan-y;overscroll-behavior:contain')}>

                {v.showStamp && (
                <div style={S('display:flex;align-items:flex-end;justify-content:space-between;padding:0 4px 12px')}>
                  <label style={S('position:relative;display:flex;flex-direction:column;gap:3px;cursor:pointer')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474")}>{v.sheetKicker}</div>
                    <div style={S('display:flex;align-items:baseline;gap:7px')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-size:31px;font-weight:700;letter-spacing:-0.04em")}>{v.stampTime}</div>
                      <Sym style={{ fontSize: 15, color: 'var(--faint)' }}>edit</Sym>
                    </div>
                    <input type="time" value={v.stampHM} onChange={v.pickTime} onClick={v.showTimePicker} style={S('position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;margin:0;cursor:pointer')} />
                  </label>
                  <div style={S('display:flex;gap:6px;padding-bottom:6px')}>
                    {v.nudges.map((n, i) => (
                      <button key={i} type="button" onClick={n.onTap} style={S(`background:${n.bg};border:1px solid ${n.border};border-radius:999px;padding:7px 11px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:${n.fg};cursor:pointer;letter-spacing:-0.01em`)}>{n.label}</button>
                    ))}
                  </div>
                </div>
                )}
                {v.timerFirst && (
                  <div style={S('padding:2px 4px 12px')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474")}>Time it live</div>
                    <div style={S('font-size:13px;color:#6E6659;padding-top:3px;text-wrap:pretty')}>Hit start, and stop when you’re done — the duration logs itself.</div>
                  </div>
                )}

                <div style={S('display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px')}>
                  {v.types.map(t => (
                    <button key={t.label} type="button" onClick={t.onTap} className="hov-bd" style={S('position:relative;background:#FFFDF8;border:1px solid rgba(38,35,29,0.08);border-radius:24px;padding:12px 8px 12px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;font-family:inherit;overflow:hidden')}>
                      <div style={S(`position:absolute;inset:0;opacity:${t.tint};background:${t.color}`)} />
                      {t.on && (
                        <div style={S(`position:absolute;inset:0;border-radius:23px;box-shadow:inset 0 0 0 2.5px ${t.color}`)} />
                      )}
                      <div style={S('position:relative;width:48px;height:48px;border-radius:999px;display:flex;align-items:center;justify-content:center;overflow:hidden')}>
                        <div style={S(`position:absolute;inset:0;background:${t.color};opacity:0.16`)} />
                        <Sym style={{ position: 'relative', fontSize: 26, color: t.color }}>{t.icon}</Sym>
                      </div>
                      <div style={S('position:relative;font-size:13px;font-weight:600;letter-spacing:-0.01em;color:#3D392F')}>{t.label}</div>
                    </button>
                  ))}
                </div>

                {v.hasDetail && (
                  <div style={S('display:flex;align-items:center;gap:8px;padding:14px 2px 0;overflow:auto')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474;flex-shrink:0;padding-right:2px")}>{v.detailLabel}</div>
                    {v.detailOptions.map((d, i) => d.scrub ? (
                      <button key={i} type="button" onPointerDown={d.onDown} onPointerMove={v.scrubMove} onPointerUp={v.scrubEnd} onPointerCancel={v.scrubEnd}
                        style={S(`flex-shrink:0;display:flex;align-items:center;gap:3px;background:${d.bg};border:1px solid ${d.border};border-radius:999px;padding:8px 13px;font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:${d.fg};cursor:ns-resize;touch-action:pan-x;user-select:none`)}>
                        {d.label}
                        {d.on && <Sym style={{ fontSize: 12, color: d.fg, opacity: 0.7 }}>unfold_more</Sym>}
                      </button>
                    ) : (
                      <button key={i} type="button" onClick={d.onTap} style={S(`flex-shrink:0;background:${d.bg};border:1px solid ${d.border};border-radius:999px;padding:8px 13px;font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:${d.fg};cursor:pointer`)}>{d.label}</button>
                    ))}
                  </div>
                )}

                {v.hasDetail2 && (
                  <div style={S('display:flex;align-items:center;gap:8px;padding:10px 2px 0;overflow:auto')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474;flex-shrink:0;padding-right:2px")}>{v.detail2Label}</div>
                    {v.detail2Options.map((d, i) => d.scrub ? (
                      <button key={i} type="button" onPointerDown={d.onDown} onPointerMove={v.scrubMove} onPointerUp={v.scrubEnd} onPointerCancel={v.scrubEnd}
                        style={S(`flex-shrink:0;display:flex;align-items:center;gap:3px;background:${d.bg};border:1px solid ${d.border};border-radius:999px;padding:8px 13px;font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:${d.fg};cursor:ns-resize;touch-action:pan-x;user-select:none`)}>
                        {d.label}
                        {d.on && <Sym style={{ fontSize: 12, color: d.fg, opacity: 0.7 }}>unfold_more</Sym>}
                      </button>
                    ) : (
                      <button key={i} type="button" onClick={d.onTap} style={S(`flex-shrink:0;background:${d.bg};border:1px solid ${d.border};border-radius:999px;padding:8px 13px;font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:${d.fg};cursor:pointer`)}>{d.label}</button>
                    ))}
                  </div>
                )}

                {v.timerFirst ? (
                  <button type="button" onClick={v.startTimer} className="hov-olive" style={S('margin-top:16px;width:100%;height:66px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(var(--accent-rgb),0.3)')}>
                    <Sym style={{ fontSize: 23, color: 'var(--on-accent)' }}>play_arrow</Sym>
                    <div style={S('font-size:17px;font-weight:600;color:#FCFBF6;letter-spacing:-0.01em')}>{v.startTimerLabel}</div>
                  </button>
                ) : (
                  <button type="button" onClick={v.save} className="hov-olive" style={S('margin-top:16px;width:100%;height:66px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(var(--accent-rgb),0.3)')}>
                    <Sym style={{ fontSize: 23, color: 'var(--on-accent)' }}>check</Sym>
                    <div style={S('font-size:17px;font-weight:600;color:#FCFBF6;letter-spacing:-0.01em')}>{v.saveLabel}</div>
                  </button>
                )}

                <div style={S('display:flex;align-items:center;justify-content:space-between;padding:12px 6px 0')}>
                  <button type="button" onClick={v.closeSheet} style={S("background:none;border:none;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#8C8474;cursor:pointer")}>Cancel</button>
                  {v.canManual && (
                    <button type="button" onClick={v.timerFirst ? v.toManual : v.toTimer} style={S("background:none;border:none;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#5F6E42;cursor:pointer")}>{v.timerFirst ? v.manualHint : 'Use a timer'}</button>
                  )}
                  {v.editing && (
                    <button type="button" onClick={v.remove} style={S("background:none;border:none;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#A85A45;cursor:pointer")}>Delete entry</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {v.shiftMounted && (
          <div style={{ ...S('position:absolute;inset:0;z-index:50'), pointerEvents: v.shiftShown ? 'auto' : 'none' }}>
            <div onClick={v.closeShift} style={{ ...S('position:absolute;inset:0;background:rgba(30,27,20,0.42);backdrop-filter:blur(2px);transition:opacity 0.3s ease'), opacity: v.shiftShown ? 1 : 0 }} />
            <div style={{
              ...S('position:absolute;left:0;right:0;bottom:0;background:#FAF6EF;border-radius:34px 34px 0 0;padding:10px 16px 22px;box-shadow:0 -12px 40px rgba(0,0,0,0.18);max-height:min(760px, 88dvh);overflow:auto'),
              transform: v.shiftShown ? 'translateY(0)' : 'translateY(105%)',
              transition: 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
            }}>
              <div style={S('width:38px;height:4px;border-radius:99px;background:rgba(38,35,29,0.16);margin:0 auto 14px')} />

              {v.sheetTheirs && (
                <>
                  <div style={S('display:flex;align-items:center;justify-content:center;gap:14px;padding:6px 0 14px')}>
                    <div style={S('display:flex;flex-direction:column;align-items:center;gap:6px')}>
                      <div style={S(`width:56px;height:56px;border-radius:999px;background:${PARTNER_COLOR};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#FCFBF6`)}>{v.partnerInitial}</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#6E6659")}>{v.partnerName}</div>
                    </div>
                    <Sym style={{ fontSize: 28, color: 'var(--faint)', marginBottom: 22 }}>arrow_forward</Sym>
                    <div style={S('display:flex;flex-direction:column;align-items:center;gap:6px')}>
                      <div style={S(`width:56px;height:56px;border-radius:999px;background:${ME_COLOR};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#FCFBF6`)}>{v.myInitial}</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#6E6659")}>You</div>
                    </div>
                  </div>
                  <div style={S("text-align:center;font-family:'Nunito',sans-serif;font-weight:800;font-size:23px;letter-spacing:-0.02em")}>Take over from {v.partnerName}</div>
                  <div style={S('text-align:center;font-size:13.5px;color:#8C8474;padding-top:4px')}>{v.theirShiftLine}</div>

                  <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px;margin-top:18px')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding:10px 0 4px")}>Right now</div>
                    {v.handoffRows.map((r, i) => (
                      <div key={i} style={S('display:flex;align-items:baseline;gap:12px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                        <div style={S('flex:1;font-size:14px;color:#4E4A3F')}>{r.label}</div>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:13.5px;color:#26231D;text-align:right")}>{r.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px 12px;margin-top:10px')}>
                    <div style={S('display:flex;align-items:center;justify-content:space-between;padding:10px 0 4px')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Plan for your shift</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#B5AC98")}>from the usual rhythm</div>
                    </div>
                    {v.requestPlanRows.map((p, i) => (
                      <div key={i} style={S('display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                        <Sym style={{ fontSize: 18, color: p.color }}>{p.icon}</Sym>
                        <div style={S('flex:1;font-size:14px;font-weight:600;color:#4E4A3F')}>{p.label}</div>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:13.5px;color:#26231D")}>{p.time}</div>
                        <button type="button" onClick={p.onToggle} style={S('background:none;border:none;padding:0;cursor:pointer;display:flex')}>
                          <Sym style={{ fontSize: 22, color: p.toggleColor }}>{p.toggleIcon}</Sym>
                        </button>
                      </div>
                    ))}
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;padding-top:6px")}>Until</div>
                    <div style={S('display:flex;gap:6px;padding-top:6px')}>
                      {v.untilOptions.map((u, i) => (
                        <button key={i} type="button" onClick={u.onTap} style={S(`flex:1;background:${u.bg};border:1px solid ${u.border};border-radius:999px;padding:8px 6px;font-family:inherit;font-size:12.5px;font-weight:600;color:${u.fg};cursor:pointer`)}>{u.label}</button>
                      ))}
                    </div>
                  </div>

                  <button type="button" onClick={v.acceptShift} className="hov-olive" style={S('margin-top:14px;width:100%;height:62px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(var(--accent-rgb),0.3)')}>
                    <Sym style={{ fontSize: 22, color: 'var(--on-accent)' }}>check</Sym>
                    <div style={S('font-size:16.5px;font-weight:700;color:#FCFBF6')}>I’ve got him — start my shift</div>
                  </button>
                  <div style={S('text-align:center;font-size:12px;color:#8C8474;padding-top:10px')}>{v.partnerName} gets a “you’re covered” ping and can sleep.</div>
                </>
              )}

              {v.sheetMine && (
                <>
                  <div style={S('display:flex;align-items:center;gap:12px;padding:4px 4px 14px')}>
                    <div style={S(`width:48px;height:48px;border-radius:999px;background:${ME_COLOR};display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;color:#FCFBF6`)}>{v.myInitial}</div>
                    <div style={S('display:flex;flex-direction:column;gap:2px')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.02em")}>Your shift so far</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#8C8474")}>{v.shiftSince} · {v.shiftElapsed}</div>
                    </div>
                  </div>
                  <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px')}>
                    {v.reportRows.map((r, i) => (
                      <div key={i} style={S('display:flex;align-items:baseline;gap:12px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                        <div style={S('flex:1;font-size:14px;color:#4E4A3F')}>{r.label}</div>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:13.5px;color:#26231D;text-align:right")}>{r.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:12px 16px;margin-top:10px;display:flex;flex-direction:column;gap:8px')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Note for {v.partnerName}</div>
                    <input value={v.handbackNote} onChange={v.setHandbackNote} placeholder="e.g. took the 1am bottle slow, fell asleep on me" style={S('width:100%;box-sizing:border-box;background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:12px 13px;font-size:14.5px;color:#26231D;outline:none')} />
                  </div>
                  <button type="button" onClick={v.handBack} className="hov-olive" style={S('margin-top:14px;width:100%;height:62px;background:var(--accent);border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(var(--accent-rgb),0.3)')}>
                    <Sym style={{ fontSize: 22, color: 'var(--on-accent)' }}>swap_horiz</Sym>
                    <div style={S('font-size:16.5px;font-weight:700;color:#FCFBF6')}>Hand back to {v.partnerName}</div>
                  </button>
                  {v.canRequest && (
                    <button type="button" onClick={v.requestHandoff} className="hov-dim" style={S("margin-top:10px;width:100%;background:none;border:none;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#5F6E42;padding:6px 0")}>
                      <Sym style={{ fontSize: 16, color: 'var(--accent-text)' }}>notifications</Sym>
                      Ask {v.partnerName} to take over — sends your note
                    </button>
                  )}
                  <div style={S('text-align:center;font-size:12px;color:#8C8474;padding-top:10px;text-wrap:pretty')}>They get this summary as a card — no scrolling the log, no “when did you…”</div>
                </>
              )}

              {v.sheetReport && (
                <>
                  <div style={S('display:flex;align-items:center;gap:12px;padding:4px 4px 14px')}>
                    <div style={S('width:48px;height:48px;border-radius:999px;background:rgba(var(--accent-rgb),0.16);display:flex;align-items:center;justify-content:center')}>
                      <Sym style={{ fontSize: 24, color: 'var(--accent-text)' }}>task_alt</Sym>
                    </div>
                    <div style={S('display:flex;flex-direction:column;gap:2px')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.02em")}>{v.reportTitle}</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#8C8474")}>{v.reportRange}</div>
                    </div>
                  </div>
                  <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.07);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:6px 16px')}>
                    {v.reportRows.map((r, i) => (
                      <div key={i} style={S('display:flex;align-items:baseline;gap:12px;padding:9px 0;border-top:1px solid rgba(38,35,29,0.07)')}>
                        <div style={S('flex:1;font-size:14px;color:#4E4A3F')}>{r.label}</div>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:13.5px;color:#26231D;text-align:right")}>{r.value}</div>
                      </div>
                    ))}
                  </div>
                  {v.hasHandbackNote && (
                    <div style={S('font-size:14.5px;line-height:1.45;color:#4E4A3F;background:rgba(var(--accent-rgb),0.09);border-radius:16px;padding:12px 14px;margin-top:10px')}>“{v.reportNote}”</div>
                  )}
                  <button type="button" onClick={v.closeShift} className="hov-dark" style={S('margin-top:14px;width:100%;height:56px;background:#26231D;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit')}>
                    <div style={S('font-size:16px;font-weight:700;color:#FAF6EF')}>Done</div>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }
}

import React from 'react'
import { S } from './s'
import Duck from './Duck'

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
const OLIVE = '#7C8C5A'
const DAY = 86400000

// ── local-first persistence ──────────────────────────────────────────────────
const STORE_KEY = 'babylog:v1'
const PERSIST = ['entries', 'screen', 'authMode', 'babyName', 'nameField', 'inviteField', 'age',
  'shift', 'shiftStart', 'shiftEnd', 'plan', 'planOff', 'until', 'handbackNote', 'requestAt']

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null } catch { return null }
}

const Sym = ({ style, children }) => (
  <span style={{ fontFamily: "'Material Symbols Rounded'", lineHeight: 1, ...style }}>{children}</span>
)

export default class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      screen: 'splash', authMode: 'signup', entries: this.seed(), tick: 0,
      sheet: false, sel: null, offset: 0, detail: null, editId: null,
      toast: null, lastAdded: null, handoff: false,
      babyName: 'Wren', nameField: 'Wren', inviteField: '', age: '11 weeks',
      shift: 'incoming', shiftOpen: false, shiftStart: null, shiftEnd: null, requestAt: Date.now() - 9 * 60000,
      planDraft: null, planOff: [], until: 'Until she wakes', plan: [], handbackNote: '',
    }
    const saved = loadSaved()
    if (saved) for (const k of PERSIST) if (k in saved) this.state[k] = saved[k]
  }

  seed() {
    const now = Date.now()
    const out = []
    let i = 0
    const push = (type, t, detail) => { if (t <= now) out.push({ id: 's' + (++i), type, t, detail: detail ?? null }) }
    for (let d = 0; d < 7; d++) {
      const base = new Date(); base.setHours(0, 0, 0, 0)
      const day = base.getTime() - d * DAY
      const jit = h => day + h * 3600000 + ((i * 37 + d * 53) % 26) * 60000
      const skipF = [[], [3], [1, 6], [], [4], [2, 5], [0]][d]
      const skipD = [[2], [], [5], [1, 4], [], [3], [0, 6]][d]
      ;[1.6, 4.5, 7.4, 10.3, 13.1, 16.2, 19.1, 22.2].forEach((h, k) => {
        if (skipF.includes(k)) return
        const bottle = (k + d) % 3 !== 0
        push(bottle ? 'bottle' : 'nurse', jit(h), bottle ? [3, 4, 4, 5][(k + d) % 4] : (k % 2 ? 'Left' : 'Right'))
      })
      ;[2.7, 5.6, 8.4, 11.5, 14.3, 17.4, 20.6, 23.2].forEach((h, k) => {
        if (skipD.includes(k)) return
        push((k + d) % 4 === 1 ? 'dirty' : (k + d) % 7 === 3 ? 'both' : 'wet', jit(h))
      })
      push('sleep', jit(2.9), [150, 95, 45][(d) % 3])
      push('sleep', jit(13.6), [45, 70, 30][(d + 1) % 3])
      if (d % 2 === 1) push('bath', jit(18.4))
      push('meds', jit(9.2))
    }
    return out.sort((a, b) => b.t - a.t)
  }

  componentDidMount() { this._iv = setInterval(() => this.setState(s => ({ tick: s.tick + 1 })), 20000) }
  componentWillUnmount() { clearInterval(this._iv); if (this._to) clearTimeout(this._to) }
  componentDidUpdate() {
    const out = {}
    for (const k of PERSIST) out[k] = this.state[k]
    try { localStorage.setItem(STORE_KEY, JSON.stringify(out)) } catch { /* storage full/blocked — stay in-memory */ }
  }

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
  unit() { return this.props.unit ?? 'oz' }
  subFor(e) {
    const day = this.dayOf(e.t), p = []
    if (e.type === 'bottle' || e.type === 'pump') p.push(e.detail + ' ' + this.unit())
    if (e.type === 'nurse') p.push(e.detail || 'either side')
    if (e.type === 'sleep') p.push(this.dur(e.detail))
    if (DIAPERS.includes(e.type)) p.push(e.type === 'both' ? 'wet + dirty' : e.type)
    if (e.type === 'meds') p.push('vitamin D')
    if (day) p.push(day)
    return p.filter(Boolean).join(' · ') || 'logged'
  }
  feedGap() {
    const t = this.state.entries.filter(e => FEEDS.includes(e.type)).map(e => e.t).sort((a, b) => a - b).slice(-14)
    const gaps = []; for (let i = 1; i < t.length; i++) gaps.push(t[i] - t[i - 1])
    return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 3 * 3600000
  }
  draftPlan() {
    const gap = this.feedGap(), feed = this.lastOf(FEEDS), now = Date.now()
    let t1 = (feed ? feed.t : now) + gap; while (t1 < now + 20 * 60000) t1 += gap
    const out = [{ id: 'p1', type: 'bottle', at: t1 }, { id: 'p2', type: 'bottle', at: t1 + gap }]
    const meds = new Date(); meds.setHours(9, 0, 0, 0); if (meds.getTime() < now) meds.setDate(meds.getDate() + 1)
    if (meds.getTime() - now < 11 * 3600000) out.push({ id: 'p3', type: 'meds', at: meds.getTime() })
    return out
  }
  openShift = () => this.setState(s => ({ shiftOpen: true, planDraft: s.planDraft || this.draftPlan() }))
  closeShift = () => this.setState(s => ({ shiftOpen: false, shift: s.shift === 'report' ? 'theirs' : s.shift }))
  acceptShift = () => this.setState(s => {
    const draft = (s.planDraft || this.draftPlan()).filter(p => !s.planOff.includes(p.id))
    return { shift: 'mine', shiftOpen: false, shiftStart: Date.now(), shiftEnd: null, handbackNote: '', plan: draft, planDraft: null, planOff: [], toast: 'You’re on duty · Katrina notified', lastAdded: null }
  }, () => this.bumpToast())
  addPlanFeed = () => this.setState(s => {
    const last = s.plan.filter(p => FEEDS.includes(p.type)).sort((a, b) => b.at - a.at)[0]
    return { plan: [...s.plan, { id: 'p' + Date.now(), type: 'bottle', at: (last ? last.at : Date.now()) + this.feedGap() }] }
  })
  handBack = () => this.setState({ shift: 'report', shiftEnd: Date.now(), plan: [] })
  lastOf(keys) { return this.state.entries.filter(e => keys.includes(e.type)).sort((a, b) => b.t - a.t)[0] }

  predict() {
    if ((this.props.smartPrefill ?? true) === false) return null
    const feed = this.lastOf(FEEDS), dia = this.lastOf(DIAPERS)
    const fMin = feed ? (Date.now() - feed.t) / 60000 : 999
    const dMin = dia ? (Date.now() - dia.t) / 60000 : 999
    if (fMin / 165 >= dMin / 150) return feed && feed.type === 'nurse' ? 'nurse' : 'bottle'
    return 'wet'
  }
  stamp() { return this._base + this.state.offset * 60000 }

  openSheet = () => {
    this._base = Date.now()
    const k = this.predict()
    this.setState({ sheet: true, editId: null, sel: k, offset: 0, detail: k ? this.defaultDetail(k) : null })
  }
  defaultDetail(k) {
    const d = T(k).detail
    if (d === 'amount') { const l = this.lastOf([k]); return l ? l.detail : 4 }
    if (d === 'side') { const l = this.lastOf(['nurse']); return l && l.detail === 'Left' ? 'Right' : 'Left' }
    if (d === 'dur') return 45
    return null
  }
  closeSheet = () => this.setState({ sheet: false })
  pick = k => () => this.setState(s => ({ sel: k, detail: s.sel === k ? s.detail : this.defaultDetail(k) }))
  nudge = n => () => this.setState({ offset: n })

  save = () => {
    const key = this.state.sel || this.predict() || 'bottle'
    const t = this.stamp(), detail = this.state.detail
    if (this.state.editId) {
      const id = this.state.editId
      this.setState(s => ({ sheet: false, entries: s.entries.map(e => e.id === id ? { ...e, type: key, t, detail } : e), toast: 'Entry updated', lastAdded: null }))
    } else {
      const entry = { id: 'n' + Date.now(), type: key, t, detail }
      this.setState(s => ({ sheet: false, screen: 'home', entries: [entry, ...s.entries], toast: T(key).label + ' logged · ' + this.clock(t), lastAdded: entry.id }))
    }
    this.bumpToast()
  }
  bumpToast() {
    if (this._to) clearTimeout(this._to)
    this._to = setTimeout(() => this.setState({ toast: null, lastAdded: null }), 6000)
  }
  undo = () => {
    const id = this.state.lastAdded
    this.setState(s => ({ toast: null, lastAdded: null, entries: id ? s.entries.filter(e => e.id !== id) : s.entries }))
  }
  edit = id => () => {
    const e = this.state.entries.find(x => x.id === id)
    this._base = e.t
    this.setState({ sheet: true, editId: id, sel: e.type, offset: 0, detail: e.detail })
  }
  remove = () => {
    const id = this.state.editId
    this.setState(s => ({ sheet: false, entries: s.entries.filter(e => e.id !== id), toast: 'Entry deleted', lastAdded: null }))
    this.bumpToast()
  }
  reset = () => {
    try { localStorage.removeItem(STORE_KEY) } catch { /* ignore */ }
    this.setState({ entries: this.seed(), sheet: false, toast: null, screen: 'splash', nameField: 'Wren', shift: 'incoming', shiftOpen: false, shiftStart: null, shiftEnd: null, plan: [], planDraft: null, planOff: [], handbackNote: '', requestAt: Date.now() - 9 * 60000 })
  }

  chip(on, tone) {
    return on ? { bg: tone || '#26231D', border: tone || '#26231D', fg: '#FAF6EF' }
              : { bg: '#FFFDF8', border: 'rgba(38,35,29,0.12)', fg: '#6E6659' }
  }
  bars(keys, color) {
    const out = []
    const base = new Date(); base.setHours(0, 0, 0, 0)
    for (let d = 6; d >= 0; d--) {
      const from = base.getTime() - d * DAY
      const n = this.state.entries.filter(e => keys.includes(e.type) && e.t >= from && e.t < from + DAY).length
      out.push({ n, day: d === 0 ? 'Today' : new Date(from).toLocaleDateString(undefined, { weekday: 'short' }) })
    }
    const max = Math.max(...out.map(o => o.n), 1)
    return out.map((o, i) => ({
      value: o.n, day: o.day,
      h: Math.max(6, Math.round((o.n / max) * 100)) + '%',
      fill: i === 6 ? color : color.replace('0.075', '0.045'),
    }))
  }

  renderVals() {
    const s = this.state
    const st = T(s.sel || 'bottle')
    const step = Number(this.props.timeStep ?? 5) || 5
    const stampT = s.sheet ? this.stamp() : Date.now()

    const cards = [
      { keys: FEEDS, label: 'Fed', icon: 'local_drink', color: 'oklch(0.60 0.075 250)' },
      { keys: DIAPERS, label: 'Diaper', icon: 'baby_changing_station', color: 'oklch(0.60 0.075 210)' },
      { keys: ['sleep'], label: 'Slept', icon: 'bedtime', color: 'oklch(0.60 0.075 25)' },
      { keys: ['bath'], label: 'Bath', icon: 'bathtub', color: 'oklch(0.60 0.075 195)' },
    ].map(c => {
      const e = this.lastOf(c.keys)
      const day = e ? this.dayOf(e.t) : ''
      return { label: c.label, icon: c.icon, color: c.color, elapsed: e ? this.elapsed(e.t) : '—',
        at: e ? this.clock(e.t) + (day ? ', ' + day.toLowerCase() : '') + ' · ' + T(e.type).label : 'nothing logged yet' }
    })

    const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
    const td = s.entries.filter(e => e.t >= midnight.getTime())
    const oz = td.filter(e => e.type === 'bottle').reduce((a, e) => a + (Number(e.detail) || 0), 0)
    const todaySummary = td.filter(e => FEEDS.includes(e.type)).length + ' feeds · ' + oz + this.unit() + ' · ' + td.filter(e => DIAPERS.includes(e.type)).length + ' diapers'

    const timeline = [...s.entries].sort((a, b) => b.t - a.t).slice(0, 12).map(e => ({
      time: this.clock(e.t), label: T(e.type).label, sub: this.subFor(e),
      icon: T(e.type).icon, color: T(e.type).color, onEdit: this.edit(e.id),
    }))

    const types = TYPES.map(t => {
      const on = t.key === s.sel
      return { label: t.label, icon: t.icon, color: t.color, on, tint: on ? 0.13 : 0.045, onTap: this.pick(t.key) }
    })

    const nudges = [{ n: 0, label: 'now' }, { n: -step, label: '−' + step }, { n: -step * 3, label: '−' + step * 3 }, { n: -60, label: '−1h' }]
      .map(d => ({ label: d.label, onTap: this.nudge(d.n), ...this.chip(s.offset === d.n, OLIVE) }))

    const kind = st.detail
    const opts = kind === 'amount' ? [2, 3, 4, 5, 6].map(v => ({ v, label: v + ' ' + this.unit() }))
      : kind === 'side' ? ['Left', 'Right', 'Both'].map(v => ({ v, label: v }))
      : kind === 'dur' ? [15, 30, 45, 90, 150].map(v => ({ v, label: this.dur(v) })) : []
    const detailOptions = opts.map(o => ({ label: o.label, onTap: () => this.setState({ detail: o.v }), ...this.chip(s.detail === o.v, st.color) }))
    const detailStr = kind === 'amount' ? ' ' + s.detail + ' ' + this.unit() : kind === 'side' ? ' ' + (s.detail || '') : kind === 'dur' ? ' ' + this.dur(s.detail) : ''

    const feed = this.lastOf(FEEDS), dia = this.lastOf(DIAPERS), sleep = this.lastOf(['sleep'])
    const handoffRows = [
      { label: 'Last fed', value: feed ? this.elapsed(feed.t) + ' ago' : '—' },
      { label: 'That feed was', value: feed ? (feed.type === 'bottle' ? feed.detail + ' ' + this.unit() + ' bottle' : 'nursed, ' + (feed.detail || 'either')) : '—' },
      { label: 'Last diaper', value: dia ? this.elapsed(dia.t) + ' ago · ' + (dia.type === 'both' ? 'wet + dirty' : dia.type) : '—' },
      { label: 'Last nap ended', value: sleep ? this.elapsed(sleep.t) + ' ago · ' + this.dur(sleep.detail) : '—' },
      { label: 'Today so far', value: td.filter(e => FEEDS.includes(e.type)).length + ' feeds / ' + td.filter(e => DIAPERS.includes(e.type)).length + ' diapers' },
    ]

    const week = s.entries.filter(e => e.t >= midnight.getTime() - 6 * DAY)
    const feedsWk = week.filter(e => FEEDS.includes(e.type))
    const ozWk = week.filter(e => e.type === 'bottle').reduce((a, e) => a + (Number(e.detail) || 0), 0)
    const naps = week.filter(e => e.type === 'sleep')
    const sorted = feedsWk.map(e => e.t).sort((a, b) => a - b)
    let gaps = []
    for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / 60000)
    const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0
    const longest = gaps.length ? Math.max(...gaps) : 0
    const stats = [
      { label: 'Feeds / day', value: (feedsWk.length / 7).toFixed(1), unit: 'avg' },
      { label: this.unit() + ' / day', value: Math.round(ozWk / 7), unit: 'bottles only' },
      { label: 'Diapers / day', value: (week.filter(e => DIAPERS.includes(e.type)).length / 7).toFixed(1), unit: 'avg' },
      { label: 'Sleep logged', value: this.dur(Math.round(naps.reduce((a, e) => a + (Number(e.detail) || 0), 0) / 7)), unit: '/ day' },
    ]

    const shiftStart = s.shiftStart || Date.now()
    const shiftEntries = s.entries.filter(e => e.t >= shiftStart && (!s.shiftEnd || e.t <= s.shiftEnd)).sort((a, b) => a.t - b.t)
    const matched = new Set()
    const plan = [...s.plan].sort((a, b) => a.at - b.at).map(p => {
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
        sub: done ? 'logged ' + this.clock(p.hit.t) + (p.hit.detail && FEEDS.includes(p.hit.type) ? ' · ' + p.hit.detail + (p.hit.type === 'bottle' ? ' ' + this.unit() : '') : '') : isNext ? (late ? 'running ' + rel + ' late' : 'next up') : 'later',
        when: done ? 'done' : late ? 'now' : 'in ' + rel,
        stateIcon: done ? 'check_circle' : isNext ? 'schedule' : 'radio_button_unchecked',
        stateColor: done ? '#7C8C5A' : isNext ? (late ? '#A85A45' : '#4A5533') : '#CFC7B4',
        textColor: done ? '#8C8474' : '#26231D', whenColor: done ? '#8C8474' : late ? '#A85A45' : '#4A5533',
      }
    })
    const nextRow = planRows.find(r => r.stateIcon === 'schedule')
    const draft = s.planDraft || []
    const fmtPlanLabel = p => (p.type === 'bottle' ? 'Feed' : T(p.type).label)
    const requestPlan = this.draftPlan().slice(0, 2).map(p => ({ icon: T(p.type).icon, color: T(p.type).color, label: fmtPlanLabel(p) + ' ~' + this.clock(p.at) }))
    const requestPlanRows = draft.map(p => {
      const off = s.planOff.includes(p.id)
      return { icon: T(p.type).icon, color: T(p.type).color, label: fmtPlanLabel(p), time: '~' + this.clock(p.at),
        toggleIcon: off ? 'toggle_off' : 'toggle_on', toggleColor: off ? '#CFC7B4' : '#7C8C5A',
        onToggle: () => this.setState(st2 => ({ planOff: off ? st2.planOff.filter(x => x !== p.id) : [...st2.planOff, p.id] })) }
    })
    const t1 = requestPlan[0] ? this.clock(this.draftPlan()[0].at) : '', t2 = requestPlan[1] ? this.clock(this.draftPlan()[1].at) : ''
    const sf = shiftEntries.filter(e => FEEDS.includes(e.type)), sd = shiftEntries.filter(e => DIAPERS.includes(e.type)), ss = shiftEntries.filter(e => e.type === 'sleep')
    const sOz = sf.filter(e => e.type === 'bottle').reduce((a, e) => a + (Number(e.detail) || 0), 0)
    const reportRows = [
      { label: 'Feeds', value: sf.length ? sf.length + ' · ' + sf.map(e => this.clock(e.t)).join(', ') : 'none yet' },
      { label: 'Total from bottles', value: sOz + ' ' + this.unit() },
      { label: 'Diapers', value: sd.length ? sd.length + ' · ' + sd.map(e => e.type).join(', ') : 'none yet' },
      { label: 'Sleep logged', value: ss.length ? this.dur(ss.reduce((a, e) => a + (Number(e.detail) || 0), 0)) : 'none yet' },
      { label: 'Last thing', value: shiftEntries.length ? T(shiftEntries[shiftEntries.length - 1].type).label + ' · ' + this.clock(shiftEntries[shiftEntries.length - 1].t) : '—' },
    ]
    const reqMins = Math.round((Date.now() - s.requestAt) / 60000)

    return {
      reset: this.reset, noop: () => {},
      onboarding: s.screen === 'onboard', isHome: s.screen === 'home', isHistory: s.screen === 'history',
      showTabs: s.screen === 'home' || s.screen === 'history',
      isSplash: s.screen === 'splash', isAuth: s.screen === 'auth', isLogin: s.authMode === 'login', isSignup: s.authMode === 'signup',
      goSplash: () => this.setState({ screen: 'splash' }),
      goLogin: () => this.setState({ screen: 'auth', authMode: 'login' }), goSignup: () => this.setState({ screen: 'auth', authMode: 'signup' }),
      authSubmit: () => this.setState({ screen: s.authMode === 'login' ? 'home' : 'onboard' }),
      authTitle: s.authMode === 'login' ? 'Welcome back' : 'Let’s set up your log',
      authBody: s.authMode === 'login' ? 'Your log is right where you left it — and whatever Katrina added since.' : 'One account per grown-up. You’ll invite the other one in a second.',
      authCta: s.authMode === 'login' ? 'Log in' : 'Create account',
      loginTabBg: s.authMode === 'login' ? '#FFFDF8' : 'transparent', loginTabFg: s.authMode === 'login' ? '#26231D' : '#8C8474', loginTabShadow: s.authMode === 'login' ? '0 2px 8px rgba(38,35,29,0.08)' : 'none',
      signupTabBg: s.authMode === 'signup' ? '#FFFDF8' : 'transparent', signupTabFg: s.authMode === 'signup' ? '#26231D' : '#8C8474', signupTabShadow: s.authMode === 'signup' ? '0 2px 8px rgba(38,35,29,0.08)' : 'none',
      goHome: () => this.setState({ screen: 'home' }), goHistory: () => this.setState({ screen: 'history' }),
      homeTabBg: s.screen === 'home' ? 'rgba(124,140,90,0.14)' : '#FFFDF8',
      homeTabFg: s.screen === 'home' ? '#4A5533' : '#8C8474',
      histTabBg: s.screen === 'history' ? 'rgba(124,140,90,0.14)' : '#FFFDF8',
      histTabFg: s.screen === 'history' ? '#4A5533' : '#8C8474',

      nameField: s.nameField, setName: e => this.setState({ nameField: e.target.value }),
      inviteField: s.inviteField, setInvite: e => this.setState({ inviteField: e.target.value }),
      ageOptions: ['Under 2 wks', '2–8 wks', '2–6 mo', '6 mo +'].map(a => {
        const on = s.age === a
        return { label: a, onTap: () => this.setState({ age: a }), ...(on ? { bg: 'rgba(124,140,90,0.16)', border: OLIVE, fg: '#4A5533' } : { bg: '#FFFDF8', border: 'rgba(38,35,29,0.12)', fg: '#6E6659' }) }
      }),
      finishOnboard: () => this.setState(p => ({ screen: 'home', babyName: (p.nameField || 'Wren').trim() || 'Wren', age: p.age === '11 weeks' ? '2–8 wks' : p.age })),

      babyName: s.babyName, ageLabel: s.age,
      dateLabel: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      sinceCards: cards, todaySummary, timeline,

      sheetOpen: s.sheet, sheetKicker: s.editId ? 'Editing entry' : (s.offset === 0 ? 'stamped now' : Math.abs(s.offset) + ' min earlier'),
      stampTime: this.clock(stampT), nudges, types,
      hasDetail: !!kind, detailLabel: kind === 'amount' ? 'Amount' : kind === 'side' ? 'Side' : 'Duration', detailOptions,
      saveLabel: (s.editId ? 'Update ' : 'Save ') + st.label.toLowerCase() + detailStr,
      editing: !!s.editId, toast: !!s.toast, toastText: s.toast || '',
      openSheet: this.openSheet, closeSheet: this.closeSheet, save: this.save, undo: this.undo, remove: this.remove,

      handoffRows,
      incoming: s.shift === 'incoming', mine: s.shift === 'mine',
      dutyInitial: s.shift === 'mine' ? 'B' : 'K', dutyColor: s.shift === 'mine' ? '#7A93B5' : '#7C8C5A',
      dutyLabel: s.shift === 'mine' ? 'You · on duty' : 'Katrina · on duty',
      footerShiftLabel: s.shift === 'mine' ? 'Your shift' : 'Take over',
      requestAgo: 'asked ' + (reqMins < 1 ? 'just now' : reqMins + ' min ago'),
      requestNote: 'I need to sleep. Can you take him? He’ll want to eat around ' + t1 + ' and again about ' + t2 + ' — that’s his normal.',
      requestPlan, requestPlanRows,
      untilOptions: ['Until she wakes', 'Until 6 AM', 'Open-ended'].map(u => {
        const on = s.until === u
        return { label: u, onTap: () => this.setState({ until: u }), ...(on ? { bg: 'rgba(124,140,90,0.16)', border: OLIVE, fg: '#4A5533' } : { bg: '#FFFDF8', border: 'rgba(38,35,29,0.12)', fg: '#6E6659' }) }
      }),
      theirShiftLine: 'Katrina has been on since ' + this.clock(Date.now() - 6.4 * 3600000) + ' · ' + s.until.toLowerCase(),
      shiftOpen: s.shiftOpen, sheetTheirs: s.shiftOpen && s.shift !== 'mine' && s.shift !== 'report',
      sheetMine: s.shiftOpen && s.shift === 'mine', sheetReport: s.shiftOpen && s.shift === 'report',
      openShift: this.openShift, closeShift: this.closeShift, acceptShift: this.acceptShift, handBack: this.handBack, addPlanFeed: this.addPlanFeed,
      shiftSince: 'since ' + this.clock(shiftStart), shiftElapsed: this.elapsed(shiftStart),
      nextUp: nextRow ? 'Next: ' + nextRow.label.split(' · ')[0].toLowerCase() + ' ' + nextRow.when : 'Plan done',
      plan: planRows, reportRows,
      reportRange: this.clock(shiftStart) + ' – ' + this.clock(s.shiftEnd || Date.now()) + ' · ' + this.elapsed(shiftStart) + ' on duty',
      handbackNote: s.handbackNote, hasHandbackNote: !!s.handbackNote, setHandbackNote: e => this.setState({ handbackNote: e.target.value }),

      historySubtitle: feedsWk.length + ' feeds · ' + week.filter(e => DIAPERS.includes(e.type)).length + ' diapers logged',
      stats, feedBars: this.bars(FEEDS, 'oklch(0.60 0.075 130)'), diaperBars: this.bars(DIAPERS, 'oklch(0.60 0.075 210)'),
      feedUnitLabel: 'feeds',
      patternTitle: 'Roughly every ' + this.dur(avgGap) + ' between feeds',
      patternBody: 'Longest stretch this week was ' + this.dur(Math.round(longest)) + '. Handy for knowing whether the next wake-up is hunger or something else.',
    }
  }

  render() {
    const v = this.renderVals()
    return (
      <div className="app">
        {/* background illustration + wash */}
        <div style={S('position:absolute;inset:0;z-index:0;pointer-events:none')}>
          <img src="/art/app-bg.png" alt="" style={S('width:100%;height:100%;object-fit:cover;display:block')} />
          <div style={S('position:absolute;inset:0;background:linear-gradient(to bottom, rgba(250,246,239,0.25), rgba(250,246,239,0.6) 45%, rgba(250,246,239,0.85))')} />
        </div>

        {v.isSplash && (
          <div style={S('flex:1;display:flex;flex-direction:column;align-items:center;padding:0 24px 22px;position:relative;z-index:1;min-height:0')}>
            <div style={S('flex:1')} />
            <div style={S('width:168px;height:168px;border-radius:999px;background:#FFFDF8;box-shadow:0 14px 40px rgba(38,35,29,0.12);display:flex;align-items:center;justify-content:center')}>
              <Duck size={116} />
            </div>
            <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:40px;letter-spacing:-0.03em;color:#4A5533;padding-top:26px")}>Baby Log</div>
            <div style={S('font-size:16.5px;line-height:1.45;color:#6E6659;text-align:center;padding-top:8px;text-wrap:pretty;max-width:260px')}>Three taps, then back to the baby.<br />Both of you, one log.</div>
            <div style={S('flex:1.2')} />
            <button type="button" onClick={v.goSignup} className="hov-olive" style={S('width:100%;height:60px;background:#7C8C5A;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit;box-shadow:0 8px 20px rgba(124,140,90,0.3)')}>
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
                <Sym style={{ fontSize: 20, color: '#6E6659' }}>arrow_back</Sym>
              </button>
              <div style={S('display:flex;align-items:center;gap:6px')}>
                <Duck size={30} />
                <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:17px;letter-spacing:-0.02em;color:#4A5533")}>Baby Log</div>
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
                <input placeholder="Your name" style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:18px;padding:15px 18px;font-size:16.5px;color:#26231D;outline:none')} />
              )}
              <input placeholder="Email" type="email" style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:18px;padding:15px 18px;font-size:16.5px;color:#26231D;outline:none')} />
              <input placeholder="Password" type="password" style={S('width:100%;box-sizing:border-box;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:18px;padding:15px 18px;font-size:16.5px;color:#26231D;outline:none')} />
            </div>
            {v.isLogin && (
              <div style={S('display:flex;justify-content:flex-end;padding-top:10px')}><a href="#" onClick={e => e.preventDefault()} style={S('font-size:13.5px;font-weight:600;color:#5F6E42')}>Forgot password?</a></div>
            )}
            <button type="button" onClick={v.authSubmit} className="hov-olive" style={S('margin-top:18px;width:100%;height:60px;background:#7C8C5A;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit;box-shadow:0 8px 20px rgba(124,140,90,0.3)')}>
              <div style={S('font-size:17px;font-weight:700;color:#FCFBF6')}>{v.authCta}</div>
              <Sym style={{ fontSize: 21, color: '#FCFBF6' }}>arrow_forward</Sym>
            </button>
            <div style={S('display:flex;align-items:center;gap:12px;padding:20px 0 14px')}>
              <div style={S('flex:1;height:1px;background:rgba(38,35,29,0.10)')} />
              <div style={S('font-size:12.5px;color:#B5AC98')}>or</div>
              <div style={S('flex:1;height:1px;background:rgba(38,35,29,0.10)')} />
            </div>
            <div style={S('display:flex;flex-direction:column;gap:8px')}>
              <button type="button" onClick={v.authSubmit} className="hov-cream" style={S('width:100%;height:52px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;color:#26231D')}>Continue with Apple</button>
              <button type="button" onClick={v.authSubmit} className="hov-cream" style={S('width:100%;height:52px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:999px;cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;color:#26231D')}>Continue with Google</button>
            </div>
            <div style={S('flex:1')} />
            <div style={S('font-size:12px;line-height:1.5;color:#B5AC98;text-align:center;padding-top:16px;text-wrap:pretty')}>Invited by a partner? Use the same email they sent it to and you’ll land in their log.</div>
          </div>
        )}

        {v.onboarding && (
          <div style={S('flex:1;display:flex;flex-direction:column;padding:24px 24px 20px;overflow:auto;position:relative;z-index:1;min-height:0')}>
            <div style={S('padding:6px 0 34px')}>
              <div style={S('display:flex;align-items:center;gap:6.4px')}>
                <Duck size={32} />
                <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:19px;letter-spacing:-0.02em;color:#4A5533")}>Baby Log</div>
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
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Born</div>
                <div style={S('display:flex;gap:8px')}>
                  {v.ageOptions.map(a => (
                    <button key={a.label} type="button" onClick={a.onTap} style={S(`flex:1;background:${a.bg};border:1px solid ${a.border};border-radius:14px;padding:13px 6px;font-family:inherit;font-size:13.5px;font-weight:500;color:${a.fg};cursor:pointer`)}>{a.label}</button>
                  ))}
                </div>
              </div>

              <div style={S('display:flex;flex-direction:column;gap:7px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Who else logs?</div>
                <div style={S('background:#FFFDF8;border:1px solid rgba(38,35,29,0.12);border-radius:16px;padding:4px 4px 4px 16px;display:flex;align-items:center;gap:8px')}>
                  <input value={v.inviteField} onChange={v.setInvite} placeholder="katrina@email.com" type="email" style={S('flex:1;min-width:0;background:none;border:none;padding:13px 0;font-size:16px;color:#26231D;outline:none')} />
                  <button type="button" onClick={v.noop} style={S('background:rgba(124,140,90,0.14);border:none;border-radius:12px;padding:11px 14px;font-family:inherit;font-size:13.5px;font-weight:600;color:#5F6E42;cursor:pointer')}>Invite</button>
                </div>
                <div style={S('font-size:12.5px;color:#8C8474;padding-left:2px')}>They see the same log live. No “when did you…” texts.</div>
              </div>
            </div>

            <div style={S('flex:1')} />
            <button type="button" onClick={v.finishOnboard} className="hov-olive" style={S('margin-top:24px;width:100%;height:60px;background:#7C8C5A;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(124,140,90,0.3)')}>
              <div style={S('font-size:17px;font-weight:600;color:#FCFBF6;letter-spacing:-0.01em')}>Start logging</div>
              <Sym style={{ fontSize: 21, color: '#FCFBF6' }}>arrow_forward</Sym>
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
                  <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;letter-spacing:0.06em")}>{v.ageLabel} · {v.dateLabel}</div>
                </div>
              </div>
              <button type="button" onClick={v.openShift} className="hov-bd" style={S('display:flex;align-items:center;gap:8px;background:#FFFDF8;border:1px solid rgba(38,35,29,0.08);border-radius:999px;padding:5px 13px 5px 6px;cursor:pointer;font-family:inherit')}>
                <div style={S(`width:24px;height:24px;border-radius:999px;background:${v.dutyColor};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#FCFBF6`)}>{v.dutyInitial}</div>
                <div style={S('font-size:12.5px;color:#6E6659;font-weight:500')}>{v.dutyLabel}</div>
              </button>
            </div>

            <div style={S('flex:1;overflow:auto;padding:0 16px 20px;min-height:0')}>

              {v.incoming && (
                <div style={S('background:#FFFDF8;border:1px solid rgba(124,140,90,0.35);border-radius:26px;box-shadow:0 2px 14px rgba(38,35,29,0.06);padding:16px 16px 14px;margin-bottom:12px;display:flex;flex-direction:column;gap:12px')}>
                  <div style={S('display:flex;align-items:center;gap:10px')}>
                    <div style={S('width:34px;height:34px;border-radius:999px;background:#7C8C5A;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#FCFBF6')}>K</div>
                    <div style={S('flex:1;display:flex;flex-direction:column;gap:1px')}>
                      <div style={S('font-size:15px;font-weight:700;letter-spacing:-0.01em')}>Katrina is handing off</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>{v.requestAgo}</div>
                    </div>
                    <Sym style={{ fontSize: 22, color: '#7C8C5A' }}>swap_horiz</Sym>
                  </div>
                  <div style={S('font-size:15px;line-height:1.45;color:#4E4A3F;background:rgba(124,140,90,0.09);border-radius:16px;padding:12px 14px;text-wrap:pretty')}>“{v.requestNote}”</div>
                  <div style={S('display:flex;flex-direction:column;gap:6px')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Her plan for your shift</div>
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
                    <button type="button" onClick={v.acceptShift} className="hov-olive" style={S('flex:1;height:50px;background:#7C8C5A;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit;box-shadow:0 6px 16px rgba(124,140,90,0.28)')}>
                      <Sym style={{ fontSize: 20, color: '#FCFBF6' }}>check</Sym>
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
                      <div style={S('width:28px;height:28px;border-radius:999px;background:#7A93B5;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#FCFBF6')}>B</div>
                      <div style={S('display:flex;flex-direction:column')}>
                        <div style={S('font-size:15px;font-weight:700;letter-spacing:-0.01em')}>Your shift</div>
                        <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>{v.shiftSince}</div>
                      </div>
                    </div>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#4A5533;background:rgba(124,140,90,0.14);border-radius:999px;padding:5px 11px")}>{v.nextUp}</div>
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
                      <Sym style={{ fontSize: 17, color: '#8C8474' }}>add</Sym>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#8C8474")}>Add to plan</div>
                    </button>
                    <button type="button" onClick={v.openShift} className="hov-dim" style={S('background:none;border:none;display:flex;align-items:center;gap:5px;cursor:pointer;font-family:inherit;padding:4px 0')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#5F6E42")}>Hand back</div>
                      <Sym style={{ fontSize: 17, color: '#5F6E42' }}>arrow_forward</Sym>
                    </button>
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
                {v.timeline.map((e, i) => (
                  <button key={i} type="button" onClick={e.onEdit} className="hov-row" style={S('width:100%;background:none;border:none;border-top:1px solid rgba(38,35,29,0.06);padding:13px 15px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;font-family:inherit')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12.5px;color:#6E6659;width:62px;flex-shrink:0;letter-spacing:-0.02em")}>{e.time}</div>
                    <div style={S('position:relative;width:36px;height:36px;border-radius:999px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0')}>
                      <div style={S(`position:absolute;inset:0;background:${e.color};opacity:0.16`)} />
                      <Sym style={{ position: 'relative', fontSize: 19, color: e.color }}>{e.icon}</Sym>
                    </div>
                    <div style={S('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                      <div style={S('font-size:15px;font-weight:600;letter-spacing:-0.01em')}>{e.label}</div>
                      <div style={S('font-size:11.5px;color:#8C8474')}>{e.sub}</div>
                    </div>
                    <Sym style={{ fontSize: 18, color: '#CFC7B4', flexShrink: 0 }}>chevron_right</Sym>
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
              <Duck size={38} />
              <div style={S('display:flex;flex-direction:column;gap:1px')}>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:23px;letter-spacing:-0.02em")}>Last 7 days</div>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474;letter-spacing:0.06em")}>{v.historySubtitle}</div>
              </div>
            </div>

            <div style={S('flex:1;overflow:auto;padding:0 16px 20px;min-height:0')}>
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
                    <div style={S('width:9px;height:9px;border-radius:3px;background:#7C8C5A')} />
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474;letter-spacing:0.06em")}>{v.feedUnitLabel}</div>
                  </div>
                </div>
                <div style={S('display:flex;align-items:flex-end;gap:8px;height:118px')}>
                  {v.feedBars.map((b, i) => (
                    <div key={i} style={S('flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;height:100%;justify-content:flex-end')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#6E6659")}>{b.value}</div>
                      <div style={S(`width:100%;border-radius:8px 8px 3px 3px;background:${b.fill};height:${b.h}`)} />
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;letter-spacing:0.08em;color:#A79E8B")}>{b.day}</div>
                    </div>
                  ))}
                </div>
              </div>

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
                    <div key={i} style={S('flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;height:100%;justify-content:flex-end')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#6E6659")}>{b.value}</div>
                      <div style={S(`width:100%;border-radius:8px 8px 3px 3px;background:${b.fill};height:${b.h}`)} />
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;letter-spacing:0.08em;color:#A79E8B")}>{b.day}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={S('background:rgba(124,140,90,0.10);border:1px solid rgba(124,140,90,0.22);border-radius:22px;padding:16px;margin-top:12px;display:flex;gap:12px;align-items:flex-start')}>
                <Sym style={{ fontSize: 20, color: '#5F6E42', flexShrink: 0 }}>insights</Sym>
                <div style={S('display:flex;flex-direction:column;gap:3px')}>
                  <div style={S('font-size:14.5px;font-weight:600;color:#4A5533')}>{v.patternTitle}</div>
                  <div style={S('font-size:13px;line-height:1.5;color:#5F6E42;text-wrap:pretty')}>{v.patternBody}</div>
                </div>
              </div>

              <div style={S('text-align:center;padding:16px 0 0')}>
                <button type="button" onClick={v.reset} className="hov-bd" style={S("background:none;border:1px solid rgba(38,35,29,0.14);border-radius:999px;padding:8px 15px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#8C8474;cursor:pointer")}>Reset demo data</button>
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
              <button type="button" onClick={v.openSheet} className="hov-olive" style={S('width:68px;height:68px;background:#7C8C5A;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 20px rgba(124,140,90,0.34);margin-bottom:6px')}>
                <Sym style={{ fontSize: 32, color: '#FCFBF6' }}>add</Sym>
              </button>
              <button type="button" onClick={v.goHistory} className="hov-cream" style={S(`height:56px;flex:1;background:${v.histTabBg};border:1px solid rgba(38,35,29,0.10);border-radius:999px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-family:inherit`)}>
                <Sym style={{ fontSize: 20, color: v.histTabFg }}>bar_chart</Sym>
                <div style={S(`font-size:11px;font-weight:600;color:${v.histTabFg};letter-spacing:0.01em`)}>History</div>
              </button>
            </div>
            <div style={S('display:flex;justify-content:center;padding-top:6px;position:relative;z-index:1')}>
              <button type="button" onClick={v.openShift} className="hov-dim" style={S('background:none;border:none;display:flex;align-items:center;gap:6px;cursor:pointer;font-family:inherit;padding:4px 10px')}>
                <Sym style={{ fontSize: 16, color: '#8C8474' }}>swap_horiz</Sym>
                <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>{v.footerShiftLabel}</div>
              </button>
            </div>
          </>
        )}

        {v.toast && (
          <div style={S('position:absolute;left:16px;right:16px;bottom:126px;background:#26231D;border-radius:999px;padding:11px 10px 11px 18px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,0.25);z-index:30')}>
            <div style={S('flex:1;min-width:0;font-size:14px;color:#FAF6EF')}>{v.toastText}</div>
            <button type="button" onClick={v.undo} style={S("background:rgba(250,246,239,0.16);border:none;border-radius:999px;padding:7px 14px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#FAF6EF;cursor:pointer")}>Undo</button>
          </div>
        )}

        {v.sheetOpen && (
          <div style={S('position:absolute;inset:0;z-index:40')}>
            <div onClick={v.closeSheet} style={S('position:absolute;inset:0;background:rgba(30,27,20,0.42);backdrop-filter:blur(2px)')} />
            <div style={S('position:absolute;left:0;right:0;bottom:0;background:#FAF6EF;border-radius:34px 34px 0 0;padding:10px 16px 22px;box-shadow:0 -12px 40px rgba(0,0,0,0.18);overflow:hidden')}>
              <div style={S('position:absolute;inset:0;z-index:0')}>
                <img src="/art/sheet-bg.png" alt="" style={S('width:100%;height:100%;object-fit:cover;display:block')} />
                <div style={S('position:absolute;inset:0;background:rgba(250,246,239,0.7);pointer-events:none')} />
              </div>
              <div style={S('position:relative;z-index:1')}>
                <div style={S('width:38px;height:4px;border-radius:99px;background:rgba(38,35,29,0.16);margin:0 auto 14px')} />

                <div style={S('display:flex;align-items:flex-end;justify-content:space-between;padding:0 4px 12px')}>
                  <div style={S('display:flex;flex-direction:column;gap:3px')}>
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#8C8474")}>{v.sheetKicker}</div>
                    <div style={S("font-family:'Nunito',sans-serif;font-size:31px;font-weight:700;letter-spacing:-0.04em")}>{v.stampTime}</div>
                  </div>
                  <div style={S('display:flex;gap:6px;padding-bottom:6px')}>
                    {v.nudges.map((n, i) => (
                      <button key={i} type="button" onClick={n.onTap} style={S(`background:${n.bg};border:1px solid ${n.border};border-radius:999px;padding:7px 11px;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:${n.fg};cursor:pointer;letter-spacing:-0.01em`)}>{n.label}</button>
                    ))}
                  </div>
                </div>

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
                    {v.detailOptions.map((d, i) => (
                      <button key={i} type="button" onClick={d.onTap} style={S(`flex-shrink:0;background:${d.bg};border:1px solid ${d.border};border-radius:999px;padding:8px 13px;font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:${d.fg};cursor:pointer`)}>{d.label}</button>
                    ))}
                  </div>
                )}

                <button type="button" onClick={v.save} className="hov-olive" style={S('margin-top:16px;width:100%;height:66px;background:#7C8C5A;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(124,140,90,0.3)')}>
                  <Sym style={{ fontSize: 23, color: '#FCFBF6' }}>check</Sym>
                  <div style={S('font-size:17px;font-weight:600;color:#FCFBF6;letter-spacing:-0.01em')}>{v.saveLabel}</div>
                </button>

                <div style={S('display:flex;align-items:center;justify-content:space-between;padding:12px 6px 0')}>
                  <button type="button" onClick={v.closeSheet} style={S("background:none;border:none;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#8C8474;cursor:pointer")}>Cancel</button>
                  {v.editing && (
                    <button type="button" onClick={v.remove} style={S("background:none;border:none;font-family:'Nunito',sans-serif;font-weight:600;font-size:11px;color:#A85A45;cursor:pointer")}>Delete entry</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {v.shiftOpen && (
          <div style={S('position:absolute;inset:0;z-index:50')}>
            <div onClick={v.closeShift} style={S('position:absolute;inset:0;background:rgba(30,27,20,0.42);backdrop-filter:blur(2px)')} />
            <div style={S('position:absolute;left:0;right:0;bottom:0;background:#FAF6EF;border-radius:34px 34px 0 0;padding:10px 16px 22px;box-shadow:0 -12px 40px rgba(0,0,0,0.18);max-height:min(760px, 88dvh);overflow:auto')}>
              <div style={S('width:38px;height:4px;border-radius:99px;background:rgba(38,35,29,0.16);margin:0 auto 14px')} />

              {v.sheetTheirs && (
                <>
                  <div style={S('display:flex;align-items:center;justify-content:center;gap:14px;padding:6px 0 14px')}>
                    <div style={S('display:flex;flex-direction:column;align-items:center;gap:6px')}>
                      <div style={S('width:56px;height:56px;border-radius:999px;background:#7C8C5A;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#FCFBF6')}>K</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#6E6659")}>Katrina</div>
                    </div>
                    <Sym style={{ fontSize: 28, color: '#B5AC98', marginBottom: 22 }}>arrow_forward</Sym>
                    <div style={S('display:flex;flex-direction:column;align-items:center;gap:6px')}>
                      <div style={S('width:56px;height:56px;border-radius:999px;background:#7A93B5;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#FCFBF6')}>B</div>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#6E6659")}>You</div>
                    </div>
                  </div>
                  <div style={S("text-align:center;font-family:'Nunito',sans-serif;font-weight:800;font-size:23px;letter-spacing:-0.02em")}>Take over from Katrina</div>
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
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:11.5px;color:#B5AC98")}>from his usual rhythm</div>
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

                  <button type="button" onClick={v.acceptShift} className="hov-olive" style={S('margin-top:14px;width:100%;height:62px;background:#7C8C5A;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(124,140,90,0.3)')}>
                    <Sym style={{ fontSize: 22, color: '#FCFBF6' }}>check</Sym>
                    <div style={S('font-size:16.5px;font-weight:700;color:#FCFBF6')}>I’ve got him — start my shift</div>
                  </button>
                  <div style={S('text-align:center;font-size:12px;color:#8C8474;padding-top:10px')}>Katrina gets a “Ben’s on duty” ping and can sleep.</div>
                </>
              )}

              {v.sheetMine && (
                <>
                  <div style={S('display:flex;align-items:center;gap:12px;padding:4px 4px 14px')}>
                    <div style={S('width:48px;height:48px;border-radius:999px;background:#7A93B5;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;color:#FCFBF6')}>B</div>
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
                    <div style={S("font-family:'Nunito',sans-serif;font-weight:600;font-size:12px;color:#8C8474")}>Note for Katrina</div>
                    <input value={v.handbackNote} onChange={v.setHandbackNote} placeholder="e.g. took the 1am bottle slow, fell asleep on me" style={S('width:100%;box-sizing:border-box;background:rgba(38,35,29,0.04);border:none;border-radius:12px;padding:12px 13px;font-size:14.5px;color:#26231D;outline:none')} />
                  </div>
                  <button type="button" onClick={v.handBack} className="hov-olive" style={S('margin-top:14px;width:100%;height:62px;background:#7C8C5A;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(124,140,90,0.3)')}>
                    <Sym style={{ fontSize: 22, color: '#FCFBF6' }}>swap_horiz</Sym>
                    <div style={S('font-size:16.5px;font-weight:700;color:#FCFBF6')}>Hand back to Katrina</div>
                  </button>
                  <div style={S('text-align:center;font-size:12px;color:#8C8474;padding-top:10px;text-wrap:pretty')}>She gets this summary as a card — no scrolling the log, no “when did you…”</div>
                </>
              )}

              {v.sheetReport && (
                <>
                  <div style={S('display:flex;align-items:center;gap:12px;padding:4px 4px 14px')}>
                    <div style={S('width:48px;height:48px;border-radius:999px;background:rgba(124,140,90,0.16);display:flex;align-items:center;justify-content:center')}>
                      <Sym style={{ fontSize: 24, color: '#5F6E42' }}>task_alt</Sym>
                    </div>
                    <div style={S('display:flex;flex-direction:column;gap:2px')}>
                      <div style={S("font-family:'Nunito',sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.02em")}>Katrina’s back on</div>
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
                    <div style={S('font-size:14.5px;line-height:1.45;color:#4E4A3F;background:rgba(124,140,90,0.09);border-radius:16px;padding:12px 14px;margin-top:10px')}>“{v.handbackNote}”</div>
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

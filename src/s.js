// Parses the design comp's inline CSS strings into React style objects,
// so markup can be carried over from design/Baby Log.dc.html verbatim.
const cache = new Map()

export function S(str) {
  let o = cache.get(str)
  if (o) return o
  o = {}
  for (const part of str.split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (!k) continue
    o[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = part.slice(i + 1).trim()
  }
  if (cache.size < 4000) cache.set(str, o)
  return o
}

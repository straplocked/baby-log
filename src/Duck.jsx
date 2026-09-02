import React from 'react'

// The duckling mark from the design comp — six absolutely-positioned ellipses,
// authored at 36px and scaled by `size`.
const PARTS = [
  { l: 0.05, t: 0.375, w: 0.65, h: 0.55, r: '50% 50% 46% 46%', c: '#E6D39C' },
  { l: 0.475, t: 0.075, w: 0.425, h: 0.425, r: '50%', c: '#E6D39C' },
  { l: 0.825, t: 0.25, w: 0.2, h: 0.139, r: '50%', c: '#D9955F' },
  { l: 0.688, t: 0.214, w: 0.064, h: 0.064, r: '50%', c: '#5B554A' },
  { l: 0.175, t: 0.55, w: 0.325, h: 0.225, r: '50%', c: '#D9C27F', rot: -18 },
  { l: 0.625, t: 0.05, w: 0.125, h: 0.1, r: '50%', c: '#D9C27F', rot: -30 },
]

export default function Duck({ size = 36 }) {
  const px = f => Math.round(f * size * 10) / 10 + 'px'
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {PARTS.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: px(p.l), top: px(p.t), width: px(p.w), height: px(p.h),
          borderRadius: p.r, background: p.c,
          transform: p.rot ? `rotate(${p.rot}deg)` : undefined,
        }} />
      ))}
    </div>
  )
}

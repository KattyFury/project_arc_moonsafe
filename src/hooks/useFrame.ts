// Frame by window aspect ratio (SPEC §4): < 0.8 portrait, 0.8–1.25 square, > 1.25 landscape.
// A phone turned sideways (touch + height < 500) gets the "rotate" notice instead.

import { useEffect, useState } from 'react'

export type FrameMode = 'portrait' | 'square' | 'landscape'

function measure(): { mode: FrameMode; rotate: boolean } {
  const w = window.innerWidth
  const h = window.innerHeight
  const r = w / h
  const touch = window.matchMedia('(pointer: coarse)').matches
  const mode: FrameMode = r < 0.8 ? 'portrait' : r <= 1.25 ? 'square' : 'landscape'
  return { mode, rotate: touch && h < 500 && w > h }
}

export function useFrame() {
  const [f, setF] = useState(measure)
  useEffect(() => {
    const on = () => setF(measure())
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on) }
  }, [])
  return f
}

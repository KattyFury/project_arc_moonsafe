// Language gate: the app is English-only (decided 2026-10-24). Lists every line in what
// users see (src/, functions/, index.html) that still holds Vietnamese, comments excluded.
// A line that must keep Vietnamese on purpose (patterns that read a Vietnamese user's
// message, the agent's own Vietnamese test phrases) carries the marker "lang-ok".
//   node scripts/check-lang.mjs        → exit 1 if anything is left
// Checked by script, not by eye: strings live in 20+ files and eyes miss them.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const TARGETS = ['src', 'functions', 'index.html']
const SKIP = new Set(['src/preview-main.tsx'])
const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i
// Vietnamese words with no accent mark ("Mua cirBTC" slipped past the accent check, 2026-10-24).
const VI_PLAIN = /(Mua|Nap|Rut|Quy|Huy|Xoa|Luu|Dang|khong|duoc|tien|vao)/

function files(p) {
  const s = statSync(p)
  if (s.isFile()) return /\.(tsx?|mjs|js|html)$/.test(p) ? [p] : []
  return readdirSync(p).flatMap(n => files(join(p, n)))
}

/** Source with comments blanked out (keeps line numbers). Strings are left alone. */
function stripComments(src) {
  let out = '', i = 0, quote = null
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += n ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++; continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++ } i += 2; continue }
    if (c === '<' && src.startsWith('<!--', i)) { const end = src.indexOf('-->', i); const block = src.slice(i, end + 3); out += block.replace(/[^\n]/g, ''); i = end + 3; continue }
    out += c; i++
  }
  return out
}

let hits = 0
for (const t of TARGETS) for (const f of files(join(ROOT, t))) {
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  if (SKIP.has(rel)) continue
  const raw = readFileSync(f, 'utf8').split('\n')
  stripComments(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
    if ((VI.test(line) || VI_PLAIN.test(line)) && !raw[i].includes('lang-ok')) { hits++; console.log(`${rel}:${i + 1}: ${(process.env.FULL ? raw[i].trim() : raw[i].trim().slice(0, 120))}`) }
  })
}
console.log(hits ? `\n${hits} line(s) still in Vietnamese.` : 'English only: no Vietnamese left.')
process.exit(hits ? 1 : 0)

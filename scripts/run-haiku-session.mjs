// Load local secrets without printing them, then run the real-handler evaluation.
import { readFileSync } from 'node:fs'
for (const path of ['.env', '.dev.vars']) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^ANTHROPIC_API_KEY\s*=\s*(.*)$/)
    if (match && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = match[1].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
}
await import('./local-ts-runtime.mjs')
await import('./claude-reeval.ts')

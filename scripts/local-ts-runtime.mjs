// Node runtime for the evaluation scripts when Bun is unavailable.
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL)
      if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + '.ts')) return nextResolve(url.href + '.ts', context)
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { format: 'module', source: `export default ${JSON.stringify(JSON.parse(readFileSync(new URL(url), 'utf8')))}`, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
if (process.argv.includes('--check-environment')) {
  console.log(JSON.stringify({ anthropicKeyAvailable: Boolean(process.env.ANTHROPIC_API_KEY), node: process.version }))
}

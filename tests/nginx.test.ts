import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// nginx drops the server-level add_header lines in any location that has its own.
describe('nginx.conf', () => {
  const conf = readFileSync('nginx.conf', 'utf8')
  const serverHeaders = conf
    .split('\n')
    .filter((l) => /^ {2}add_header/.test(l))
    .map((l) => l.trim())
  const locations = [...conf.matchAll(/location ([^{]+)\{([^}]*)\}/g)].map((m) => ({ name: m[1].trim(), body: m[2] }))

  it('has the security headers at server level', () => {
    expect(serverHeaders.some((h) => h.includes('Content-Security-Policy'))).toBe(true)
    expect(serverHeaders.some((h) => h.includes('X-Content-Type-Options'))).toBe(true)
  })
  it('repeats them in every location that adds its own headers', () => {
    for (const loc of locations) {
      if (!loc.body.includes('add_header')) continue
      for (const h of serverHeaders) expect(loc.body, loc.name).toContain(h)
    }
  })
})

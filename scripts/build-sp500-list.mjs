#!/usr/bin/env node
// One-time/occasional script — NOT run in CI or at request time. S&P 500
// membership changes only a handful of times a year, so this is meant to be
// re-run by hand occasionally, not on every scan.
//
// Scrapes Wikipedia's "List of S&P 500 companies" constituents table and
// writes src/data/sp500.json as [{ ticker, name, sector, subIndustry }].
//
// Usage: node scripts/build-sp500-list.mjs
import * as cheerio from 'cheerio'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'sp500.json')
const WIKI_URL = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'

async function main() {
  const res = await fetch(WIKI_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (kairo-scan build script)' } })
  if (!res.ok) throw new Error(`Wikipedia fetch failed: HTTP ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const table = $('table.wikitable').first()
  const rows = []
  table.find('tbody > tr').each((i, tr) => {
    const cells = $(tr).find('td')
    if (cells.length < 4) return // header row
    const ticker = $(cells[0]).text().trim()
    const name = $(cells[1]).text().trim()
    const sector = $(cells[2]).text().trim()
    const subIndustry = $(cells[3]).text().trim()
    if (!ticker || !name) return
    rows.push({ ticker, name, sector, subIndustry })
  })

  if (rows.length < 480) {
    throw new Error(`Only parsed ${rows.length} rows — Wikipedia's table structure may have changed. Aborting write.`)
  }

  rows.sort((a, b) => a.ticker.localeCompare(b.ticker))
  writeFileSync(OUT_PATH, JSON.stringify(rows, null, 2) + '\n')

  const sectors = [...new Set(rows.map(r => r.sector))].sort()
  console.log(`Wrote ${rows.length} constituents to ${path.relative(process.cwd(), OUT_PATH)}`)
  console.log(`Sectors (${sectors.length}):`, sectors.join(', '))
}

main().catch(err => {
  console.error('build-sp500-list failed:', err.message)
  process.exit(1)
})

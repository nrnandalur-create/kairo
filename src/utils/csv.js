// Tiny client-side CSV download helper. Build a Blob from headers + rows
// and trigger a hidden-anchor download. No server round-trip, no deps.
//
//   downloadCsv('watchlist.csv',
//     ['Ticker', 'Price', 'Change %'],
//     [['AAPL', 200.43, 1.23], ['NVDA', 510.12, -0.54]])

function escapeCell(v) {
  if (v == null) return ''
  const s = String(v)
  // Quote if value contains a comma, quote, newline, or leading/trailing space.
  if (/[",\n\r]|^\s|\s$/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function buildCsv(headers, rows) {
  const lines = []
  if (headers?.length) lines.push(headers.map(escapeCell).join(','))
  for (const row of rows ?? []) {
    lines.push(row.map(escapeCell).join(','))
  }
  return lines.join('\r\n')
}

export function downloadCsv(filename, headers, rows) {
  if (typeof window === 'undefined') return
  const csv  = buildCsv(headers, rows)
  // BOM so Excel opens UTF-8 cleanly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Free the object URL on the next tick so the download actually completes.
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

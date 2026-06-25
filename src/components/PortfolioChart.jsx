import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

const WINDOWS = [
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
  { label: '90D', days: 90 },
]

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function fmtDate(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const v   = payload[0]?.value
  const pct = payload[0]?.payload?.gainPct
  const up  = pct >= 0
  return (
    <div style={{
      background: '#0f1611',
      border: '1px solid #1a2e1f',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
    }}>
      <div style={{ color: '#4b6358', fontSize: 10, marginBottom: 4 }}>
        {fmtDate(label)}
      </div>
      <div style={{ color: '#d1d9d5', fontWeight: 600 }}>
        ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      {pct != null && (
        <div style={{ color: up ? '#22B585' : '#ef5454', fontSize: 11, marginTop: 2 }}>
          {up ? '+' : ''}{Number(pct).toFixed(2)}% all-time
        </div>
      )}
    </div>
  )
}

export default function PortfolioChart({ snapshots }) {
  const [days, setDays] = useState(30)

  const data = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    return snapshots
      .filter(s => s.snapshot_date >= cutoffStr)
      .map(s => ({
        date:    s.snapshot_date,
        value:   Number(s.total_value),
        gainPct: Number(s.gain_loss_pct ?? 0),
      }))
  }, [snapshots, days])

  if (!snapshots.length) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '20px 0',
        color: '#4b6358',
        fontSize: 12,
        lineHeight: 1.6,
      }}>
        Portfolio history appears after the first daily snapshot runs at 4 pm ET.
      </div>
    )
  }

  const first   = data[0]?.value ?? 0
  const last    = data[data.length - 1]?.value ?? 0
  const isUp    = last >= first
  const color   = isUp ? '#22B585' : '#ef5454'
  const gradId  = `pg-${days}`

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 9, color: '#4b6358', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
          Performance
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {WINDOWS.map(w => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: `1px solid ${days === w.days ? color : '#1a2e1f'}`,
                background: days === w.days ? `${color}18` : 'transparent',
                color: days === w.days ? color : '#4b6358',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                transition: 'all 0.15s',
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {data.length < 2 ? (
        <div style={{ textAlign: 'center', padding: '14px 0', color: '#4b6358', fontSize: 12 }}>
          Not enough data for this window yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={color} stopOpacity={0}    />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fontSize: 9, fill: '#4b6358' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={fmtY}
              tick={{ fontSize: 9, fill: '#4b6358' }}
              axisLine={false}
              tickLine={false}
              width={38}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

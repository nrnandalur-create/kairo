// US equities market state — derived from current US/Eastern wall-clock time.
// State machine:
//   pre    — 04:00-09:29 ET, weekday
//   open   — 09:30-15:59 ET, weekday
//   after  — 16:00-19:59 ET, weekday
//   closed — everything else (overnight, weekends, holidays)
//
// Holiday calendar covers all NYSE full-day closures through end of 2027.
// Doesn't model early-close days (e.g., Black Friday 13:00 ET) — would surface
// as "open" on those afternoons, which is a small enough miss for ambient UI.

const HOLIDAYS = new Set([
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18',
  '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01',
  '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26',
  '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06',
  '2027-11-25', '2027-12-24',
])

// Read year / month / day / weekday / hour / minute as seen in America/New_York.
// Uses Intl.DateTimeFormat parts because Date methods give viewer-local values.
const ET_PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit',
  hour12: false,
})

function etParts(now) {
  const parts = ET_PARTS_FMT.formatToParts(now).reduce((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,      // 'Mon', 'Tue', ...
    hour:    Number(parts.hour === '24' ? '00' : parts.hour),
    minute:  Number(parts.minute),
  }
}

const LABEL = {
  pre:    'Pre-Market',
  open:   'Market Open',
  after:  'After Hours',
  closed: 'Market Closed',
}

export function getMarketState(now = new Date()) {
  const { isoDate, weekday, hour, minute } = etParts(now)
  const isWeekend = weekday === 'Sat' || weekday === 'Sun'
  const isHoliday = HOLIDAYS.has(isoDate)

  if (isWeekend || isHoliday) {
    return { state: 'closed', label: LABEL.closed }
  }

  const mins = hour * 60 + minute
  const PRE_OPEN  =  4 * 60        // 04:00
  const REG_OPEN  =  9 * 60 + 30   // 09:30
  const REG_CLOSE = 16 * 60        // 16:00
  const AH_CLOSE  = 20 * 60        // 20:00

  if (mins >= REG_OPEN && mins < REG_CLOSE) return { state: 'open',   label: LABEL.open   }
  if (mins >= PRE_OPEN && mins < REG_OPEN ) return { state: 'pre',    label: LABEL.pre    }
  if (mins >= REG_CLOSE && mins < AH_CLOSE) return { state: 'after',  label: LABEL.after  }
  return { state: 'closed', label: LABEL.closed }
}

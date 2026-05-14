export default function KairoLogo({ size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Kairo logo"
    >
      {/* Ghost bar charts — subtle background columns */}
      <rect x="2" y="31" width="7" height="11" rx="1.5" fill="#1D9E75" opacity="0.13" />
      <rect x="12" y="24" width="7" height="18" rx="1.5" fill="#1D9E75" opacity="0.13" />
      <rect x="22" y="15" width="7" height="27" rx="1.5" fill="#1D9E75" opacity="0.13" />

      {/* Rising chart line leading into the K */}
      <polyline
        points="5,38 15,30 26,21"
        stroke="#1D9E75"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />

      {/* K — vertical stroke */}
      <line x1="32" y1="6" x2="32" y2="38" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" />

      {/* K — upper diagonal arm (rises to glowing dot) */}
      <line x1="32" y1="21" x2="48" y2="6" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" />

      {/* K — lower diagonal arm */}
      <line x1="32" y1="21" x2="48" y2="38" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" />

      {/* Glowing dot at peak of upper arm */}
      <circle cx="48" cy="6" r="8" fill="#1D9E75" opacity="0.08" />
      <circle cx="48" cy="6" r="5" fill="#1D9E75" opacity="0.2" />
      <circle cx="48" cy="6" r="2.8" fill="#1D9E75" />
    </svg>
  )
}

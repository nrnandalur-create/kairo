import { useAuth } from '../hooks/useAuth'

// ═══════════════════════════════════════════════════════════════════════════
// PAYWALL VEIL — HARDCODED, USER-SETTING-INDEPENDENT
// ═══════════════════════════════════════════════════════════════════════════
// Locked Pro content is obscured by THREE layered effects, all applied via
// inline `style` props with literal RGBA / px values. None of them reference
// the app's --glass-mult, --c-glass-*, or any other CSS variable that can
// be user-adjusted from Settings → Translucence. Reducing the translucence
// slider to zero has ZERO effect on this veil.
//
// The three layers, bottom to top:
//   1. The locked children rendered with:
//        filter:  blur(24px) saturate(0) brightness(0.5)   ← literal, hardcoded
//        opacity: 0.25                                     ← literal, hardcoded
//      Blur removes text legibility; saturate(0) drops all color info so a
//      green/red badge or candlestick can't be identified; brightness(0.5)
//      + opacity(0.25) push the whole layer close to the background.
//   2. Solid dark wash rgba(8, 12, 10, 0.88) covering the entire lock area.
//      This is the app's dark-mode background near-opaque — even if the
//      blurred layer somehow leaks color, the wash absorbs it. Literal RGBA.
//   3. Fully opaque CTA card (rgba(15, 22, 17, 0.98)) with its own tighter
//      backdrop blur. Does NOT use .glass-strong; that class reads
//      --glass-mult and would let the slider make the CTA transparent.
//
// DO NOT wire this veil to any theme token, preference, or slider in a
// future refactor. It is a business gate, not a decorative element.
// ═══════════════════════════════════════════════════════════════════════════

const LOCKED_CHILDREN_STYLE = {
  // Hardcoded — never read from a CSS variable.
  filter:  'blur(24px) saturate(0) brightness(0.5)',
  opacity: 0.25,
}

const DARK_WASH_STYLE = {
  // Kairo's dark-mode --c-bg is #080c0a — hardcoded here as literal RGBA
  // so the wash cannot be diluted by any slider or theme toggle.
  backgroundColor: 'rgba(8, 12, 10, 0.88)',
}

const CTA_CARD_STYLE = {
  // Literal near-opaque background so the CTA remains fully legible even
  // if the user drops --glass-mult to zero. Own backdropFilter for a small
  // frosted edge effect, independent of the veil beneath.
  backgroundColor: 'rgba(15, 22, 17, 0.98)',
  backdropFilter:  'blur(24px) saturate(150%)',
  WebkitBackdropFilter: 'blur(24px) saturate(150%)',
  border: '1px solid rgba(34, 181, 133, 0.30)',
  boxShadow: '0 20px 60px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255,255,255,0.04)',
}

// Reusable lock overlay. Renders `children` behind a completely opaque
// upgrade CTA. The blurred layer stays 100% illegible regardless of the
// user's translucence slider — see comment block above.
//
// Props
//   title    — short lock headline
//   subtitle — one-sentence value description
//   size     — 'sm' | 'md' (padding + typography)
//   onGoPro  — override navigation callback (default: /pricing)
export default function UpgradeOverlay({
  title = 'Kairo Pro feature',
  subtitle,
  size = 'md',
  onGoPro,
  children,
}) {
  const { user } = useAuth()

  const handleUpgrade = () => {
    if (onGoPro) return onGoPro()
    window.location.assign('/pricing')
  }

  const cardPad   = size === 'sm' ? 'p-3.5' : 'p-4 sm:p-5'
  const titleSize = size === 'sm' ? 'text-[13px]' : 'text-base'

  return (
    <div className="relative w-full overflow-hidden rounded-xl" data-paywall="locked">
      {/* Layer 1 — Locked content, blurred + desaturated + dimmed. */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={LOCKED_CHILDREN_STYLE}
      >
        {children}
      </div>

      {/* Layer 2 — Solid dark wash. Kills any remaining color / brightness
          leakage from the blurred layer. Sits above the children, beneath
          the CTA. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={DARK_WASH_STYLE}
      />

      {/* Layer 3 — The one thing the user is meant to read: the CTA card.
          Uses a literal near-opaque background so it stays legible even
          with the translucence slider at its lowest setting. */}
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div
          className={`rounded-xl ${cardPad} flex flex-col gap-3 max-w-[420px] w-full items-start`}
          style={CTA_CARD_STYLE}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#22B585]/15 text-[#22B585] border border-[#22B585]/40 uppercase tracking-widest">
              Pro
            </span>
            <span className={`${titleSize} font-bold text-white`}>{title}</span>
          </div>

          {subtitle && (
            <p className="text-[12.5px] text-white/85 leading-relaxed">{subtitle}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap w-full pt-1">
            <button
              type="button"
              onClick={handleUpgrade}
              className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.97] text-white font-semibold text-[13px] px-4 py-2 rounded-lg transition-all duration-150 cursor-pointer"
            >
              Upgrade to Pro
            </button>
            <span className="text-[11px] text-white/60">
              $12.99/mo · cancel anytime
            </span>
            {!user && (
              <span className="text-[10px] text-white/50 ml-auto">
                Sign in to upgrade
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

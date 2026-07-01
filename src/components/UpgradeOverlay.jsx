import { useAuth } from '../hooks/useAuth'

// Reusable lock overlay. Renders `children` blurred behind a call-to-action
// card. Used to gate the AI Analysis panel, the Insider/Options/Covered
// Calls tabs, and the AI Recommendation card past its daily free reveal.
//
// Props
//   title    — short lock headline, e.g. "AI Analysis"
//   subtitle — one-sentence value description shown under the title
//   size     — 'sm' | 'md' (padding + typography scale)
//   onGoPro  — callback that navigates to /pricing. If omitted, the button
//              triggers window.location.assign('/pricing').
//   children — the locked content. Rendered blurred underneath.
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

  const cardPad = size === 'sm' ? 'p-3' : 'p-4 sm:p-5'
  const titleSize = size === 'sm' ? 'text-[13px]' : 'text-base'

  return (
    <div className="relative w-full">
      {/* Blurred, non-interactive content behind the CTA. `pointer-events-none`
          keeps clicks / focus / hover on the underlying UI from leaking
          through the veil. */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={{ filter: 'blur(6px)', opacity: 0.55 }}
      >
        {children}
      </div>

      {/* Frosted CTA sitting on top of the blurred content. */}
      <div className="absolute inset-0 flex items-center justify-center rounded-xl overflow-hidden">
        <div
          className={`glass-strong rounded-xl ${cardPad} flex flex-col gap-3 max-w-[420px] w-[92%] items-start`}
          style={{ boxShadow: '0 12px 40px -8px rgba(0,0,0,0.55)' }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#22B585]/12 text-[#22B585] border border-[#22B585]/30 uppercase tracking-widest">
              Pro
            </span>
            <span className={`${titleSize} font-bold text-[var(--c-text-strong)]`}>{title}</span>
          </div>

          {subtitle && (
            <p className="text-[12.5px] text-[var(--c-text)]/80 leading-relaxed">{subtitle}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap w-full pt-1">
            <button
              type="button"
              onClick={handleUpgrade}
              className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.97] text-white font-semibold text-[13px] px-4 py-2 rounded-lg transition-all duration-150 cursor-pointer"
            >
              Upgrade to Pro
            </button>
            <span className="text-[11px] text-[var(--c-text-faint)]">
              $12.99/mo · cancel anytime
            </span>
            {!user && (
              <span className="text-[10px] text-[var(--c-text-fainter)] ml-auto">
                Sign in to upgrade
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import KairoLogo from './KairoLogo'
import { LEGAL_DOCS, LEGAL_LINKS, CONTACT_EMAIL } from '../content/legal'

// Full-page renderer for the legal documents (Privacy, Terms, Refund, Cookies).
// Routed from App.jsx by pathname. Uses high-contrast body tokens and proper
// heading hierarchy (h1 → h2) for accessibility.
export default function LegalPage({ slug }) {
  const doc = LEGAL_DOCS[slug]
  if (!doc) {
    if (typeof window !== 'undefined') window.location.assign('/')
    return null
  }

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col">
      {/* Header — matches the Pricing page chrome */}
      <header className="border-b border-[var(--c-border)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <a href="/" aria-label="Back to Kairo home" className="flex items-center gap-2">
            <KairoLogo size={28} />
            <span className="font-serif font-bold text-lg text-[var(--c-text-strong)] tracking-tight">kairo</span>
          </a>
          <span className="ml-auto text-[10px] tracking-widest uppercase text-[var(--c-text-muted)]">Legal</span>
        </div>
      </header>

      <main id="main-content" className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[var(--c-text-strong)] tracking-tight">
          {doc.title}
        </h1>
        <p className="mt-1 text-[12px] text-[var(--c-text-muted)]">Last updated: {doc.updated}</p>

        {doc.intro && (
          <p className="mt-5 text-[14px] leading-relaxed text-[var(--c-text)]">{doc.intro}</p>
        )}

        <div className="mt-8 flex flex-col gap-7">
          {doc.sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-2">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#22B585]">
                {section.heading}
              </h2>
              {section.body?.map((p, i) => (
                <p key={i} className="text-[14px] leading-relaxed text-[var(--c-text)]">
                  {renderWithEmail(p)}
                </p>
              ))}
              {section.list && (
                <ul className="mt-1 flex flex-col gap-1.5 list-disc pl-5">
                  {section.list.map((item, i) => (
                    <li key={i} className="text-[14px] leading-relaxed text-[var(--c-text)]">
                      {renderWithEmail(item)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* Cross-links to the other documents */}
        <nav aria-label="Other legal documents" className="mt-12 pt-6 border-t border-[var(--c-border)] flex flex-wrap items-center gap-x-4 gap-y-2">
          {LEGAL_LINKS.filter(l => l.slug !== slug).map(l => (
            <a
              key={l.slug}
              href={`/${l.slug}`}
              className="text-[12px] font-semibold text-[var(--c-text-muted)] hover:text-[#22B585] transition-colors underline underline-offset-2"
            >
              {l.label}
            </a>
          ))}
          <a href="/" className="text-[12px] font-semibold text-[var(--c-text-muted)] hover:text-[#22B585] transition-colors underline underline-offset-2">
            Home
          </a>
        </nav>
      </main>

      <footer className="border-t border-[var(--c-border)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 text-[11px] text-[var(--c-text-muted)] flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>© {new Date().getFullYear()} Kairo</span>
          <span aria-hidden="true">·</span>
          <span>Educational tool — not financial advice.</span>
          <span aria-hidden="true">·</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-[#22B585] transition-colors underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  )
}

// Turn a bare support email inside prose into a clickable mailto link, keeping
// the surrounding text intact. Purely presentational.
function renderWithEmail(text) {
  const idx = text.indexOf(CONTACT_EMAIL)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#22B585] hover:underline underline-offset-2">
        {CONTACT_EMAIL}
      </a>
      {text.slice(idx + CONTACT_EMAIL.length)}
    </>
  )
}

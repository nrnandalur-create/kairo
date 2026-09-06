// Legal document content for Kairo (kairo-investing.com).
//
// IMPORTANT (for the operator): these are practical, tailored templates — NOT a
// substitute for a lawyer's review, which is strongly recommended for a
// financial product. Two things you MUST personalize before relying on them:
//   1. GOVERNING_LAW_STATE — your US home state (used in the Terms).
//   2. Confirm CONTACT_EMAIL is monitored.
// Rendered by src/components/LegalPage.jsx and routed from src/App.jsx.

export const CONTACT_EMAIL = 'kairoinvesting@gmail.com'
export const LAST_UPDATED = 'September 6, 2026'
export const GOVERNING_LAW_STATE = 'Nevada'

// Section shape: { heading, body: string[] , list?: string[] }
// body paragraphs render as <p>; list renders as a <ul>.

const privacy = {
  slug: 'privacy',
  title: 'Privacy Policy',
  updated: LAST_UPDATED,
  intro:
    `This Privacy Policy explains what information Kairo ("Kairo", "we", "us") collects when you use ` +
    `kairo-investing.com and the Kairo web application (the "Service"), how we use it, and the choices you have. ` +
    `Kairo is operated by an individual based in the United States. Questions: ${CONTACT_EMAIL}.`,
  sections: [
    {
      heading: 'Information we collect',
      body: ['We collect only what we need to run the Service:'],
      list: [
        'Account data: your email address, and a password (stored, hashed, by our authentication provider) or a Google sign-in identifier if you use Google to log in.',
        'App data you create: your watchlist, portfolio holdings you enter (ticker, shares, optional cost basis), saved alerts and email preferences, AI verdict history, paper-trading entries, and conviction notes.',
        'Payment data: if you subscribe to Kairo Pro, payments are handled by Stripe. Kairo never receives or stores your full card number — Stripe does. We store a Stripe customer/subscription identifier and your plan status.',
        'On-device data: preferences, recently viewed tickers, follow-up chat history, and quota counters are stored in your browser\'s localStorage on your device.',
        'Technical data: basic, privacy-friendly usage and performance metrics via Vercel Analytics and Speed Insights, which are cookieless and do not identify you individually.',
      ],
    },
    {
      heading: 'How we use it',
      body: ['We use your information to:'],
      list: [
        'Provide and operate the Service (authenticate you, show your watchlist/portfolio, generate AI analysis).',
        'Process subscriptions and manage billing through Stripe.',
        'Send transactional emails you opt into (e.g., morning briefs, price/signal alerts).',
        'Maintain security, prevent abuse, and enforce free-tier usage limits.',
        'Understand aggregate, non-identifying usage to improve performance.',
      ],
    },
    {
      heading: 'Service providers we share with',
      body: [
        'We do not sell your personal information and we do not use it for third-party advertising. We share limited data with providers strictly to run the Service:',
      ],
      list: [
        'Supabase — account authentication and database storage.',
        'Stripe — payment processing and subscription management.',
        'Groq — AI model inference. We send market context (e.g., ticker, indicators, recent prices) and your typed questions for chat; we do not send your identity.',
        'Market data providers (Finnhub, Alpha Vantage, Polygon, Yahoo Finance) — to retrieve quotes, fundamentals, news, and options data.',
        'Resend — to deliver transactional emails you have opted into.',
        'Vercel — hosting, plus cookieless analytics and performance monitoring.',
        'Google Fonts — fonts are served by Google, which receives your IP address as part of delivering them.',
      ],
    },
    {
      heading: 'Cookies and tracking',
      body: [
        'Kairo does not use advertising or cross-site tracking cookies. We keep you signed in using a token stored in your browser (localStorage), not a tracking cookie. Our analytics are cookieless. Stripe may set cookies on its own checkout pages when you subscribe. See our Cookie & Tracking Notice for details.',
      ],
    },
    {
      heading: 'Data retention',
      body: [
        'We keep your account and app data while your account is active. You can delete individual items (watchlist, portfolio, alerts) in the app at any time, and you can request full account deletion by emailing us. On-device localStorage can be cleared from your browser at any time.',
      ],
    },
    {
      heading: 'Your choices and rights',
      body: [
        `You can access, correct, or delete your data, opt out of non-essential emails, and close your account. To make a request, email ${CONTACT_EMAIL}. Depending on where you live (for example, California residents under the CCPA), you may have additional rights, including the right to know what we collect and to request deletion; we honor these requests and will not discriminate against you for exercising them.`,
      ],
    },
    {
      heading: 'Security',
      body: [
        'We use industry-standard measures including encrypted transport (HTTPS), hashed passwords, row-level database security, and token-based authentication. No method of transmission or storage is perfectly secure, so we cannot guarantee absolute security.',
      ],
    },
    {
      heading: 'Children',
      body: [
        'The Service is intended for adults (18+) and is not directed to children. We do not knowingly collect information from anyone under 18.',
      ],
    },
    {
      heading: 'Changes to this policy',
      body: [
        'We may update this policy from time to time. Material changes will be reflected by updating the "Last updated" date above, and where appropriate we will provide additional notice.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions about privacy? Email ${CONTACT_EMAIL}.`],
    },
  ],
}

const terms = {
  slug: 'terms',
  title: 'Terms of Service',
  updated: LAST_UPDATED,
  intro:
    `These Terms of Service ("Terms") govern your use of kairo-investing.com and the Kairo web application ` +
    `(the "Service"), operated by an individual based in the United States ("Kairo", "we", "us"). By using the ` +
    `Service you agree to these Terms. If you do not agree, do not use the Service.`,
  sections: [
    {
      heading: 'Not financial advice',
      body: [
        'Kairo is an educational and informational tool only. Nothing on the Service is investment, financial, legal, or tax advice, a recommendation, or a solicitation or offer to buy or sell any security. AI-generated verdicts, confidence scores, entry/stop levels, and analysis are automated outputs that can be incomplete, delayed, or wrong. You are solely responsible for your own investment decisions and should consult a licensed professional and do your own research before acting.',
      ],
    },
    {
      heading: 'No adviser or broker relationship',
      body: [
        'Kairo is not a registered investment adviser, broker-dealer, or financial planner, and using the Service does not create any advisory, brokerage, or fiduciary relationship. We do not manage assets, execute trades, or provide personalized advice tailored to your circumstances.',
      ],
    },
    {
      heading: 'Eligibility and accounts',
      body: [
        'You must be at least 18 years old to use the Service. You are responsible for keeping your login credentials secure and for all activity under your account. Provide accurate information and keep it up to date.',
      ],
    },
    {
      heading: 'Subscriptions and billing',
      body: [
        'Kairo offers a free tier and a paid "Kairo Pro" subscription billed through Stripe on a recurring monthly or annual basis. By subscribing you authorize recurring charges until you cancel. You can cancel anytime through the Stripe customer portal; cancellation stops future renewals and your Pro access continues until the end of the current paid period. Prices are shown at checkout and may change with advance notice for future billing periods. Refunds are governed by our Refund & Cancellation Policy.',
      ],
    },
    {
      heading: 'Acceptable use',
      body: ['You agree not to:'],
      list: [
        'Use the Service unlawfully or to violate the rights of others.',
        'Attempt to bypass usage limits, authentication, security, or access controls.',
        'Scrape, resell, or redistribute data or AI outputs except as permitted.',
        'Interfere with or disrupt the Service or its infrastructure.',
      ],
    },
    {
      heading: 'Market data and third parties',
      body: [
        'Quotes, fundamentals, news, and options data come from third-party providers and may be delayed (for example, up to 15 minutes) and are not guaranteed to be accurate, complete, or timely. Kairo is not responsible for third-party data or services. Your use of Stripe and other providers is also subject to their terms.',
      ],
    },
    {
      heading: 'Intellectual property',
      body: [
        'The Service, including its software, design, and branding, is owned by Kairo and protected by law. We grant you a limited, non-exclusive, non-transferable license to use the Service for your personal, non-commercial purposes. Data provided by third parties remains theirs.',
      ],
    },
    {
      heading: 'Disclaimer of warranties',
      body: [
        'The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, non-infringement, accuracy, or uninterrupted availability, to the fullest extent permitted by law.',
      ],
    },
    {
      heading: 'Limitation of liability',
      body: [
        'To the fullest extent permitted by law, Kairo will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any trading or investment losses, lost profits, or lost data, arising from your use of (or inability to use) the Service. Our total liability for any claim relating to the Service will not exceed the greater of the amount you paid us in the twelve months before the claim or US $50.',
      ],
    },
    {
      heading: 'Indemnification',
      body: [
        'You agree to indemnify and hold Kairo harmless from claims, losses, and expenses (including reasonable legal fees) arising from your use of the Service or your violation of these Terms.',
      ],
    },
    {
      heading: 'Termination',
      body: [
        'You may stop using the Service at any time. We may suspend or terminate access if you violate these Terms or to protect the Service. Provisions that by their nature should survive termination (including disclaimers, limitation of liability, and indemnification) will survive.',
      ],
    },
    {
      heading: 'Governing law',
      body: [
        `These Terms are governed by the laws of the State of ${GOVERNING_LAW_STATE}, United States, without regard to conflict-of-laws rules. You agree to the exclusive jurisdiction of the state and federal courts located there, except where prohibited by applicable law.`,
      ],
    },
    {
      heading: 'Changes to these Terms',
      body: [
        'We may update these Terms from time to time. Continued use after changes take effect constitutes acceptance. We will update the "Last updated" date and, for material changes, provide additional notice where appropriate.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions about these Terms? Email ${CONTACT_EMAIL}.`],
    },
  ],
}

const refund = {
  slug: 'refund',
  title: 'Refund & Cancellation Policy',
  updated: LAST_UPDATED,
  intro:
    'This policy explains cancellations and refunds for the Kairo Pro subscription.',
  sections: [
    {
      heading: 'Cancel anytime',
      body: [
        'You can cancel Kairo Pro at any time from the Stripe customer portal (Account → Billing → Manage subscription). When you cancel, you will not be charged again, and your Pro access continues until the end of the billing period you already paid for.',
      ],
    },
    {
      heading: 'Refunds',
      body: [
        'Kairo Pro is a digital subscription. Payments are generally non-refundable, including for partial billing periods, because you keep access through the end of the period you paid for. We do not provide pro-rated refunds for unused time.',
      ],
    },
    {
      heading: 'Exceptions',
      body: [
        `We want you to be happy with Kairo. If you were charged in error (for example, a duplicate charge or a failure to deliver the Service), or you believe there are special circumstances, email ${CONTACT_EMAIL} and we will review your request in good faith. Any refunds granted are issued through Stripe to your original payment method. Nothing in this policy limits rights you may have under applicable consumer-protection law.`,
      ],
    },
    {
      heading: 'Contact',
      body: [`Billing questions? Email ${CONTACT_EMAIL}.`],
    },
  ],
}

const cookies = {
  slug: 'cookies',
  title: 'Cookie & Tracking Notice',
  updated: LAST_UPDATED,
  intro:
    'This notice explains how Kairo uses cookies and similar technologies. In short: we do not use cookies for advertising or cross-site tracking.',
  sections: [
    {
      heading: 'What we use',
      body: ['Kairo relies on the minimum needed to function:'],
      list: [
        'Essential storage: we keep you signed in using a token stored in your browser\'s localStorage (not a cookie). We also store preferences, recent tickers, and free-tier quota counters on your device.',
        'Cookieless analytics: Vercel Analytics and Speed Insights measure aggregate usage and performance without cookies and without identifying you.',
        'Payments: when you subscribe, Stripe\'s checkout pages may set their own cookies to process the transaction securely. These are governed by Stripe\'s policies.',
        'Fonts: Google Fonts are served by Google, which receives your IP address to deliver the fonts.',
      ],
    },
    {
      heading: 'Consent',
      body: [
        'Because we do not use advertising or tracking cookies, no cookie-consent banner is required to use Kairo. You can clear on-device storage anytime from your browser settings; note that clearing it will sign you out and reset local preferences.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions? Email ${CONTACT_EMAIL}.`],
    },
  ],
}

export const LEGAL_DOCS = { privacy, terms, refund, cookies }

// Footer link order.
export const LEGAL_LINKS = [
  { slug: 'privacy', label: 'Privacy' },
  { slug: 'terms',   label: 'Terms' },
  { slug: 'refund',  label: 'Refunds' },
  { slug: 'cookies', label: 'Cookies' },
]

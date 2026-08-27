// Provide harmless default env so modules that read process.env at import time
// (lib/auth, api/stripe, …) construct without throwing. Real secrets are never
// used — every external client is mocked in the individual test files. `??=`
// avoids clobbering anything a real environment already set.
process.env.SUPABASE_URL              ??= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
process.env.CRON_SECRET               ??= 'test-cron-secret'
process.env.GROQ_API_KEY              ??= 'test-groq-key'

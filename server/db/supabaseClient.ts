import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side client only. Uses the service_role key, which bypasses RLS entirely --
// authorization for this app is enforced in Express middleware (see server/middleware/authorize.ts),
// not in Postgres. This client must never be imported by frontend code.
//
// Lazily initialized (rather than read at module-import time) because ES module
// imports are hoisted and evaluated before dotenv.config() runs in the entry files
// (server.ts / api/index.ts) -- reading process.env at the top of this module would
// see undefined values even when .env is correctly populated.
let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env (server-side only -- ' +
      'never expose the service_role key to the frontend).'
    );
  }

  cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

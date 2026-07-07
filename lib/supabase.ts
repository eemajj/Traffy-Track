import { createClient } from "@supabase/supabase-js";

import { env, hasSupabaseAdminEnv, hasSupabaseBrowserEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return createClient(env.supabaseUrl, env.supabaseAnonKey);
}

export function createSupabaseAdminClient() {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export const env = {
  appPasscode: process.env.APP_PASSCODE || "",
  authCookieName: process.env.APP_AUTH_COOKIE || "citydata-passcode",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
};

export function requireAppPasscode() {
  if (!env.appPasscode) {
    throw new Error("Missing required environment variable: APP_PASSCODE");
  }

  return env.appPasscode;
}

export function hasSupabaseBrowserEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function hasSupabaseAdminEnv() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

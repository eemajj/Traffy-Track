export const env = {
  appPasscode: process.env.APP_PASSCODE || "",
  appAdminPasscode: process.env.APP_ADMIN_PASSCODE || "",
  appPasscodePepper: process.env.APP_PASSCODE_PEPPER || "",
  authCookieName: process.env.APP_AUTH_COOKIE || "citydata-passcode",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  cronSecret: process.env.CRON_SECRET || "",
  appEnvironment: process.env.APP_ENV || "",
  vercelEnvironment: process.env.VERCEL_ENV || "",
  nodeEnvironment: process.env.NODE_ENV || ""
};

export type AppEnvironment = "local" | "development" | "preview" | "staging" | "production";

export function getAppEnvironment(): AppEnvironment {
  const explicitEnvironment = env.appEnvironment.toLowerCase();

  if (["local", "development", "preview", "staging", "production"].includes(explicitEnvironment)) {
    return explicitEnvironment as AppEnvironment;
  }

  if (env.vercelEnvironment === "production") {
    return "production";
  }

  if (env.vercelEnvironment === "preview") {
    return "preview";
  }

  if (env.vercelEnvironment === "development") {
    return "development";
  }

  return env.nodeEnvironment === "production" ? "production" : "local";
}

export function getDeploymentInfo() {
  const appEnvironment = getAppEnvironment();

  return {
    appEnvironment,
    vercelEnvironment: env.vercelEnvironment || "local",
    nodeEnvironment: env.nodeEnvironment || "development",
    isProduction: appEnvironment === "production"
  };
}

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
